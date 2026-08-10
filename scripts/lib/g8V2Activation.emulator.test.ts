import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Firestore } from '@google-cloud/firestore';
import { buildG8ProductShadowWritePlan, createFirestoreG8ProductShadowStore, executeG8ProductShadowWritePlan, verifyG8ProductShadowNamespace } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, createFirestoreG8V2ActivationStore } from './g8V2Activation.js';
import { buildG8V2ProductionArgumentArrays } from './g8V2ActivationPreflight.js';
import { runG8V2StructuredActivation } from './g8V2StructuredActivationRunner.js';
import { validateLocalProductBundle } from './localProductBundle.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('run this test with the alternate Firebase emulator configuration');
process.env.PROJECT_ID = 'politipiks';
process.env.FIRESTORE_DATABASE_ID = 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a';
const bundle = validateLocalProductBundle(JSON.parse(readFileSync('.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', 'utf8')));
const shadowPlan = buildG8ProductShadowWritePlan(bundle, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT);
const receipts = { shadowVerification: 'g8-4br4b-shadow-verification-emulator', promotion: 'g8-4br4b-content-promotion-emulator', activation: 'g8-4br4b-selector-activation-emulator', rollback: 'g8-4br4b-selector-rollback-emulator' };
const implementation = 'b'.repeat(40);
const plan = buildG8V2ActivationPlan(shadowPlan, receipts, { identitySchemaVersion: 2, shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, activationImplementationCommit: implementation });
const generated = buildG8V2ProductionArgumentArrays({ manifestPath: 'docs/g8-catalog-beta-release-manifest.json', bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, activationImplementationCommit: implementation, receipts, verifyImplementation: false });
const db = new Firestore({ projectId: process.env.PROJECT_ID, databaseId: process.env.FIRESTORE_DATABASE_ID });
await db.doc('races/legacy-emulator-sentinel').create({ legacy: true });
await db.doc('ballotMeasures/unrelated-emulator-measure').create({ nonFederal: true });

const shadowStore = await createFirestoreG8ProductShadowStore(shadowPlan);
const shadowResult = await executeG8ProductShadowWritePlan(shadowStore, shadowPlan, () => '2026-08-10T00:00:00.000Z');
assert.equal(shadowResult.status, 'completed');
assert.equal((await verifyG8ProductShadowNamespace(shadowStore, shadowPlan)).verified, true);
assert.equal((await db.doc(plan.manifestPath).get()).exists, false, 'shadow promotion must not expose a selector');

const safeEnvironment = { credentialPathConfigured: false, credentialPathExists: null, credentialJsonParseable: null, requiredCredentialFieldsValid: null, configuredProjectMatches: true, configuredDatabaseMatches: true, unsafeFlagsPresent: false };
let injectQuota = true;
let contentBatches = 0;
const hooks = {
  loadDotenv: () => {}, validateEnvironment: () => safeEnvironment, assertImplementation: () => {},
  bootstrapActivation: async (candidate: typeof plan) => createFirestoreG8V2ActivationStore(candidate),
  bootstrapShadow: async () => shadowStore,
  commit: async (kind: string, _writes: unknown[], defaultCommit: () => Promise<void>) => {
    if (kind === 'content') contentBatches += 1;
    if (kind === 'content' && injectQuota && contentBatches === 2) throw Object.assign(new Error('quota private_key=SECRET token=SECRET'), { code: 'RESOURCE_EXHAUSTED' });
    await defaultCommit();
  },
};

const failed = await runG8V2StructuredActivation(generated.apply.arguments.slice(2), hooks as any);
assert.equal(failed.status, 'failed');
assert.equal(failed.error?.code, 'QUOTA_EXCEEDED');
assert.equal(failed.selector.before, 'absent');
assert.equal(failed.selector.pending, 'created');
assert.equal(failed.operations.writes.content.succeeded, 399);
assert.equal(failed.operations.writes.content.failed, 399);
assert.equal(failed.content.exact, 399);
assert.equal((await db.doc(plan.manifestPath).get()).get('state'), 'pending');
assert.doesNotMatch(JSON.stringify(failed), /SECRET|private_key|token=/);

injectQuota = false;
const resumed = await runG8V2StructuredActivation(generated.apply.arguments.slice(2), hooks as any);
assert.equal(resumed.status, 'completed');
assert.equal(resumed.selector.before, 'pending');
assert.equal(resumed.selector.pending, 'compatible');
assert.equal(resumed.operations.writes.content.succeeded, 2953);
assert.equal(resumed.operations.writes.content.notAttempted, 399);
assert.deepEqual(resumed.content, { expected: 3352, exact: 3352, missing: 0, conflicting: 0, unknown: 0 });
assert.equal((await db.doc(plan.manifestPath).get()).get('state'), 'active');

const verified = await runG8V2StructuredActivation(generated.verifyOnly.arguments.slice(2), hooks as any);
assert.equal(verified.status, 'completed');
assert.equal(verified.selector.active, 'verified');
assert.equal(verified.content.exact, 3352);
assert.deepEqual((await db.doc('races/legacy-emulator-sentinel').get()).data(), { legacy: true });
assert.deepEqual((await db.doc('ballotMeasures/unrelated-emulator-measure').get()).data(), { nonFederal: true });

const rollback = await runG8V2StructuredActivation(generated.rollback.arguments.slice(2), hooks as any);
assert.equal(rollback.status, 'completed');
assert.equal((await db.doc(plan.manifestPath).get()).get('activeFederalGeneration'), 'legacy-2026');
assert.equal((await db.doc('ballotMeasures/2026-CA-proposition-1').get()).exists, true, 'selector-only rollback retains v2 measure data');
console.log('G8.4BR4A alternate-port structured activation emulator tests passed');
