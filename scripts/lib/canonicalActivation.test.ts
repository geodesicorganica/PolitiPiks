import assert from 'node:assert/strict';
import {
  buildCanonicalActivationPlan,
  executeCanonicalActivationPlan,
  rollbackCanonicalActivation,
  verifyCanonicalActivation,
  type ActivationDocumentStore,
  type CanonicalActivationPlan,
} from './canonicalActivation.js';

type Data = Record<string, unknown>;

class MemoryStore implements ActivationDocumentStore {
  readonly documents = new Map<string, Data>();
  readonly commits: Array<Array<{ operation: 'create' | 'set'; path: string; data: Data }>> = [];
  constructor(private readonly droppedCreates = new Set<string>()) {}

  async get(path: string) { return this.documents.get(path) ?? null; }
  async list(prefix: string) {
    return [...this.documents.entries()]
      .filter(([path]) => path.startsWith(`${prefix}/`))
      .map(([path, data]) => ({ path, data }));
  }
  async commit(writes: Array<{ operation: 'create' | 'set'; path: string; data: Data }>) {
    this.commits.push(writes);
    for (const write of writes) {
      if (write.operation === 'create' && this.documents.has(write.path)) throw new Error(`already exists: ${write.path}`);
      if (write.operation === 'create' && this.droppedCreates.has(write.path)) continue;
      this.documents.set(write.path, structuredClone(write.data));
    }
  }
}

const certification = {
  projectId: 'test-project', databaseId: 'test-database', generation: 'canonical-2026-shadow-v2', sourceCommit: 'abcdef1',
  inputDigest: 'a'.repeat(64), mappingDigest: 'b'.repeat(64), planDigest: 'c'.repeat(64), lockPolicyDigest: 'e'.repeat(64), namespaceDigest: 'd'.repeat(64),
  expectedCounts: { races: 1, research: 1, metrics: 1 },
};

const shadowDocuments = [
  { path: 'migrationShadows/canonical-2026-shadow-v2/races/2026-CA-senate-class-1', data: { electionYear: 2026, mode: 'live', deadlineKind: 'product_safety_lock', lockPolicyId: 'canonical-2026-pre-election-lock-v1', lockPolicyVersion: 1, lockReason: 'Fixture policy', candidates: [{ id: 'fec-S1CA00001' }], eligibleCandidateIds: [], closeDate: '2026-11-03', closeAt: { __firestoreType: 'timestamp/v1', seconds: 1793664000, nanoseconds: 0 } } },
  { path: 'migrationShadows/canonical-2026-shadow-v2/races/2026-CA-senate-class-1/candidateResearch/fec-S1CA00001', data: { candidateId: 'fec-S1CA00001', raceId: '2026-CA-senate-class-1', sections: [] } },
  { path: 'migrationShadows/canonical-2026-shadow-v2/contestMetrics/2026-CA-senate-class-1', data: { raceId: '2026-CA-senate-class-1', metrics: {} } },
];

const plan = buildCanonicalActivationPlan(certification, shadowDocuments);
assert.throws(() => buildCanonicalActivationPlan({ ...certification, generation: 'canonical-2026-shadow-v1' }, shadowDocuments.map((document) => ({ ...document, path: document.path.replaceAll('canonical-2026-shadow-v2', 'canonical-2026-shadow-v1') }))), /incomplete canonical-2026-shadow-v1/);
assert.throws(() => buildCanonicalActivationPlan(certification, shadowDocuments.map((document) => document.path.includes('/races/') && !document.path.includes('candidateResearch') ? { ...document, data: { ...document.data, lockPolicyId: 'unapproved-policy' } } : document)), /publication race contract failed/, 'activation rejects an unapproved product-lock policy');
assert.equal(plan.documents.length, 3);
const raceDocument = plan.documents.find((document) => document.path === 'races/2026-CA-senate-class-1')!;
assert.equal(raceDocument.path.startsWith('races/'), true);
assert.equal(raceDocument.data.catalogScope, 'federal');
assert.equal(raceDocument.data.registryGeneration, certification.generation);
assert.equal(plan.manifestPath, 'catalogActivations/canonical-2026');

const store = new MemoryStore();
store.documents.set('races/2026-CA-senate', { legacy: true });
const activated = await executeCanonicalActivationPlan(store, plan, () => '2026-01-01T00:00:00.000Z');
assert.deepEqual(activated, { applied: true, resumed: false, documentsWritten: 3, batches: 3, status: 'active' });
assert.deepEqual(store.documents.get('races/2026-CA-senate'), { legacy: true });
assert.equal(store.documents.get(plan.manifestPath)?.state, 'active');
assert.equal(store.commits.at(-1)?.[0]?.path, plan.manifestPath);
assert.equal(store.commits.at(-1)?.[0]?.data.state, 'active');

const verified = await verifyCanonicalActivation(store, plan);
assert.equal(verified.verified, true);
assert.equal(verified.counts.races, 1);
assert.match(verified.activationDigest, /^[a-f0-9]{64}$/);

const resumedStore = new MemoryStore();
resumedStore.documents.set(plan.manifestPath, plan.pendingManifest);
resumedStore.documents.set(raceDocument.path, raceDocument.data);
const resumed = await executeCanonicalActivationPlan(resumedStore, plan, () => '2026-01-01T00:00:00.000Z');
assert.equal(resumed.resumed, true);
assert.equal(resumedStore.documents.get(plan.manifestPath)?.state, 'active');

const conflictingStore = new MemoryStore();
conflictingStore.documents.set(raceDocument.path, { incompatible: true });
await assert.rejects(() => executeCanonicalActivationPlan(conflictingStore, plan), /conflicting active canonical content/);
assert.equal(conflictingStore.commits.length, 0);

const incompleteStore = new MemoryStore(new Set([raceDocument.path]));
await assert.rejects(() => executeCanonicalActivationPlan(incompleteStore, plan), /active canonical document missing/);
assert.equal(incompleteStore.documents.get(plan.manifestPath)?.state, 'pending');

const rollback = await rollbackCanonicalActivation(store, plan, () => '2026-01-02T00:00:00.000Z');
assert.deepEqual(rollback, { rolledBack: true, writes: 1, activeFederalGeneration: 'legacy-2026' });
assert.equal(store.documents.get(plan.manifestPath)?.activeFederalGeneration, 'legacy-2026');
assert.equal(store.documents.has(raceDocument.path), true);

console.log('canonical activation executor tests passed');
