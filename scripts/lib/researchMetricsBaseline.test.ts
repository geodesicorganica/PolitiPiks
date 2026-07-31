import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCanonicalPublicationSnapshot } from './canonicalPublication.js';
import { buildResearchMetricsBaseline, validateResearchMetricsBaselineSnapshot } from './researchMetricsBaseline.js';

const snapshot = validateResearchMetricsBaselineSnapshot(JSON.parse(readFileSync('.artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json', 'utf8')));
const plan = buildResearchMetricsBaseline(snapshot);
assert.equal(plan.coverage.rawRaces, 467, 'the captured source remains evidence, not the output registry');
assert.equal(plan.coverage.canonicalRaces, 470, 'the certified registry controls baseline coverage');
assert.equal(plan.coverage.candidateResearch.documents, 2384, 'every canonical candidate has research');
assert.equal(plan.coverage.candidateResearch.richPreserved, 537, 'the richer canonical research set is retained');
assert.equal(plan.coverage.candidateResearch.baselineOnly, 1847, 'the balance receives the minimal FEC baseline');
assert.equal(plan.coverage.measureResearch.documents, 14, 'every certified canonical measure has baseline research');
assert.equal(((plan.documents.find((document) => document.path.startsWith('ballotMeasures/'))!.data.baselineResearch as Record<string, any>).fields.sourceHistory.availability), 'present', 'measure provenance retains its official source history');
assert.equal(plan.coverage.metrics.documents, 470, 'every canonical race has metrics');
assert.deepEqual(plan.coverage.metrics.coverageOnlyRaceIds, ['2026-AK-house-al', '2026-DE-house-al', '2026-ND-house-al', '2026-SD-house-al', '2026-VT-house-al', '2026-WY-house-al']);
assert.equal(plan.audit.orphanDocuments, 0); assert.equal(plan.audit.duplicateDocuments, 0); assert.equal(plan.audit.leakage, 0);
assert.equal(plan.evidenceDigest.length, 64); assert.equal(plan.planDigest.length, 64);
const baselineOnly = plan.documents.find((document) => document.path.includes('/candidateResearch/') && 'baselineResearch' in document.data && !('buckets' in document.data))!;
const fields = (baselineOnly.data.baselineResearch as Record<string, any>).fields;
assert.equal(fields.identity.availability, 'present'); assert.equal(fields.finance.availability, 'unavailable'); assert.equal(fields.rollCall.availability, 'not_applicable');
assert.equal('body' in fields.identity, false, 'baseline never generates political prose');
assert.equal(JSON.stringify(fields).includes('"value":0'), false, 'baseline never fills evidence gaps with zeroes');
const reordered = buildCanonicalPublicationSnapshot({ ...snapshot.inputs, projectId: snapshot.projectId, databaseId: snapshot.databaseId, capturedAt: snapshot.capturedAt,
  races: [...snapshot.inputs.races].reverse(), candidateResearch: [...snapshot.inputs.candidateResearch].reverse(), contestMetrics: [...snapshot.inputs.contestMetrics].reverse(), predictions: [...snapshot.inputs.predictions].reverse(), deadlines: [...snapshot.inputs.deadlines].reverse(),
} as any);
const replay = buildResearchMetricsBaseline(reordered);
assert.equal(replay.inputDigest, plan.inputDigest, 'source ordering does not change the input digest'); assert.equal(replay.evidenceDigest, plan.evidenceDigest); assert.equal(replay.planDigest, plan.planDigest, 'replay is deterministic');
assert.throws(() => validateResearchMetricsBaselineSnapshot({ ...snapshot, inputDigest: '0'.repeat(64) }), /digest/, 'tampered snapshots fail closed');
const duplicate = buildCanonicalPublicationSnapshot({ ...snapshot.inputs, projectId: snapshot.projectId, databaseId: snapshot.databaseId, capturedAt: snapshot.capturedAt,
  candidateResearch: [...snapshot.inputs.candidateResearch, snapshot.inputs.candidateResearch[0]],
} as any);
assert.throws(() => buildResearchMetricsBaseline(duplicate), /duplicate/, 'duplicate source research fails closed');
const leaked = buildCanonicalPublicationSnapshot({ ...snapshot.inputs, projectId: snapshot.projectId, databaseId: snapshot.databaseId, capturedAt: snapshot.capturedAt,
  contestMetrics: snapshot.inputs.contestMetrics.map((metric) => metric.raceId === '2026-AK-senate' ? { ...metric, data: { ...metric.data, historicalWinner: 'not allowed' } } : metric),
} as any);
assert.throws(() => buildResearchMetricsBaseline(leaked), /leakage/, 'historical winner leakage fails closed');
console.log('research metrics baseline tracer test passed');
