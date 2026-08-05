import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertCommittedG8ProductShadowSource,
  buildG8ProductShadowWritePlan,
  buildG8ProductShadowRootManifest,
  executeG8ProductShadowWritePlan,
  G8_PRODUCT_SHADOW_NAMESPACE,
  CERTIFIED_G8_PRODUCT_SHADOW,
  verifyG8ProductShadowNamespace,
  type G8ProductShadowWritePlan,
  type ShadowDocument,
  type ShadowDocumentStore,
  type ShadowWrite,
} from './g8ProductShadowExecutor.js';
import {
  assertG8ProductShadowProductionGuards,
  parseG8ProductShadowArguments,
} from './g8ProductShadowCli.js';

class InMemoryShadowStore implements ShadowDocumentStore {
  readonly documents = new Map<string, Record<string, unknown>>();
  readonly batches: ShadowWrite[][] = [];
  failOnCommit: number | null = null;

  async get(path: string) { return this.documents.get(path) ?? null; }
  async list(collectionPath: string) {
    const depth = collectionPath.split('/').length + 1;
    return [...this.documents.entries()].filter(([path]) => path.startsWith(`${collectionPath}/`) && path.split('/').length === depth)
      .map(([path, data]) => ({ path, data }));
  }
  async listNamespace() {
    return [...this.documents.entries()]
      .filter(([path]) => path.startsWith(`${G8_PRODUCT_SHADOW_NAMESPACE}/`) && path !== G8_PRODUCT_SHADOW_NAMESPACE)
      .map(([path, data]) => ({ path, data }));
  }
  async commit(writes: ShadowWrite[]) {
    if (this.failOnCommit === this.batches.length + 1) throw new Error('simulated interruption');
    assert.ok(writes.length > 0 && writes.length <= 400);
    for (const write of writes) {
      assert.match(write.path, /^migrationShadows\/canonical-2026-shadow-v2(?:\/|$)/);
      if (write.operation === 'create' && this.documents.has(write.path)) throw new Error(`duplicate create: ${write.path}`);
    }
    this.batches.push(structuredClone(writes));
    for (const write of writes) this.documents.set(write.path, structuredClone(write.data));
  }
}

const bundle = JSON.parse(readFileSync('.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', 'utf8')) as unknown;
const sourceCommit = 'a'.repeat(40);
const plan = buildG8ProductShadowWritePlan(bundle, sourceCommit);
const fullGuards = {
  apply: true, verifyOnly: false, projectId: CERTIFIED_G8_PRODUCT_SHADOW.projectId, databaseId: CERTIFIED_G8_PRODUCT_SHADOW.databaseId,
  generation: CERTIFIED_G8_PRODUCT_SHADOW.generation, expectedInputDigest: CERTIFIED_G8_PRODUCT_SHADOW.inputDigest,
  expectedEvidenceDigest: CERTIFIED_G8_PRODUCT_SHADOW.evidenceDigest, expectedPlanDigest: CERTIFIED_G8_PRODUCT_SHADOW.planDigest,
  expectedBundleDigest: CERTIFIED_G8_PRODUCT_SHADOW.bundleDigest, expectedRaces: '470', expectedMeasures: '14', expectedCandidateResearch: '2384',
  expectedMeasureResearch: '14', expectedMetrics: '470', expectedContentDocuments: '3352', authorizationReceiptId: 'receipt-g8-2a-test',
};

assert.deepEqual(plan.expectedCounts, { races: 470, measures: 14, candidateResearch: 2384, measureResearch: 14, metrics: 470, contentDocuments: 3352, totalBundleDocuments: 3353, selectorsExcluded: 1 });
assert.equal(plan.documents.length, 3352, 'the v2 shadow plan excludes exactly one selector');
assert.equal(plan.documents.some((document) => document.path.includes('/catalogActivations/')), false);
assert.equal(plan.documents.every((document) => document.path.startsWith(`${G8_PRODUCT_SHADOW_NAMESPACE}/`)), true);
assert.throws(() => buildG8ProductShadowWritePlan({ ...(bundle as Record<string, unknown>), generation: 'canonical-2026-shadow-v1' }, sourceCommit), /malformed|v1|generation/);
assert.throws(() => buildG8ProductShadowWritePlan({ ...(bundle as Record<string, unknown>), inputDigest: '0'.repeat(64) }, sourceCommit), /digest mismatch/);
const staleCounts = structuredClone(bundle) as Record<string, unknown>;
(staleCounts.counts as Record<string, unknown>).total = 3352;
assert.throws(() => buildG8ProductShadowWritePlan(staleCounts, sourceCommit), /count or audit tampering/);
const tampered = structuredClone(bundle) as Record<string, unknown>;
const tamperedDocuments = tampered.documents as Array<Record<string, unknown>>;
(tamperedDocuments[0]!.data as Record<string, unknown>).tampered = true;
assert.throws(() => buildG8ProductShadowWritePlan(tampered, sourceCommit), /digest mismatch/);
await assert.rejects(() => executeG8ProductShadowWritePlan(new InMemoryShadowStore(), { ...structuredClone(plan), documents: [{ path: 'races/active', data: {} }, ...plan.documents.slice(1)] }), /unsafe active-namespace path/);
await assert.rejects(() => executeG8ProductShadowWritePlan(new InMemoryShadowStore(), { ...structuredClone(plan), documents: [{ path: `${G8_PRODUCT_SHADOW_NAMESPACE}/races/../active`, data: {} }, ...plan.documents.slice(1)] }), /unsafe shadow path/);
await assert.rejects(() => executeG8ProductShadowWritePlan(new InMemoryShadowStore(), { ...structuredClone(plan), documents: [{ path: `${G8_PRODUCT_SHADOW_NAMESPACE}/catalogActivations/canonical-2026`, data: {} }, ...plan.documents.slice(1)] }), /selector is not an allowed/);
await assert.rejects(() => executeG8ProductShadowWritePlan(new InMemoryShadowStore(), { ...structuredClone(plan), documents: [plan.documents[0]!, ...plan.documents] }), /duplicate shadow path/);

const timestampPlan = structuredClone(plan);
const timestampDocument = timestampPlan.documents.find((document) => JSON.stringify(document.data).includes('timestamp/v1'))!;
const findTag = (value: unknown): { nanoseconds: number } | null => {
  if (Array.isArray(value)) for (const item of value) { const found = findTag(item); if (found) return found; }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.__firestoreType === 'timestamp/v1') return record as { nanoseconds: number };
    for (const child of Object.values(record)) { const found = findTag(child); if (found) return found; }
  }
  return null;
};
findTag(timestampDocument!.data)!.nanoseconds = 1;
await assert.rejects(() => executeG8ProductShadowWritePlan(new InMemoryShadowStore(), timestampPlan), /cannot round-trip/);

const store = new InMemoryShadowStore();
store.documents.set('races/active-sentinel', { untouched: true });
store.documents.set('catalogActivations/canonical-2026', { state: 'active', untouched: true });
const first = await executeG8ProductShadowWritePlan(store, plan, () => '2026-08-05T00:00:00.000Z');
assert.equal(first.documentsWritten, 3352);
assert.equal(first.batches, 10, '399 content documents plus one root operation stay within 400 operations');
assert.equal(store.batches.every((batch) => batch.length <= 400), true);
assert.deepEqual(store.documents.get('races/active-sentinel'), { untouched: true });
assert.deepEqual(store.documents.get('catalogActivations/canonical-2026'), { state: 'active', untouched: true });
const verification = await verifyG8ProductShadowNamespace(store, plan);
assert.equal(verification.verified, true);
assert.equal(verification.contentDigest, plan.namespaceDigest);
assert.equal(verification.recordedNamespaceDigest, plan.namespaceDigest);
const noOpBatchCount = store.batches.length;
assert.deepEqual(await executeG8ProductShadowWritePlan(store, plan), { applied: false, resumed: false, batches: 0, documentsWritten: 0, contentDocuments: 3352, status: 'completed' });
assert.equal(store.batches.length, noOpBatchCount);

const interrupted = new InMemoryShadowStore();
interrupted.failOnCommit = 2;
await assert.rejects(() => executeG8ProductShadowWritePlan(interrupted, plan), /simulated interruption/);
assert.equal(interrupted.documents.get(G8_PRODUCT_SHADOW_NAMESPACE)?.status, 'running');
interrupted.failOnCommit = null;
const resumed = await executeG8ProductShadowWritePlan(interrupted, plan, () => '2026-08-05T00:01:00.000Z');
assert.equal(resumed.resumed, true);
assert.equal(resumed.documentsWritten, 2953);
assert.equal((await verifyG8ProductShadowNamespace(interrupted, plan)).verified, true);

const conflict = new InMemoryShadowStore();
conflict.documents.set(plan.documents[0]!.path, { conflict: true });
await assert.rejects(() => executeG8ProductShadowWritePlan(conflict, plan), /conflicting existing shadow content/);
assert.equal(conflict.batches.length, 0, 'conflicting content is rejected before mutation');
const missing = new InMemoryShadowStore();
await executeG8ProductShadowWritePlan(missing, plan);
missing.documents.delete(plan.documents[0]!.path);
await assert.rejects(() => verifyG8ProductShadowNamespace(missing, plan), /count differs|missing/);
const extra = new InMemoryShadowStore();
await executeG8ProductShadowWritePlan(extra, plan);
extra.documents.set(`${G8_PRODUCT_SHADOW_NAMESPACE}/races/extra`, { extra: true });
await assert.rejects(() => verifyG8ProductShadowNamespace(extra, plan), /count differs/);
const changed = new InMemoryShadowStore();
await executeG8ProductShadowWritePlan(changed, plan);
(changed.documents.get(plan.documents[0]!.path) as Record<string, unknown>).changed = true;
await assert.rejects(() => verifyG8ProductShadowNamespace(changed, plan), /content differs/);

assert.throws(() => assertG8ProductShadowProductionGuards({ ...fullGuards, projectId: 'wrong-project' }, plan, sourceCommit), /production guard/);
assert.throws(() => assertG8ProductShadowProductionGuards({ ...fullGuards, databaseId: 'wrong-database' }, plan, sourceCommit), /production guard/);
assert.throws(() => assertG8ProductShadowProductionGuards({ ...fullGuards, authorizationReceiptId: undefined }, plan, sourceCommit), /production guard/);
assert.throws(() => assertCommittedG8ProductShadowSource(' M scripts/lib/g8ProductShadowExecutor.ts', sourceCommit), /uncommitted/);
assert.doesNotThrow(() => assertG8ProductShadowProductionGuards(fullGuards, plan, sourceCommit));
assert.equal(parseG8ProductShadowArguments(['--bundle-in', '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json']).bundleIn, '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json');
assert.throws(() => parseG8ProductShadowArguments(['--apply', '--verify-only']), /either/);
assert.throws(() => parseG8ProductShadowArguments(['--wrong']), /unsupported/);

console.log('G8.2A product shadow executor tests passed');
