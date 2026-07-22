import assert from 'node:assert/strict';
import {
  CANONICAL_SHADOW_GENERATION,
  CANONICAL_SHADOW_NAMESPACE,
  CERTIFIED_CANONICAL_SHADOW,
  assertCertifiedCanonicalSnapshot,
  executeCanonicalShadowWritePlan,
  verifyCanonicalShadowNamespace,
  type CanonicalShadowWritePlan,
  type ShadowDocument,
  type ShadowDocumentStore,
  type ShadowWrite,
} from './canonicalShadowExecutor.js';
import {
  assertCanonicalShadowProductionGuards,
  parseCanonicalShadowArguments,
  resolvePrivateSnapshotInputPath,
} from './canonicalShadowCli.js';

class InMemoryShadowStore implements ShadowDocumentStore {
  readonly documents = new Map<string, Record<string, unknown>>();
  readonly batches: ShadowWrite[][] = [];
  failOnCommit: number | null = null;

  async get(path: string) {
    return this.documents.get(path) ?? null;
  }

  async list(collectionPath: string) {
    const depth = collectionPath.split('/').length + 1;
    return [...this.documents.entries()]
      .filter(([path]) => path.startsWith(`${collectionPath}/`) && path.split('/').length === depth)
      .map(([path, data]) => ({ path, data }));
  }

  async commit(writes: ShadowWrite[]) {
    if (this.failOnCommit === this.batches.length + 1) throw new Error('simulated interruption');
    assert.ok(writes.length > 0 && writes.length <= 400, 'every batch stays within the Firestore limit');
    for (const write of writes) {
      assert.match(write.path, /^migrationShadows\/canonical-2026-shadow-v1(?:\/|$)/, 'executor writes only its shadow generation');
      if (write.operation === 'create' && this.documents.has(write.path)) throw new Error(`duplicate create: ${write.path}`);
    }
    this.batches.push(writes);
    for (const write of writes) this.documents.set(write.path, structuredClone(write.data));
  }
}

const sourceCommit = 'a'.repeat(40);
const makePlan = (): CanonicalShadowWritePlan => {
  const races: ShadowDocument[] = Array.from({ length: 470 }, (_, index) => ({
    path: `${CANONICAL_SHADOW_NAMESPACE}/races/2026-test-${String(index).padStart(3, '0')}`,
    data: { id: `2026-test-${index}`, source: 'registry' },
  }));
  const research: ShadowDocument[] = Array.from({ length: 537 }, (_, index) => ({
    path: `${CANONICAL_SHADOW_NAMESPACE}/races/2026-test-${String(index % 470).padStart(3, '0')}/candidateResearch/fec-test-${index}`,
    data: { raceId: `2026-test-${index % 470}`, candidateId: `fec-test-${index}`, observedAt: { __firestoreType: 'timestamp/v1', seconds: index, nanoseconds: index * 1_000 } },
  }));
  const metrics: ShadowDocument[] = Array.from({ length: 35 }, (_, index) => ({
    path: `${CANONICAL_SHADOW_NAMESPACE}/contestMetrics/2026-test-${String(index).padStart(3, '0')}`,
    data: { raceId: `2026-test-${index}`, provenance: { sourceMetricId: `metric-${index}` } },
  }));
  return {
    generation: CANONICAL_SHADOW_GENERATION,
    sourceCommit,
    snapshot: { schemaVersion: 2, projectId: CERTIFIED_CANONICAL_SHADOW.projectId, databaseId: CERTIFIED_CANONICAL_SHADOW.databaseId, inputDigest: CERTIFIED_CANONICAL_SHADOW.inputDigest },
    mappingDigest: CERTIFIED_CANONICAL_SHADOW.mappingDigest,
    planDigest: CERTIFIED_CANONICAL_SHADOW.planDigest,
    expectedCounts: { races: races.length, research: research.length, metrics: metrics.length },
    documents: [...races, ...research, ...metrics],
  };
};

const assertRejects = async (operation: () => Promise<unknown>, expression: RegExp) => {
  await assert.rejects(operation, expression);
};

assert.throws(() => assertCertifiedCanonicalSnapshot({
  inputDigest: '0'.repeat(64),
  mappingDigest: CERTIFIED_CANONICAL_SHADOW.mappingDigest,
  planDigest: CERTIFIED_CANONICAL_SHADOW.planDigest,
  safeToActivate: true,
}), /non-certified snapshot/);
assert.throws(() => parseCanonicalShadowArguments([]), /snapshot-in/);
assert.throws(() => resolvePrivateSnapshotInputPath('../unsafe.json'), /must be a .json file beneath/);
assert.throws(() => assertCanonicalShadowProductionGuards({ apply: true, verifyOnly: false, snapshotIn: 'ignored.json' }), /missing or mismatched production guard/);
assert.doesNotThrow(() => assertCanonicalShadowProductionGuards({
  apply: true, verifyOnly: false, snapshotIn: 'ignored.json', projectId: CERTIFIED_CANONICAL_SHADOW.projectId, databaseId: CERTIFIED_CANONICAL_SHADOW.databaseId,
  generation: CANONICAL_SHADOW_GENERATION, expectedInputDigest: CERTIFIED_CANONICAL_SHADOW.inputDigest, expectedMappingDigest: CERTIFIED_CANONICAL_SHADOW.mappingDigest,
  expectedPlanDigest: CERTIFIED_CANONICAL_SHADOW.planDigest, expectedRaces: '470', expectedResearch: '537', expectedMetrics: '35',
}));
assert.equal(parseCanonicalShadowArguments(['.artifacts/private/canonical-migration/approved.json'], { npm_config_snapshot_in: 'true' }).snapshotIn,
  '.artifacts/private/canonical-migration/approved.json', 'npm argument stripping cannot weaken the private-path guard');

const plan = makePlan();
assert.deepEqual(plan.expectedCounts, { races: 470, research: 537, metrics: 35 }, 'the release plan has the certified 470/537/35 shape');

const store = new InMemoryShadowStore();
const activeSentinel = { unchanged: true, nested: { legacy: 'keep' } };
store.documents.set('races/active-sentinel', structuredClone(activeSentinel));
store.documents.set('predictions/legacy-sentinel', structuredClone(activeSentinel));
const first = await executeCanonicalShadowWritePlan(store, plan, () => '2026-07-22T00:00:00.000Z');
assert.equal(first.applied, true);
assert.equal(first.documentsWritten, 1042);
assert.equal(store.documents.get(`${CANONICAL_SHADOW_NAMESPACE}`)?.status, 'completed');
assert.deepEqual(store.documents.get('races/active-sentinel'), activeSentinel, 'active race documents remain byte-identical');
assert.deepEqual(store.documents.get('predictions/legacy-sentinel'), activeSentinel, 'legacy prediction documents remain byte-identical');
assert.ok(store.batches.every((batch) => batch.length <= 400));

const writesBeforeVerification = store.batches.length;
const verification = await verifyCanonicalShadowNamespace(store, plan);
assert.equal(verification.verified, true);
assert.match(verification.namespaceDigest, /^[a-f0-9]{64}$/);
const batchCount = store.batches.length;
assert.equal(batchCount, writesBeforeVerification, 'verify-only performs zero writes');
const rerun = await executeCanonicalShadowWritePlan(store, plan);
assert.deepEqual(rerun, { applied: false, resumed: false, batches: 0, documentsWritten: 0, status: 'completed' }, 'an exact rerun is a no-op');
assert.equal(store.batches.length, batchCount, 'an exact rerun performs zero writes');

const conflictStore = new InMemoryShadowStore();
conflictStore.documents.set(plan.documents[0]!.path, { conflict: true });
await assertRejects(() => executeCanonicalShadowWritePlan(conflictStore, plan), /conflicting existing shadow content/);
assert.equal(conflictStore.batches.length, 0, 'a conflicting target fails before any overwrite');

const wrongCountStore = new InMemoryShadowStore();
const wrongCountPlan = structuredClone(plan);
wrongCountPlan.expectedCounts.races = 469;
await assertRejects(() => executeCanonicalShadowWritePlan(wrongCountStore, wrongCountPlan), /unexpected shadow document counts/);
assert.equal(wrongCountStore.batches.length, 0, 'unexpected counts fail before any shadow write');

const unsafePathStore = new InMemoryShadowStore();
const unsafePathPlan = structuredClone(plan);
unsafePathPlan.documents[0]!.path = 'races/active-target';
await assertRejects(() => executeCanonicalShadowWritePlan(unsafePathStore, unsafePathPlan), /unsafe active-namespace path/);
assert.equal(unsafePathStore.batches.length, 0, 'active namespace paths fail before any shadow write');

const lossyTimestampStore = new InMemoryShadowStore();
const lossyTimestampPlan = structuredClone(plan);
const timestampDocument = lossyTimestampPlan.documents.find((document) => 'observedAt' in document.data)!;
(timestampDocument.data.observedAt as { nanoseconds: number }).nanoseconds = 1;
await assertRejects(() => executeCanonicalShadowWritePlan(lossyTimestampStore, lossyTimestampPlan), /cannot round-trip/);
assert.equal(lossyTimestampStore.batches.length, 0, 'lossy timestamp input fails before any shadow write');

const partialStore = new InMemoryShadowStore();
partialStore.failOnCommit = 2;
await assertRejects(() => executeCanonicalShadowWritePlan(partialStore, plan), /simulated interruption/);
assert.equal(partialStore.documents.get(`${CANONICAL_SHADOW_NAMESPACE}`)?.status, 'running');
partialStore.failOnCommit = null;
const resumed = await executeCanonicalShadowWritePlan(partialStore, plan, () => '2026-07-22T00:01:00.000Z');
assert.equal(resumed.resumed, true, 'a compatible partial generation resumes');
assert.equal(resumed.documentsWritten, 643);
assert.equal((await verifyCanonicalShadowNamespace(partialStore, plan)).verified, true);

console.log('canonical shadow executor tests passed');
