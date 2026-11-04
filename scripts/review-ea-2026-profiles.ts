import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CaptureQueue, sha256 } from './lib/ea2026Capture.js';
import { assessRelease, PROFILE_FIELDS, type ReleaseInput, type Source, type CandidateProfile } from './lib/ea2026Release.js';
import { verifyEaSourceCaptures } from './lib/ea2026SourceEvidence.js';
const args = process.argv.slice(2);
const option = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const inputPath = option('--input'), reviewPath = option('--reviews'), captures = option('--captures'), output = option('--out');
if (!inputPath || !reviewPath || !captures || !output) throw new Error('--input, --reviews, --captures, --out required');
const input: ReleaseInput = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
const review: { sources: Source[]; candidates: { contestId: string; candidateId: string; fields: Partial<CandidateProfile>; externalIds?: { fecCandidateId: string } }[] } = JSON.parse(readFileSync(resolve(reviewPath), 'utf8'));
if (!review.candidates.length || review.candidates.length > 25 || new Set(review.candidates.map(x => x.contestId + '/' + x.candidateId)).size !== review.candidates.length) throw new Error('invalid profile batch');
const queue = new CaptureQueue(resolve(captures), resolve('.artifacts/private/canonical-migration/ea-2026-execution/requests.jsonl'));
for (const source of review.sources) {
  const entry = queue.state.entries[sha256(source.url)];
  if (!entry?.receipt || entry.receipt.sha256 !== source.sha256 || entry.receipt.retrievedAt !== source.retrievedAt) throw new Error('review does not match current capture');
  queue.body(entry.receipt);
  queue.verifyExtraction(source.url);
  if (input.sources.some(s => s.id === source.id)) throw new Error('source ID already exists');
  input.sources.push(source);
}
let fields = 0;
for (const row of review.candidates) {
  const candidate = input.contests.find(c => c.id === row.contestId)?.candidates.find(c => c.id === row.candidateId);
  if (!candidate) throw new Error('review candidate identity missing');
  if (row.externalIds) {
    const fec = row.externalIds.fecCandidateId;
    if (!/^H\d[A-Z]{2}\d{5}$/.test(fec) || input.contests.find(c => c.id === row.contestId)?.office !== 'House' || row.fields.finance?.status !== 'present' || !JSON.stringify(row.fields.finance.value).includes(fec)) throw new Error('FEC mapping requires reviewed House finance evidence');
    if (candidate.externalIds?.fecCandidateId && candidate.externalIds.fecCandidateId !== fec) throw new Error('existing FEC identity conflict');
    candidate.externalIds = { ...candidate.externalIds, fecCandidateId: fec };
  }
  for (const [key, value] of Object.entries(row.fields)) {
    if (!PROFILE_FIELDS.includes(key as any) || !value || value.status === 'unreviewed') throw new Error('invalid reviewed field');
    if (candidate.profile[key]?.status !== 'unreviewed') throw new Error('reviewed field already populated; explicit reconciliation required');
    for (const sourceId of value.sourceIds) {
      const source = input.sources.find(s => s.id === sourceId);
      if (!source) throw new Error('unknown profile source');
      queue.verifyExtraction(source.url);
    }
    candidate.profile[key] = value; fields++;
  }
}
input.asOf = new Date().toISOString();
verifyEaSourceCaptures(input.sources, resolve(captures));
const report = assessRelease(input);
writeFileSync(resolve(output), JSON.stringify(input, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ candidatesTouched: review.candidates.length, fieldsReviewed: fields, profilesComplete: report.profilesReviewed, releaseReady: report.releaseReady }));
