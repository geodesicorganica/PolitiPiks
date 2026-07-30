import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditRegistry, normalizeRegistry, registryDigest } from './stateElectionSourceRegistry.js';
import { WAVE_D_STATES, normalizeWaveDEvidence } from './waveDSourceResolution.js';
import { assertStateElectionProviderRegistry } from '../../ingest/src/sources/stateElectionProvider.js';

const registry = JSON.parse(readFileSync('data/2026/state-election-source-registry.json', 'utf8'));
const audit = auditRegistry(registry);
assert.equal(normalizeRegistry(registry).states.length, 50);
assert.equal(audit.counts.wave.D, 36);
assert.equal(registryDigest({ ...registry, states:[...registry.states].reverse() }), audit.registryDigest);
assert.throws(() => normalizeRegistry({ ...registry, states:registry.states.slice(1) }), /50|missing/);
assert.throws(() => normalizeRegistry({ ...registry, states:[...registry.states, registry.states[0]] }), /50/);
const insecure = structuredClone(registry); insecure.states[0].authorityUrl = 'http://bad.example'; assert.throws(() => normalizeRegistry(insecure), /invalid/);
const none = structuredClone(registry); none.states[0].publicationStatus = 'officially_none'; none.states[0].evidenceUrls = []; assert.throws(() => normalizeRegistry(none), /invalid|officially_none/);

for (const state of WAVE_D_STATES) {
  const evidence = normalizeWaveDEvidence(JSON.parse(readFileSync(`data/2026/wave-d-reviewed/${state}.json`, 'utf8')));
  const row = registry.states.find((item: any) => item.state === state);
  assert.equal(row.reviewedEvidenceVersion, 1);
  assert.equal(row.reviewedEvidenceDigest, evidence.evidenceDigest);
  assert.deepEqual([...row.evidenceUrls].sort(), evidence.capabilities.map((item) => item.endpoint).sort());
  assert.match(row.nextReviewAt, /^2026-/);
  assert.doesNotMatch(row.reason, /publication endpoints require review/i);
}
const missingWaveDReview = structuredClone(registry); delete missingWaveDReview.states.find((item: any) => item.state === 'AL').nextReviewAt; assert.throws(() => normalizeRegistry(missingWaveDReview), /Wave D/);
console.log('state election source registry tests passed');

const ca = registry.states.find((item: any) => item.state === 'CA');
const provider = { id:'ca-fixture', state:'CA', label:'CA', officialBaseUrl:ca.authorityUrl, capabilities:['statewideMeasures'] as const, load:async () => ({ races:[], ballotMeasures:[] }) };
assert.doesNotThrow(() => assertStateElectionProviderRegistry(provider, { state:'CA', authorityUrl:ca.authorityUrl, capabilities:['statewideMeasures'], adapterStatus:'fixture_proven' }));
const ri = registry.states.find((item: any) => item.state === 'RI'); assert.equal(ri.adapterStatus, 'implemented'); assert.equal(ri.extractionMode, 'reviewed_text_fixture');
