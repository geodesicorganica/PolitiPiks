import assert from 'node:assert/strict';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import {
  CANONICAL_SHADOW_GENERATION,
  CANONICAL_SHADOW_NAMESPACE,
  CERTIFIED_CANONICAL_SHADOW,
  createFirestoreCanonicalShadowStore,
  executeCanonicalShadowWritePlan,
  verifyCanonicalShadowNamespace,
  type CanonicalShadowWritePlan,
  type ShadowDocument,
} from './canonicalShadowExecutor.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('run this test with firebase emulators:exec --only firestore');
process.env.PROJECT_ID = CERTIFIED_CANONICAL_SHADOW.projectId;
process.env.FIRESTORE_DATABASE_ID = CERTIFIED_CANONICAL_SHADOW.databaseId;

const sourceCommit = 'b'.repeat(40);
const documents: ShadowDocument[] = [
  ...Array.from({ length: 470 }, (_, index) => ({
    path: `${CANONICAL_SHADOW_NAMESPACE}/races/2026-emulator-${String(index).padStart(3, '0')}`,
    data: { id: `2026-emulator-${index}`, source: 'registry' },
  })),
  ...Array.from({ length: 537 }, (_, index) => ({
    path: `${CANONICAL_SHADOW_NAMESPACE}/races/2026-emulator-${String(index % 470).padStart(3, '0')}/candidateResearch/fec-emulator-${index}`,
    data: { raceId: `2026-emulator-${index % 470}`, candidateId: `fec-emulator-${index}`, updatedAt: { __firestoreType: 'timestamp/v1' as const, seconds: 123 + index, nanoseconds: index * 1_000 } },
  })),
  ...Array.from({ length: 35 }, (_, index) => ({
    path: `${CANONICAL_SHADOW_NAMESPACE}/contestMetrics/2026-emulator-${String(index).padStart(3, '0')}`,
    data: { raceId: `2026-emulator-${index}`, canonicalShadow: { sourceMetricId: `metric-${index}` } },
  })),
];
const plan: CanonicalShadowWritePlan = {
  generation: CANONICAL_SHADOW_GENERATION,
  sourceCommit,
  snapshot: { schemaVersion: 2, projectId: CERTIFIED_CANONICAL_SHADOW.projectId, databaseId: CERTIFIED_CANONICAL_SHADOW.databaseId, inputDigest: CERTIFIED_CANONICAL_SHADOW.inputDigest },
  mappingDigest: CERTIFIED_CANONICAL_SHADOW.mappingDigest,
  planDigest: CERTIFIED_CANONICAL_SHADOW.planDigest,
  expectedCounts: { races: 470, research: 537, metrics: 35 },
  documents,
};

const db = new Firestore({ projectId: CERTIFIED_CANONICAL_SHADOW.projectId, databaseId: CERTIFIED_CANONICAL_SHADOW.databaseId });
const activePath = 'races/active-sentinel';
const legacyPath = 'predictions/legacy-sentinel';
await db.doc(activePath).set({ exact: 'active', untouched: true });
await db.doc(legacyPath).set({ exact: 'legacy', timestamp: new Timestamp(1, 2) });
const activeBefore = (await db.doc(activePath).get()).data();
const legacyBefore = (await db.doc(legacyPath).get()).data();

const store = await createFirestoreCanonicalShadowStore();
const first = await executeCanonicalShadowWritePlan(store, plan, () => '2026-07-22T00:00:00.000Z');
assert.equal(first.applied, true);
assert.equal(first.documentsWritten, 1042);
const tagged = (await db.doc(`${CANONICAL_SHADOW_NAMESPACE}/races/2026-emulator-000/candidateResearch/fec-emulator-0`).get()).get('updatedAt') as Timestamp;
assert.equal(tagged.seconds, 123, 'timestamp tags decode to native Firestore Timestamps only in the write adapter');
assert.equal(tagged.nanoseconds, 0);
const expectedSecondResearch = documents.find((document) => document.path.endsWith('/candidateResearch/fec-emulator-1'))!;
assert.deepEqual(await store.get(expectedSecondResearch.path), expectedSecondResearch.data, 'native timestamp reads re-encode to the precise snapshot tag');
assert.deepEqual((await db.doc(activePath).get()).data(), activeBefore, 'executor did not mutate active races');
assert.deepEqual((await db.doc(legacyPath).get()).data(), legacyBefore, 'executor did not mutate legacy predictions');
assert.equal((await verifyCanonicalShadowNamespace(store, plan)).verified, true);
const rerun = await executeCanonicalShadowWritePlan(store, plan);
assert.equal(rerun.applied, false, 'an exact emulator rerun is a no-op');
assert.equal(rerun.documentsWritten, 0);

console.log('canonical shadow executor emulator tests passed');
