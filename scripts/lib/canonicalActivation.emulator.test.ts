import assert from 'node:assert/strict';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import {
  buildCanonicalActivationPlan,
  createFirestoreCanonicalActivationStore,
  executeCanonicalActivationPlan,
  rollbackCanonicalActivation,
  verifyCanonicalActivation,
} from './canonicalActivation.js';
import { buildCanonicalPublicationPlan, certifyCanonicalPublicationPlan } from './canonicalPublication.js';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('run this test with firebase emulators:exec --only firestore');
const projectId = `canonical-activation-emulator-${Date.now()}`;
process.env.PROJECT_ID = projectId;
process.env.FIRESTORE_DATABASE_ID = '(default)';

const candidate = { name: 'Fixture Candidate', party: 'Independent', candidateState: 'active', visibility: 'visible', qualificationStatus: 'on_ballot', pickEligibility: 'eligible', ballotVerifiedAt: '2026-01-01T00:00:00.000Z', ballotSourceUrl: 'https://example.invalid/ballot', source: 'Fixture election office', sourceUrl: 'https://example.invalid/source', verificationLevel: 'official' };
const publication = buildCanonicalPublicationPlan({ generation: 'canonical-2026-shadow-v2',
  races: CANONICAL_2026_FEDERAL_CONTESTS.map((seat, index) => ({ id: seat.id, state: seat.state, office: seat.office, district: seat.district, candidates: [{ ...candidate, id: `fec-H6AA${String(index + 1).padStart(5, '0')}`, externalIds: { fecCandidateId: `H6AA${String(index + 1).padStart(5, '0')}` } }] })),
  deadlines: CANONICAL_2026_FEDERAL_CONTESTS.map((seat) => ({ electionId: seat.id, jurisdiction: seat.state, electionDate: '2026-11-03', localPollClosingTime: '20:00', timeZone: 'America/New_York', closeAt: { __firestoreType: 'timestamp/v1' as const, seconds: 1793505600, nanoseconds: 0 }, sourceRuleIds: ['fixture'], sourceName: 'Test-only deadline fixture', sourceUrl: 'https://example.invalid/deadline', citation: 'Fixture citation.', retrievedAt: '2026-01-01T00:00:00.000Z', reviewedAt: '2026-01-01T00:00:00.000Z', reviewerStatus: 'reviewed' as const, notes: 'Test-only fixture.' })),
  predictions: [], candidateResearch: [], contestMetrics: [], overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
const published = certifyCanonicalPublicationPlan(publication, 'abcdef1');
const certification = { projectId, databaseId: '(default)', ...published };
const plan = buildCanonicalActivationPlan(certification, publication.documents.map((document) => ({ path: `migrationShadows/${publication.generation}/${document.path}`, data: document.data })));
const db = new Firestore({ projectId: certification.projectId, databaseId: certification.databaseId });
await db.doc('races/2026-CA-senate').set({ legacy: true, closeAt: new Timestamp(1, 0) });
await db.doc('races/2026-CA-senate/candidateResearch/legacy-candidate').set({ legacy: true });
await db.doc('contestMetrics/2026-CA-senate').set({ legacy: true });
await db.doc('predictions/legacy-prediction').set({ targetId: '2026-CA-senate', pick: 'legacy-candidate' });
await db.doc('leagues/legacy-league').set({ legacy: true });
await db.doc('users/legacy-user').set({ legacy: true });
await db.doc('ballotMeasures/legacy-measure').set({ legacy: true });
const legacyRace = (await db.doc('races/2026-CA-senate').get()).data();
const legacyResearch = (await db.doc('races/2026-CA-senate/candidateResearch/legacy-candidate').get()).data();
const legacyMetric = (await db.doc('contestMetrics/2026-CA-senate').get()).data();
const legacyPrediction = (await db.doc('predictions/legacy-prediction').get()).data();
const legacyLeague = (await db.doc('leagues/legacy-league').get()).data();
const legacyUser = (await db.doc('users/legacy-user').get()).data();
const legacyMeasure = (await db.doc('ballotMeasures/legacy-measure').get()).data();

const store = await createFirestoreCanonicalActivationStore(plan);
const activation = await executeCanonicalActivationPlan(store, plan, () => '2026-07-24T00:00:00.000Z');
assert.equal(activation.status, 'active');
assert.equal(activation.documentsWritten, 470);
assert.equal((await db.doc(plan.manifestPath).get()).get('activeFederalGeneration'), certification.generation);
assert.deepEqual((await db.doc('races/2026-CA-senate').get()).data(), legacyRace);
assert.deepEqual((await db.doc('races/2026-CA-senate/candidateResearch/legacy-candidate').get()).data(), legacyResearch);
assert.deepEqual((await db.doc('contestMetrics/2026-CA-senate').get()).data(), legacyMetric);
assert.deepEqual((await db.doc('predictions/legacy-prediction').get()).data(), legacyPrediction);
assert.deepEqual((await db.doc('leagues/legacy-league').get()).data(), legacyLeague);
assert.deepEqual((await db.doc('users/legacy-user').get()).data(), legacyUser);
assert.deepEqual((await db.doc('ballotMeasures/legacy-measure').get()).data(), legacyMeasure);
const promoted = await db.doc('races/2026-GA-senate-class-2').get();
assert.equal(promoted.get('registryGeneration'), certification.generation);
assert.equal((promoted.get('closeAt') as Timestamp).seconds, 1793664000);
assert.equal((await verifyCanonicalActivation(store, plan)).verified, true);
const noOp = await executeCanonicalActivationPlan(store, plan);
assert.equal(noOp.applied, false);
const rollback = await rollbackCanonicalActivation(store, plan, () => '2026-07-24T01:00:00.000Z');
assert.equal(rollback.activeFederalGeneration, 'legacy-2026');
assert.equal((await db.doc('races/2026-GA-senate-class-2').get()).exists, true);
assert.deepEqual((await db.doc('races/2026-CA-senate').get()).data(), legacyRace);

console.log('canonical activation emulator tests passed');
