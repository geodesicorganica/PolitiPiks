import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { normalizeOfficialBallotEvidence, parseOfficialBallotSource } from './lib/ballotEligibility.js';
import { buildCanonicalPublicationPlan, validateCanonicalPublicationSnapshot } from './lib/canonicalPublication.js';
import { fetchGeorgia2026GeneralBallotSource } from './lib/gaBallotEligibilityAdapter.js';

const privateRoot = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
type Options = { year: number; state: string; dryRun: boolean; snapshotIn: string; input?: string; fetch: boolean; reportOut?: string };
function privatePath(value: string, label: string) {
  const resolved = resolve(process.cwd(), value); const child = relative(privateRoot, resolved);
  if (!child || child.startsWith('..') || !resolved.toLowerCase().endsWith('.json')) throw new Error(`${label} must be a .json file beneath .artifacts/private/canonical-migration/`);
  return resolved;
}
function parseArgs(args: string[]): Options {
  let year = 2026; let state = 'GA'; let dryRun = true; let snapshotIn: string | undefined; let input: string | undefined; let fetch = false; let reportOut: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--dry-run') { dryRun = true; continue; }
    if (flag === '--fetch') { if (fetch) throw new Error('duplicate --fetch'); fetch = true; continue; }
    if (!['--year', '--state', '--snapshot-in', '--input', '--report-out'].includes(flag)) throw new Error(`unsupported argument: ${flag}`);
    const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    if (flag === '--year') year = Number(value);
    if (flag === '--state') state = value.toUpperCase();
    if (flag === '--snapshot-in') snapshotIn = privatePath(value, '--snapshot-in');
    if (flag === '--input') input = resolve(process.cwd(), value);
    if (flag === '--report-out') reportOut = privatePath(value, '--report-out');
  }
  if (year !== 2026 || state !== 'GA') throw new Error('only the local 2026 Georgia general-election slice is implemented');
  if (!snapshotIn) throw new Error('--snapshot-in is required');
  if (fetch && input) throw new Error('--fetch and --input are mutually exclusive');
  if (!fetch && !input) input = resolve(process.cwd(), 'data/2026/ballot-eligibility/ga-2026-general.json');
  if (reportOut && existsSync(reportOut)) throw new Error('report output already exists; refusing to overwrite evidence');
  return { year, state, dryRun, snapshotIn, ...(input ? { input } : {}), fetch, ...(reportOut ? { reportOut } : {}) };
}

const options = parseArgs(process.argv.slice(2));
const snapshot = validateCanonicalPublicationSnapshot(JSON.parse(readFileSync(options.snapshotIn, 'utf8')));
const basePlan = buildCanonicalPublicationPlan(snapshot.inputs);
const candidates = basePlan.documents.filter((document) => /^races\/[^/]+$/.test(document.path)).flatMap((document) =>
  ((document.data.candidates as Array<Record<string, unknown>>).map((candidate) => ({ canonicalRaceId: document.path.slice('races/'.length), fecCandidateId: String((candidate.externalIds as Record<string, unknown>)?.fecCandidateId ?? ''), name: String(candidate.name ?? ''), party: String(candidate.party ?? '') }))));
const source = options.fetch
  ? await fetchGeorgia2026GeneralBallotSource()
  : parseOfficialBallotSource(JSON.parse(readFileSync(options.input!, 'utf8')));
const evidence = normalizeOfficialBallotEvidence(source, candidates);
const plan = buildCanonicalPublicationPlan(snapshot.inputs, { ballotEligibility: evidence.evidence, unresolvedBallotEvidence: evidence.unresolved, sourceStatus: source.sourceStatus });
const audit = (await import('./lib/canonicalPublication.js')).auditCanonicalPublicationPlan(plan);
const report = { operation: 'offline-ballot-eligibility-report', year: options.year, state: options.state, dryRun: options.dryRun, sourceStatus: source.sourceStatus,
  sourceAuthority: source.sourceAuthority, sourceUrl: source.sourceUrl, evidence: evidence.counts, evidenceDigest: evidence.digest, publication: { planDigest: plan.planDigest, catalogReady: audit.catalogReady, predictionReady: audit.predictionReady, racesPredictionReady: audit.racesPredictionReady, predictionImpact: plan.eligibility.predictionImpact, rejectedEvidence: plan.eligibility.rejected } };
if (options.reportOut) { mkdirSync(privateRoot, { recursive: true }); writeFileSync(options.reportOut, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); }
console.log(JSON.stringify(report, null, 2));
