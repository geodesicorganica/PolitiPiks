import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assessRelease, canonical, type ReleaseInput } from './lib/ea2026Release.js';
import { sha256, CaptureQueue } from './lib/ea2026Capture.js';
import { verifyEaSourceCaptures } from './lib/ea2026SourceEvidence.js';
const args = process.argv.slice(2);
const option = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const inputPath = option('--input'), mappingPath = option('--mapping'), captures = option('--captures'), out = option('--out');
if (!inputPath || !mappingPath || !captures || !out) throw new Error('--input, --mapping, --captures, --out required');
const input: ReleaseInput = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
const review = JSON.parse(readFileSync(resolve(mappingPath), 'utf8'));
const registryBytes = readFileSync(resolve('data/2026/statewide-ballot-measures.json'));
if (sha256(registryBytes) !== review.legacyRegistryDigest) throw new Error('legacy registry changed');
const registry = JSON.parse(registryBytes.toString('utf8')).states.find((s: any) => s.state === 'CA');
const measures = input.contests.filter(c => c.state === 'CA' && c.office === 'Measure');
if (review.mappings.length !== measures.length || new Set(review.mappings.map((m: any) => m.stableId)).size !== measures.length || new Set(review.mappings.map((m: any) => m.currentDraftId)).size !== measures.length) throw new Error('identity mapping inventory mismatch');
const queue = new CaptureQueue(resolve(captures), resolve('.artifacts/private/canonical-migration/ea-2026-execution/requests.jsonl'));
const certification = Object.values(queue.state.entries).find(e => e.url.includes('certifies-measures-november-3-2026'));
if (!certification?.receipt) throw new Error('certification capture required');
queue.body(certification.receipt);
const now = new Date().toISOString(), sourceId = 'ca-measure-certification-identities';
input.sources.push({ id: sourceId, url: certification.url, sha256: certification.receipt.sha256, retrievedAt: certification.receipt.retrievedAt, reviewedAt: now, reviewer: review.reviewer, kind: 'election_authority', authority: 'California Secretary of State', locator: 'June 25, 2026 official certification list: five legislative bill identities and nine initiative identifiers matched by subject to current voter-guide summaries. Historical internal IDs are retained; official ballot numbers are separate labels.' });
// Resolve every mapping before changing any ID, because this mapping is a permutation.
const changes = review.mappings.map((m: any) => {
  const contest = measures.find(c => c.id === m.currentDraftId);
  const old = registry.measures.find((c: any) => c.canonicalId === m.stableId);
  if (!contest || !old || old.officialTitle !== m.legacyTitle || canonical(old.officialAliases) !== canonical(m.officialAliases) || !contest.sourceIds.includes(`ca-guide-2026-proposition-${m.officialNumber.replace('Proposition ', '')}`)) throw new Error('identity mapping does not match reviewed inventories');
  return { contest, mapping: m };
});
for (const { contest, mapping } of changes) {
  contest.id = mapping.stableId;
  contest.measureIdentity = { officialNumber: mapping.officialNumber, officialAliases: mapping.officialAliases, legacyTitle: mapping.legacyTitle, legacyRegistryDigest: review.legacyRegistryDigest, sourceIds: [sourceId, ...contest.sourceIds] };
}
const scope = input.coverage.find(c => c.state === 'CA')!.scopes.Measure;
scope.expectedContestIds = measures.map(c => c.id).sort();
scope.reason = 'Official ballot numbers reconciled to legacy underlying measure IDs. Publication still requires exact before-image identity and league/pick compatibility verification.';
input.asOf = now;
verifyEaSourceCaptures(input.sources, resolve(captures));
const result = assessRelease(input);
writeFileSync(resolve(out), JSON.stringify(input, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ stableIdentities: changes.length, changedDraftIds: changes.filter((x: any) => x.mapping.stableId !== x.mapping.currentDraftId).length, releaseReady: result.releaseReady }));
