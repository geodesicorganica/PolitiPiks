import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildG8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, executeG8V2Activation, rollbackG8V2Activation, verifyG8V2Activation, type G8V2ActivationStore } from './g8V2Activation.js';
import { validateLocalProductBundle } from './localProductBundle.js';

const bundle = validateLocalProductBundle(JSON.parse(readFileSync('.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', 'utf8')));
const shadowPlan = buildG8ProductShadowWritePlan(bundle, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT);
const receipts = { shadowVerification: 'g8-3a-shadow-test', promotion: 'g8-3a-promotion-test', activation: 'g8-3a-activation-test', rollback: 'g8-3a-rollback-test' };
const identity = { identitySchemaVersion: 2 as const, shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, activationImplementationCommit: 'a'.repeat(40) };
const plan = buildG8V2ActivationPlan(shadowPlan, receipts, identity);
assert.equal(plan.documents.length, 3352);
assert.deepEqual(plan.expectedCounts, { races: 470, measures: 14, candidateResearch: 2384, measureResearch: 14, metrics: 470, contentDocuments: 3352, totalBundleDocuments: 3353, selectorsExcluded: 1 });
assert.equal(plan.documents.filter((document) => /^ballotMeasures\/[^/]+$/.test(document.path)).length, 14);
assert.equal(plan.documents.filter((document) => /^ballotMeasures\/[^/]+\/research\/baseline$/.test(document.path)).length, 14);
assert.equal(plan.documents.find((document) => document.path.startsWith('ballotMeasures/'))?.data.registryGeneration, 'canonical-2026-shadow-v2');
assert.equal(plan.documents.find((document) => document.path.startsWith('ballotMeasures/'))?.data.catalogScope, 'canonical-2026-measures');
assert.equal(plan.documents.find((document) => document.path.startsWith('races/'))?.data.catalogScope, 'federal');
assert.match(plan.planDigest, /^[a-f0-9]{64}$/);
assert.deepEqual(buildG8V2ActivationPlan(shadowPlan, receipts, identity).planDigest, plan.planDigest);
assert.equal(plan.shadowSourceCommit, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT);
assert.equal(plan.activationImplementationCommit, identity.activationImplementationCommit);
assert.throws(() => buildG8V2ActivationPlan(shadowPlan, receipts, { ...identity, shadowSourceCommit: 'b'.repeat(40) }), /identity/);
assert.throws(() => buildG8V2ActivationPlan(buildG8ProductShadowWritePlan(bundle, 'b'.repeat(40)), receipts, identity), /identity/);
assert.throws(() => buildG8V2ActivationPlan(shadowPlan, receipts, { ...identity, activationImplementationCommit: '' }), /identity/);

class MemoryStore implements G8V2ActivationStore {
  readonly documents = new Map<string, Record<string, unknown>>();
  readonly commits: Array<Array<{ operation: 'create' | 'set'; path: string }>> = [];
  constructor(private readonly conflictPath?: string) {}
  async get(path: string) { return this.documents.get(path) ?? null; }
  async commit(writes: Array<{ operation: 'create' | 'set'; path: string; data: Record<string, unknown> }>) {
    this.commits.push(writes.map(({ operation, path }) => ({ operation, path })));
    for (const write of writes) {
      if (write.operation === 'create' && this.documents.has(write.path)) throw new Error(`already exists: ${write.path}`);
      if (write.operation === 'create' && write.path === this.conflictPath) continue;
      this.documents.set(write.path, structuredClone(write.data));
    }
  }
}

const store = new MemoryStore();
const applied = await executeG8V2Activation(store, plan, () => '2026-08-06T00:00:00.000Z');
assert.equal(applied.documentsWritten, 3352);
assert.equal(applied.status, 'active');
assert.equal(store.documents.get(plan.manifestPath)?.state, 'active');
assert.equal(store.commits.length, 11);
assert.equal((await verifyG8V2Activation(store, plan)).promotedContentDocuments, 3352);
const noOp = await executeG8V2Activation(store, plan);
assert.equal(noOp.applied, false);
const rollback = await rollbackG8V2Activation(store, plan, () => '2026-08-06T00:01:00.000Z');
assert.equal(rollback.activeFederalGeneration, 'legacy-2026');
assert.equal(store.documents.get(plan.manifestPath)?.state, 'rollback');
assert.equal(store.documents.has('ballotMeasures/2026-CA-proposition-1'), true);

const conflictPath = plan.documents[0].path;
const conflicting = new MemoryStore(conflictPath);
conflicting.documents.set(conflictPath, { incompatible: true });
await assert.rejects(() => executeG8V2Activation(conflicting, plan), /conflicting active v2 content/);
assert.equal(conflicting.commits.length, 0);

const pending = new MemoryStore();
pending.documents.set(plan.manifestPath, { ...plan.pendingSelector, pendingAt: '2026-08-06T00:00:00.000Z' });
pending.documents.set(plan.documents[0].path, plan.documents[0].data);
const resumed = await executeG8V2Activation(pending, plan, () => '2026-08-06T00:02:00.000Z');
assert.equal(resumed.resumed, true);
assert.equal(resumed.documentsWritten, 3351);
assert.equal(pending.documents.get(plan.manifestPath)?.state, 'active');
console.log('G8.3A v2 activation executor tests passed');
