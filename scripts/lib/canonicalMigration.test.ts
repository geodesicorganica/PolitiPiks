import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Timestamp } from '@google-cloud/firestore';
import {
  buildCanonicalMigrationReport,
  buildCanonicalMigrationSnapshot,
  buildCanonicalShadowPlan,
  CANONICAL_MIGRATION_DATABASE_ID,
  CANONICAL_MIGRATION_PROJECT_ID,
  encodeFirestoreSnapshotValue,
  mergeCandidateResearchDocuments,
  parseCanonicalIdentityOverrides,
} from './canonicalMigration.js';

const identityOverrides = parseCanonicalIdentityOverrides(JSON.parse(readFileSync('data/2026/canonical-identity-overrides.json', 'utf8')));
assert.equal(identityOverrides.candidateOverrides.length, 8);
assert.equal(identityOverrides.contestDispositions.length, 3);
assert.deepEqual(
  identityOverrides.candidateOverrides.filter((override) => override.approvedManyToOneMerge).map((override) => override.legacyCandidateId).sort(),
  ['robert-j-menendez-democrat', 'robert-menendez-democrat'],
  'NJ aliases are the only explicitly approved many-to-one merge',
);

const plan = buildCanonicalShadowPlan({
  races: [
    { id: '2026-GA-senate', state: 'GA', office: 'Senate', candidates: [{ id: 'legacy-ossoff', externalIds: { fecCandidateId: 'S6GA00001' } }] },
    { id: '2026-GA-house-001', state: 'GA', office: 'House', district: '001', candidates: [{ id: 'legacy-house', externalIds: { fecCandidateId: 'H6GA00001' } }] },
    { id: '2026-GA-house-023', state: 'GA', office: 'House', district: '023', candidates: [] },
  ],
  predictions: [
    { id: 'pick-1', targetId: '2026-GA-senate', pick: 'legacy-ossoff' },
    { id: 'pick-2', targetId: '2026-GA-house-001', pick: 'legacy-house' },
  ],
  candidateResearch: [{ raceId: '2026-GA-senate', candidateId: 'legacy-ossoff' }],
  contestMetrics: [{ raceId: '2026-GA-senate' }],
});

assert.equal(plan.raceMappings[0]?.to, '2026-GA-senate-class-2');
assert.equal(plan.candidateMappings.find((item) => item.from === 'legacy-ossoff')?.to, 'fec-S6GA00001');
assert.deepEqual(plan.predictionMigrations.find((item) => item.id === 'pick-1'), {
  id: 'pick-1', targetId: '2026-GA-senate-class-2', pick: 'fec-S6GA00001',
});
assert.deepEqual(plan.predictionMigrations.find((item) => item.id === 'pick-2'), {
  id: 'pick-2', targetId: '2026-GA-house-001', pick: 'fec-H6GA00001',
});
assert.equal(plan.copyPlan.candidateResearch, 1);
assert.equal(plan.copyPlan.contestMetrics, 1);
assert.equal(plan.shadowContests.length, 470, 'every canonical federal seat receives a shadow-document plan');
assert.ok(plan.shadowContests.some((item) => item.id === '2026-GA-senate-class-2' && item.action === 'create_from_legacy'));
assert.deepEqual(plan.ambiguousReferences, []);
assert.equal(plan.unresolvedRaces[0]?.id, '2026-GA-house-023');
assert.equal(plan.safeToActivate, false, 'invalid or unmapped seats prevent activation');
assert.ok(plan.mappingDigest.length === 64, 'mapping is immutable and auditable');

assert.throws(() => parseCanonicalIdentityOverrides({ schemaVersion: 1, candidateOverrides: [{
  legacyRaceId: '2026-CA-house-040', legacyCandidateId: 'bad', fecCandidateId: 'H6CA40309', sourceUrl: 'https://example.test/not-fec',
}], contestDispositions: [] }), /invalid or unsourced/);
assert.throws(() => parseCanonicalIdentityOverrides({ schemaVersion: 1, candidateOverrides: [
  { legacyRaceId: '2026-CA-house-040', legacyCandidateId: 'duplicate', fecCandidateId: 'H6CA40309', sourceUrl: 'https://www.fec.gov/data/candidate/H6CA40309/' },
  { legacyRaceId: '2026-CA-house-040', legacyCandidateId: 'duplicate', fecCandidateId: 'H8CA39240', sourceUrl: 'https://www.fec.gov/data/candidate/H8CA39240/' },
], contestDispositions: [] }), /duplicate or contradictory/);

const overriddenInput = {
  overrides: identityOverrides,
  races: [
    { id: '2026-CA-house-040', state: 'CA', office: 'House', district: '040', candidates: [
      { id: 'esther-kim-varet-democrat', externalIds: { fecCandidateId: 'H8CA39240' } },
      { id: 'young-kim-republican', externalIds: { fecCandidateId: 'H8CA39240' } },
    ] },
    { id: '2026-FL-house-011', state: 'FL', office: 'House', district: '011', candidates: [
      { id: 'daniel-webster-republican', externalIds: { fecCandidateId: 'H0FL08208' } },
      { id: 'royal-mr-webster-democrat', externalIds: { fecCandidateId: 'H0FL08208' } },
    ] },
    { id: '2026-NJ-house-008', state: 'NJ', office: 'House', district: '008', candidates: [
      { id: 'robert-j-menendez-democrat', externalIds: { fecCandidateId: 'H2NJ08232' } },
      { id: 'robert-menendez-democrat', externalIds: { fecCandidateId: 'H2NJ08232' } },
    ] },
    { id: '2026-TX-house-022', state: 'TX', office: 'House', district: '022', candidates: [
      { id: 'troy-nehls-republican', externalIds: { fecCandidateId: 'H0TX22302' } },
      { id: 'trever-nehls-republican', externalIds: { fecCandidateId: 'H0TX22302' } },
    ] },
    { id: '2026-GA-house-023', state: 'GA', office: 'House', district: '023', candidates: [] },
    { id: '2026-NM-house-066', state: 'NM', office: 'House', district: '066', candidates: [] },
    { id: '2026-MP-house-001', state: 'MP', office: 'House', district: '001', candidates: [] },
  ],
  predictions: [],
  candidateResearch: [
    { raceId: '2026-NJ-house-008', candidateId: 'robert-j-menendez-democrat', data: { buckets: { identity: [{ body: 'same', sources: ['fec'] }], record: [{ body: 'first', sources: ['a'] }] } } },
    { raceId: '2026-NJ-house-008', candidateId: 'robert-menendez-democrat', data: { buckets: { identity: [{ body: 'same', sources: ['fec'] }], record: [{ body: 'second', sources: ['b'] }] } } },
  ],
  contestMetrics: [],
};
const overriddenPlan = buildCanonicalShadowPlan(overriddenInput);
assert.equal(overriddenPlan.safeToActivate, true, 'approved overrides resolve every supplied identity blocker');
assert.deepEqual(overriddenPlan.unresolvedRaces, []);
assert.deepEqual(overriddenPlan.unresolvedCandidates, []);
assert.deepEqual(overriddenPlan.ambiguousReferences, []);
assert.equal(overriddenPlan.approvedCandidateMerges[0]?.mergeGroup, '2026-NJ-house-008-robert-menendez');
assert.deepEqual(overriddenPlan.retiredContests.map((item) => [item.legacyRaceId, item.disposition, item.auditAlias]), [
  ['2026-GA-house-023', 'retire_invalid', undefined],
  ['2026-MP-house-001', 'retire_nonvoting', '2026-MP-delegate'],
  ['2026-NM-house-066', 'retire_invalid', undefined],
]);
assert.equal(overriddenPlan.researchMerge.documents[0]?.data.externalIds && (overriddenPlan.researchMerge.documents[0].data.externalIds as { fecCandidateId: string }).fecCandidateId, 'H2NJ08232');
assert.equal(overriddenPlan.researchMerge.deduplicatedSections, 1);
assert.equal((overriddenPlan.researchMerge.documents[0]?.data.buckets as { record: unknown[] }).record.length, 2, 'distinct sourced sections survive the merge');

const timestampMerge = mergeCandidateResearchDocuments([
  { raceId: '2026-NJ-house-008', candidateId: 'fec-H2NJ08232', data: { structuredEnrichedAt: '2026-07-19T01:55:50.679Z' } },
  { raceId: '2026-NJ-house-008', candidateId: 'fec-H2NJ08232', data: { structuredEnrichedAt: '2026-07-19T01:55:50.924Z' } },
]);
assert.deepEqual(timestampMerge.conflicts, []);
assert.deepEqual((timestampMerge.documents[0]?.data.provenance as { timestamps: { structuredEnrichedAt: string[] } }).timestamps.structuredEnrichedAt, [
  '2026-07-19T01:55:50.679Z', '2026-07-19T01:55:50.924Z',
], 'distinct enrichment timestamps remain provenance instead of being overwritten');

const nativeTimestamp = new Timestamp(123456789, 123456789);
const encodedTimestamp = encodeFirestoreSnapshotValue({ updatedAt: nativeTimestamp }) as { updatedAt: unknown };
assert.deepEqual(encodedTimestamp.updatedAt, { __firestoreType: 'timestamp/v1', seconds: 123456789, nanoseconds: 123456789 });
assert.throws(() => buildCanonicalMigrationSnapshot({ projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: CANONICAL_MIGRATION_DATABASE_ID, ...overriddenInput,
  candidateResearch: [{ raceId: '2026-NJ-house-008', candidateId: 'robert-j-menendez-democrat', data: { updatedAt: nativeTimestamp } }],
}), /unsupported Firestore value/);

const retiredPredictionPlan = buildCanonicalShadowPlan({ ...overriddenInput, predictions: [{ id: 'retired-pick', targetId: '2026-GA-house-023', pick: 'x' }] });
assert.equal(retiredPredictionPlan.safeToActivate, false);
assert.equal(retiredPredictionPlan.retiredContestPredictions[0]?.targetId, '2026-GA-house-023');

const scalarConflict = mergeCandidateResearchDocuments([
  { raceId: '2026-NJ-house-008', candidateId: 'fec-H2NJ08232', data: { title: 'one' } },
  { raceId: '2026-NJ-house-008', candidateId: 'fec-H2NJ08232', data: { title: 'two' } },
]);
assert.equal(scalarConflict.conflicts[0]?.field, 'title', 'conflicting sourced scalar values block a merge instead of overwriting');

const snapshotSource = {
  ...overriddenInput,
  races: [...overriddenInput.races, { id: '2026-GA-senate', state: 'GA', office: 'Senate', district: null, candidates: [] }],
  predictions: [{ id: 'snapshot-pick', targetId: '2026-CA-house-040', pick: 'esther-kim-varet-democrat' }],
  contestMetrics: [{ id: 'metric-ga', raceId: '2026-GA-senate', data: { sources: [{ url: 'https://example.test/metric' }], value: 1 } }],
};
const snapshot = buildCanonicalMigrationSnapshot({
  projectId: CANONICAL_MIGRATION_PROJECT_ID,
  databaseId: CANONICAL_MIGRATION_DATABASE_ID,
  ...snapshotSource,
});
const replayOne = buildCanonicalMigrationReport(snapshot);
const replayTwo = buildCanonicalMigrationReport(JSON.parse(JSON.stringify(snapshot)));
assert.equal(snapshot.inputDigest, replayOne.inputDigest, 'input digest covers the normalized snapshot inputs');
assert.equal(replayOne.planDigest, replayTwo.planDigest, 'offline replays of one snapshot have an identical complete plan digest');
assert.deepEqual(replayOne, replayTwo, 'offline replays produce an identical report without Firestore');
assert.throws(() => buildCanonicalMigrationSnapshot({ projectId: 'wrong-project', databaseId: CANONICAL_MIGRATION_DATABASE_ID, ...overriddenInput }), /unexpected project/);
assert.throws(() => buildCanonicalMigrationSnapshot({ projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: 'wrong-database', ...overriddenInput }), /unexpected database/);
assert.throws(() => buildCanonicalMigrationSnapshot({ projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: CANONICAL_MIGRATION_DATABASE_ID, ...overriddenInput,
  races: [...overriddenInput.races, { ...overriddenInput.races[0] }],
}), /duplicate snapshot race identity/);
assert.throws(() => buildCanonicalMigrationSnapshot({ projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: CANONICAL_MIGRATION_DATABASE_ID, ...overriddenInput,
  candidateResearch: [{ raceId: '2026-NJ-house-008', candidateId: 'robert-j-menendez-democrat', data: { captured: new Date() } }],
}), /unsupported Firestore value/);

const shuffledSnapshot = buildCanonicalMigrationSnapshot({
  projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: CANONICAL_MIGRATION_DATABASE_ID,
  ...snapshotSource, races: [...snapshotSource.races].reverse(), candidateResearch: [...snapshotSource.candidateResearch].reverse(),
});
assert.equal(shuffledSnapshot.inputDigest, snapshot.inputDigest, 'input ordering cannot affect the input digest');
assert.equal(buildCanonicalMigrationReport(shuffledSnapshot).planDigest, replayOne.planDigest, 'input ordering cannot affect the full plan digest');

const changedResearchSnapshot = buildCanonicalMigrationSnapshot({
  projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: CANONICAL_MIGRATION_DATABASE_ID,
  ...snapshotSource, candidateResearch: [{ raceId: '2026-NJ-house-008', candidateId: 'robert-j-menendez-democrat', data: { buckets: { identity: [{ body: 'changed', sources: ['fec'] }] } } }],
});
assert.notEqual(changedResearchSnapshot.inputDigest, snapshot.inputDigest, 'meaningful snapshot input changes its digest');
assert.notEqual(buildCanonicalMigrationReport(changedResearchSnapshot).planDigest, replayOne.planDigest, 'meaningful merged-plan output changes the full plan digest');

const changedMetricSnapshot = buildCanonicalMigrationSnapshot({
  projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: CANONICAL_MIGRATION_DATABASE_ID,
  ...snapshotSource, contestMetrics: [{ id: 'metric-ga', raceId: '2026-GA-senate', data: { sources: [{ url: 'https://example.test/metric' }], value: 2 } }],
});
assert.notEqual(changedMetricSnapshot.inputDigest, snapshot.inputDigest, 'meaningful metric input changes its digest');
assert.notEqual(buildCanonicalMigrationReport(changedMetricSnapshot).planDigest, replayOne.planDigest, 'complete metric copy content is covered by the plan digest');

const timestampSnapshotSource = {
  ...snapshotSource,
  candidateResearch: [{ raceId: '2026-NJ-house-008', candidateId: 'robert-j-menendez-democrat', data: encodeFirestoreSnapshotValue({ updatedAt: new Timestamp(10, 20), buckets: { identity: [] } }) as Record<string, unknown> }],
  contestMetrics: [{ id: 'metric-ga', raceId: '2026-GA-senate', data: encodeFirestoreSnapshotValue({ observedAt: new Timestamp(30, 40), sources: [] }) as Record<string, unknown> }],
};
const timestampSnapshot = buildCanonicalMigrationSnapshot({ projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: CANONICAL_MIGRATION_DATABASE_ID, ...timestampSnapshotSource });
const timestampReport = buildCanonicalMigrationReport(timestampSnapshot);
assert.deepEqual(buildCanonicalMigrationReport(JSON.parse(JSON.stringify(timestampSnapshot))), timestampReport, 'tagged timestamps survive JSON and offline replay');
const changedNanosecond = buildCanonicalMigrationSnapshot({ projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: CANONICAL_MIGRATION_DATABASE_ID, ...timestampSnapshotSource,
  candidateResearch: [{ raceId: '2026-NJ-house-008', candidateId: 'robert-j-menendez-democrat', data: encodeFirestoreSnapshotValue({ updatedAt: new Timestamp(10, 21), buckets: { identity: [] } }) as Record<string, unknown> }],
});
assert.notEqual(changedNanosecond.inputDigest, timestampSnapshot.inputDigest);
assert.notEqual(buildCanonicalMigrationReport(changedNanosecond).planDigest, timestampReport.planDigest);
for (const malformed of [
  { __firestoreType: 'timestamp/v1', seconds: 1, nanoseconds: 1, extra: true }, { __firestoreType: 'timestamp/v1', seconds: 1.5, nanoseconds: 1 },
  { __firestoreType: 'unknown/v1', seconds: 1, nanoseconds: 1 }, { seconds: 1, nanoseconds: 1 },
]) assert.throws(() => buildCanonicalMigrationSnapshot({ projectId: CANONICAL_MIGRATION_PROJECT_ID, databaseId: CANONICAL_MIGRATION_DATABASE_ID, ...overriddenInput,
  candidateResearch: [{ raceId: '2026-NJ-house-008', candidateId: 'robert-j-menendez-democrat', data: { updatedAt: malformed } }],
}));

const tamperedSnapshot = JSON.parse(JSON.stringify(snapshot));
tamperedSnapshot.inputs.predictions[0].pick = 'tampered-pick';
assert.throws(() => buildCanonicalMigrationReport(tamperedSnapshot), /input digest mismatch/);
const duplicateSnapshot = JSON.parse(JSON.stringify(snapshot));
duplicateSnapshot.inputs.predictions.push({ ...duplicateSnapshot.inputs.predictions[0] });
assert.throws(() => buildCanonicalMigrationReport(duplicateSnapshot), /duplicate snapshot prediction identity/);
const duplicateRaceSnapshot = JSON.parse(JSON.stringify(snapshot));
duplicateRaceSnapshot.inputs.races.push({ ...duplicateRaceSnapshot.inputs.races[0] });
assert.throws(() => buildCanonicalMigrationReport(duplicateRaceSnapshot), /duplicate snapshot race identity/);
const duplicateResearchSnapshot = JSON.parse(JSON.stringify(snapshot));
duplicateResearchSnapshot.inputs.candidateResearch.push({ ...duplicateResearchSnapshot.inputs.candidateResearch[0] });
assert.throws(() => buildCanonicalMigrationReport(duplicateResearchSnapshot), /duplicate snapshot research identity/);
const duplicateMetricSnapshot = JSON.parse(JSON.stringify(snapshot));
duplicateMetricSnapshot.inputs.contestMetrics.push({ ...duplicateMetricSnapshot.inputs.contestMetrics[0] });
assert.throws(() => buildCanonicalMigrationReport(duplicateMetricSnapshot), /duplicate snapshot metric identity/);
const wrongVersionSnapshot = JSON.parse(JSON.stringify(snapshot));
wrongVersionSnapshot.schemaVersion = 99;
assert.throws(() => buildCanonicalMigrationReport(wrongVersionSnapshot), /unsupported canonical migration snapshot version/);
const wrongCountSnapshot = JSON.parse(JSON.stringify(snapshot));
wrongCountSnapshot.collectionCounts.predictions += 1;
assert.throws(() => buildCanonicalMigrationReport(wrongCountSnapshot), /collection counts mismatch/);
const malformedSnapshot = JSON.parse(JSON.stringify(snapshot));
malformedSnapshot.inputs.predictions[0] = { id: 'bad', targetId: 'only-two-fields', pick: 'p', userId: 'sensitive' };
assert.throws(() => buildCanonicalMigrationReport(malformedSnapshot), /not permitted/);
assert.ok(snapshot.inputs.predictions.every((prediction) => !('userId' in prediction) && !('leagueId' in prediction)), 'snapshot projections never retain sensitive prediction fields');

const snapshotTempDir = mkdtempSync(join(tmpdir(), 'politipiks-canonical-snapshot-'));
try {
  const snapshotPath = join(snapshotTempDir, 'offline.json');
  writeFileSync(snapshotPath, JSON.stringify(snapshot), 'utf8');
  const offline = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/report-canonical-2026-migration.ts', '--snapshot-in', snapshotPath, '--verify-replay'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, FIREBASE_SERVICE_ACCOUNT: join(snapshotTempDir, 'missing.json'), GOOGLE_APPLICATION_CREDENTIALS: join(snapshotTempDir, 'missing.json') },
  });
  assert.equal(offline.status, 0, `${offline.error ?? ''}\n${offline.stderr}`);
  assert.match(offline.stdout, /"offlineReplayVerified": true/);
  const unsafe = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/report-canonical-2026-migration.ts', '--snapshot-out', '../unsafe.json'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, FIREBASE_SERVICE_ACCOUNT: join(snapshotTempDir, 'missing.json') },
  });
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /--snapshot-out must be beneath/);
} finally {
  rmSync(snapshotTempDir, { recursive: true, force: true });
}

console.log('canonical shadow migration planner tests passed');
