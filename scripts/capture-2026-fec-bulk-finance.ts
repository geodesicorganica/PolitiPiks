import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { buildCanonicalPublicationPlan, validateCanonicalPublicationSnapshot } from './lib/canonicalPublication.js';
import { buildFecFinanceBaselinePlan } from './lib/fecFinanceDepth.js';
import { FEC_BULK_URL, normalizeFecBulkFinance, validateFecBulkFinanceSnapshot, type CanonicalFecFinanceCandidate, type FecBulkFinanceSnapshot } from './lib/fecBulkFinance.js';
import { parseBulkFinanceArgs } from './lib/fecBulkFinanceCaptureCli.js';

const artifactRoot = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const ignored = () => readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8').includes('.artifacts/private/canonical-migration/');
const writeExclusive = (path: string, value: Buffer | string) => { mkdirSync(artifactRoot, { recursive: true }); writeFileSync(path, value, { flag: 'wx' }); };
function source(value: unknown) { return validateCanonicalPublicationSnapshot(value); }
function canonical(snapshot: ReturnType<typeof source>): CanonicalFecFinanceCandidate[] {
  const plan = buildCanonicalPublicationPlan(snapshot.inputs);
  return plan.documents.filter((document) => /^races\/[^/]+$/.test(document.path)).flatMap((document) => (document.data.candidates as Array<{ id: string }>).flatMap((candidate) => {
    const race = document.data as { id: string; state: string; office: 'House' | 'Senate'; district: string | null };
    const match = /^fec-([HS]\d[A-Z]{2}\d{5})$/.exec(candidate.id); return match ? [{ raceId: race.id, candidateId: candidate.id, fecCandidateId: match[1]!, state: race.state, office: race.office, district: race.district }] : [];
  }));
}
function extract(archive: string): string {
  let entries: string[];
  try { entries = execFileSync('tar.exe', ['-tf', archive], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean); } catch { throw new Error('malformed or truncated ZIP archive'); }
  const matches = entries.filter((entry) => /(^|\/)weball26\.txt$/i.test(entry));
  if (matches.length !== 1) throw new Error(matches.length ? 'multiple candidate-data entries' : 'missing candidate-data entry');
  try { return execFileSync('tar.exe', ['-xOf', archive, matches[0]!], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }); } catch { throw new Error('unable to extract candidate-data entry'); }
}
function report(normalized: FecBulkFinanceSnapshot, snapshot: ReturnType<typeof source>) {
  const plan = buildFecFinanceBaselinePlan(snapshot, normalized.capture);
  return { operation: 'offline-fec-bulk-finance-replay', dryRun: true, firebaseInitialized: false, fecApiCalls: 0, sourceUrl: FEC_BULK_URL, archiveDigest: normalized.archiveDigest, inputDigest: normalized.inputDigest, evidenceDigest: plan.evidenceDigest, planDigest: plan.planDigest, rawRows: normalized.provenance.rawRowCount, houseSenateRows: normalized.provenance.houseSenateRowCount, ignoredPresidentialRows: normalized.provenance.ignoredPresidentialCount, headerPresent: normalized.provenance.headerPresent, matchedCandidates: normalized.matchedCandidates, unavailableCandidates: normalized.unavailableCandidates, coverage: plan.coverage, financeAudit: plan.financeAudit };
}
async function downloadArchive(): Promise<Buffer> {
  let failure: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(FEC_BULK_URL);
      if (response.status >= 400 && response.status < 500) throw new Error(`official bulk HTTP ${response.status}`);
      if (!response.ok) throw new Error(`official bulk HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      failure = error;
      if (String(error).includes('HTTP 4') || attempt === 3) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
  }
  throw failure;
}

const options = parseBulkFinanceArgs(process.argv.slice(2));
const firstInput = JSON.parse(readFileSync(options.snapshotIn, 'utf8'));
if (options.preflight) {
  const publication = source(firstInput);
  const expectedOutput = options.snapshotOut;
  if (!expectedOutput || (!options.archiveIn && !options.archiveOut)) throw new Error('preflight requires --snapshot-out and --archive-in or --archive-out');
  if (options.archiveIn && !existsSync(options.archiveIn)) throw new Error('--archive-in does not exist');
  console.log(JSON.stringify({ operation: 'fec-bulk-finance-preflight', dryRun: true, url: FEC_BULK_URL, archiveIn: options.archiveIn ?? null, archiveOut: options.archiveOut ?? null, snapshotOut: expectedOutput, outputsAbsent: !existsSync(expectedOutput) && (!options.archiveOut || !existsSync(options.archiveOut)), pathsPrivate: true, pathsIgnored: ignored(), canonicalCandidates: canonical(publication).length, firebaseInitialized: false, fecApiCalls: 0 }, null, 2));
} else if (options.publicationSnapshot) {
  const normalized = validateFecBulkFinanceSnapshot(firstInput);
  const publication = source(JSON.parse(readFileSync(options.publicationSnapshot, 'utf8')));
  if (normalized.capture.sourceSnapshotInputDigest !== publication.inputDigest) throw new Error('bulk finance source snapshot digest mismatch');
  const first = report(normalized, publication); if (options.verifyReplay && JSON.stringify(first) !== JSON.stringify(report(normalized, publication))) throw new Error('nondeterministic replay'); console.log(JSON.stringify(first, null, 2));
} else {
  const publication = source(firstInput); const canonicalCandidates = canonical(publication);
  let archive: Buffer;
  if (options.archiveIn) archive = readFileSync(options.archiveIn); else { archive = await downloadArchive(); writeExclusive(options.archiveOut!, archive); }
  const normalized = normalizeFecBulkFinance({ contents: extract(options.archiveIn ?? options.archiveOut!), archiveDigest: sha(archive), capturedAt: new Date().toISOString(), sourceSnapshotInputDigest: publication.inputDigest, canonical: canonicalCandidates });
  const first = report(normalized, publication); if (options.verifyReplay && JSON.stringify(first) !== JSON.stringify(report(normalized, publication))) throw new Error('nondeterministic replay'); writeExclusive(options.snapshotOut!, `${JSON.stringify(normalized, null, 2)}\n`); console.log(JSON.stringify({ ...first, operation: options.archiveIn ? 'offline-fec-bulk-finance-normalize' : 'official-fec-bulk-finance-capture' }, null, 2));
}
