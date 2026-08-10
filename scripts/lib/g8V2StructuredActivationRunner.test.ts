import assert from 'node:assert/strict';
import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, type G8V2ActivationPlan, type G8V2ActivationStore, type G8V2ActivationWrite } from './g8V2Activation.js';
import { buildG8V2ProductionArgumentArrays } from './g8V2ActivationPreflight.js';
import { runG8V2StructuredActivation } from './g8V2StructuredActivationRunner.js';

const receipts = {
  shadowVerification: 'g8-4br4b-shadow-verification-runner',
  promotion: 'g8-4br4b-content-promotion-runner',
  activation: 'g8-4br4b-selector-activation-runner',
  rollback: 'g8-4br4b-selector-rollback-runner',
};
const generated = buildG8V2ProductionArgumentArrays({
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json',
  bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: 'a'.repeat(40),
  receipts,
  verifyImplementation: false,
});
const safeEnvironment = { credentialPathConfigured: false, credentialPathExists: null, credentialJsonParseable: null, requiredCredentialFieldsValid: null, configuredProjectMatches: true, configuredDatabaseMatches: true, unsafeFlagsPresent: false };

class MemoryStore implements G8V2ActivationStore {
  readonly documents = new Map<string, Record<string, unknown>>();
  readonly commits: G8V2ActivationWrite[][] = [];
  contentBatches = 0;
  failContentBatch = 0;
  failureCode = 'RESOURCE_EXHAUSTED';
  async get(path: string) { return this.documents.get(path) ?? null; }
  async commit(writes: G8V2ActivationWrite[]) {
    const content = writes[0]?.path !== 'catalogActivations/canonical-2026';
    if (content) this.contentBatches += 1;
    if (content && this.failContentBatch === this.contentBatches) throw Object.assign(new Error('private_key=SECRET token=SECRET'), { code: this.failureCode });
    this.commits.push(structuredClone(writes));
    for (const write of writes) {
      if (write.operation === 'create' && this.documents.has(write.path)) throw Object.assign(new Error('already exists'), { code: 'ALREADY_EXISTS' });
      this.documents.set(write.path, structuredClone(write.data));
    }
  }
}

let capturedPlan: G8V2ActivationPlan | null = null;
const run = async (invocation: typeof generated.apply, store: MemoryStore, extra: Record<string, unknown> = {}) => runG8V2StructuredActivation(invocation.arguments.slice(2), {
  loadDotenv: () => {}, validateEnvironment: () => safeEnvironment, assertImplementation: () => {}, offlineBootstrap: true,
  bootstrapActivation: async (plan) => { capturedPlan = plan; return store; },
  bootstrapShadow: async () => ({}) as any,
  verifyShadow: async (_shadow, shadowPlan) => ({ contentDigest: shadowPlan.namespaceDigest }),
  ...extra,
});

const absentStore = new MemoryStore();
const absent = await run(generated.apply, absentStore);
assert.equal(absent.status, 'completed');
assert.equal(absent.mode, 'apply');
assert.equal(absent.selector.before, 'absent');
assert.equal(absent.selector.pending, 'created');
assert.equal(absent.selector.active, 'written');
assert.deepEqual(absent.content, { expected: 3352, exact: 3352, missing: 0, conflicting: 0, unknown: 0 });
assert.equal(absent.operations.reads.selector.succeeded, 1);
assert.equal(absent.operations.reads.content.succeeded, 6704);
assert.equal(absent.operations.writes.content.succeeded, 3352);
assert.equal(absent.operations.writes.selector.succeeded, 2);
assert.equal(absent.batches.completed, 11);
assert.equal(absentStore.documents.get('catalogActivations/canonical-2026')?.state, 'active');

const verify = await run(generated.verifyOnly, absentStore);
assert.equal(verify.status, 'completed');
assert.equal(verify.mode, 'verify-only');
assert.equal(verify.selector.active, 'verified');
assert.equal(verify.operations.reads.content.succeeded, 3352);
assert.equal(verify.operations.writes.selector.planned, 0);

assert.ok(capturedPlan);
const plan = capturedPlan as G8V2ActivationPlan;
const partialStore = new MemoryStore();
partialStore.documents.set(plan.manifestPath, { ...plan.pendingSelector, pendingAt: '2026-08-10T00:00:00.000Z' });
partialStore.documents.set(plan.documents[0].path, structuredClone(plan.documents[0].data));
const partial = await run(generated.apply, partialStore);
assert.equal(partial.status, 'completed');
assert.equal(partial.selector.before, 'pending');
assert.equal(partial.selector.pending, 'compatible');
assert.equal(partial.operations.writes.content.succeeded, 3351);
assert.equal(partial.operations.writes.content.notAttempted, 1);

const selectorConflictStore = new MemoryStore();
selectorConflictStore.documents.set(plan.manifestPath, { contract: 'legacy/v1', state: 'active' });
const selectorConflict = await run(generated.apply, selectorConflictStore);
assert.equal(selectorConflict.status, 'failed');
assert.equal(selectorConflict.error?.code, 'SELECTOR_CONFLICT');
assert.equal(selectorConflict.operations.reads.content.notAttempted, 6704);
assert.equal(selectorConflict.operations.writes.content.attempted, 0);

const contentConflictStore = new MemoryStore();
contentConflictStore.documents.set(plan.documents[0].path, { incompatible: true });
const contentConflict = await run(generated.apply, contentConflictStore);
assert.equal(contentConflict.status, 'failed');
assert.equal(contentConflict.error?.code, 'CONTENT_CONFLICT');
assert.equal(contentConflict.content.conflicting, 1);
assert.equal(contentConflict.operations.writes.selector.attempted, 0);
assert.equal(contentConflictStore.documents.get(plan.documents[0].path)?.incompatible, true);

const failureStore = new MemoryStore();
failureStore.failContentBatch = 2;
const failed = await run(generated.apply, failureStore);
assert.equal(failed.status, 'failed');
assert.equal(failed.failedPhase, 'content-promotion');
assert.equal(failed.error?.code, 'QUOTA_EXCEEDED');
assert.equal(failed.selector.pending, 'created');
assert.equal(failed.operations.writes.content.succeeded, 399);
assert.equal(failed.operations.writes.content.failed, 399);
assert.equal(failed.batches.completed, 2);
assert.equal(failed.batches.failed, 1);
assert.equal(failed.content.exact, 399);
assert.equal(failed.content.missing, 2953);
assert.doesNotMatch(JSON.stringify(failed), /SECRET|private_key|token=/);
failureStore.failContentBatch = 0;
const resumed = await run(generated.apply, failureStore);
assert.equal(resumed.status, 'completed');
assert.equal(resumed.selector.before, 'pending');
assert.equal(resumed.operations.writes.content.succeeded, 2953);
assert.equal(resumed.operations.writes.content.notAttempted, 399);
assert.deepEqual(resumed.content, { expected: 3352, exact: 3352, missing: 0, conflicting: 0, unknown: 0 });

const permissionStore = new MemoryStore();
permissionStore.failContentBatch = 1;
permissionStore.failureCode = 'PERMISSION_DENIED';
const permission = await run(generated.apply, permissionStore);
assert.equal(permission.error?.code, 'PERMISSION_DENIED');
assert.equal(permission.operations.writes.content.failed, 399);
assert.equal(permission.selector.pending, 'created');

console.log('G8.4BR4A structured activation runner tests passed');
