import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Firestore } from '@google-cloud/firestore';
import { buildG8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, createFirestoreG8V2ActivationAuditStore } from './g8V2Activation.js';
import { getCurrentG8V2ActivationImplementationCommit, getCurrentG8V2StateAuditImplementationCommit } from './g8V2ActivationCli.js';
import { buildG8V2StateAuditProductionArguments } from './g8V2StateAuditPreflight.js';
import { runG8V2StructuredAudit } from './g8V2StructuredAuditRunner.js';
import { validateLocalProductBundle } from './localProductBundle.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('run this test with the alternate Firebase emulator configuration');
process.env.PROJECT_ID = 'politipiks';
process.env.FIRESTORE_DATABASE_ID = 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a';
const bundle = validateLocalProductBundle(JSON.parse(readFileSync('.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', 'utf8')));
const shadowPlan = buildG8ProductShadowWritePlan(bundle, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT);
const plan = buildG8V2ActivationPlan(shadowPlan, { shadowVerification: 'g8-4br3a-emulator-shadow', promotion: 'g8-4br3a-emulator-promotion', activation: 'g8-4br3a-emulator-activation', rollback: 'g8-4br3a-emulator-rollback' }, { identitySchemaVersion: 2, shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit() });
const generated = buildG8V2StateAuditProductionArguments({
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json', bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit(), stateAuditImplementationCommit: getCurrentG8V2StateAuditImplementationCommit(),
  activationReceipts: { shadowVerification: 'g8-4br3a-emulator-shadow', promotion: 'g8-4br3a-emulator-promotion', activation: 'g8-4br3a-emulator-activation', rollback: 'g8-4br3a-emulator-rollback' }, auditReceipt: 'g8-4br3a-emulator-audit',
});
const args = generated.audit.arguments.slice(2);
const safeEnvironment = { credentialPathConfigured: false, credentialPathExists: null, credentialJsonParseable: null, requiredCredentialFieldsValid: null, configuredProjectMatches: true, configuredDatabaseMatches: true, unsafeFlagsPresent: false };
const db = new Firestore({ projectId: process.env.PROJECT_ID, databaseId: process.env.FIRESTORE_DATABASE_ID });
const baseHooks = { loadDotenv: () => {}, validateEnvironment: () => safeEnvironment, bootstrap: async (auditPlan: typeof plan) => createFirestoreG8V2ActivationAuditStore(auditPlan) };
const run = (extra: any = {}) => runG8V2StructuredAudit(args, { ...baseHooks, ...extra });

const absent = await run();
assert.equal(absent.selector.state, 'absent');
assert.equal(absent.contentAudit, null);
assert.equal(absent.reads.selector.succeeded, 1);
assert.equal(absent.reads.exactPaths.notAttempted, 3352);

await db.doc(plan.manifestPath).create({ contract: 'legacy/v1', state: 'active' });
const legacy = await run();
assert.equal(legacy.selector.state, 'legacy');
assert.equal(legacy.reads.exactPaths.notAttempted, 3352);
await db.doc(plan.manifestPath).delete();

await db.doc(plan.manifestPath).create(plan.pendingSelector);
const pending = await run();
assert.equal(pending.selector.state, 'pending');
assert.deepEqual(pending.contentAudit, { expected: 3352, exact: 0, missing: 3352, conflicting: 0 });
await db.doc(plan.manifestPath).delete();

let batch = db.batch();
for (const [index, document] of plan.documents.entries()) {
  batch.create(db.doc(document.path), document.data);
  if ((index + 1) % 400 === 0 || index === plan.documents.length - 1) { await batch.commit(); batch = db.batch(); }
}
await db.doc(plan.manifestPath).create(plan.activeSelector);
const active = await run();
assert.equal(active.selector.state, 'active');
assert.deepEqual(active.contentAudit, { expected: 3352, exact: 3352, missing: 0, conflicting: 0 });

await db.doc(plan.documents[0].path).set({ changed: true });
const conflict = await run();
assert.equal(conflict.selector.state, 'conflict');
assert.deepEqual(conflict.contentAudit, { expected: 3352, exact: 3351, missing: 0, conflicting: 1 });
await db.doc(plan.documents[0].path).set(plan.documents[0].data);
await db.doc(plan.manifestPath).set(plan.rollbackSelector);
const rollback = await run();
assert.equal(rollback.selector.state, 'rollback');
assert.deepEqual(rollback.contentAudit, { expected: 3352, exact: 3352, missing: 0, conflicting: 0 });

await db.doc(plan.manifestPath).set(plan.activeSelector);
const injected = await run({ read: async (kind: string, path: string, defaultRead: () => Promise<Record<string, unknown> | null>) => {
  if (kind === 'exact-path') throw Object.assign(new Error('server completion unknown token=SECRET'), { code: 'DEADLINE_EXCEEDED' });
  return defaultRead();
} });
assert.equal(injected.failedPhase, 'exact-path-reads');
assert.equal(injected.reads.exactPaths.unknown, 100);
assert.equal(injected.reads.exactPaths.attempted, 100);
assert.equal(injected.selector.state, 'active');
assert.doesNotMatch(JSON.stringify(injected), /SECRET|token=/);
assert.equal((await db.doc(plan.manifestPath).get()).get('state'), 'active');
console.log('G8.4BR3A state audit emulator tests passed');
