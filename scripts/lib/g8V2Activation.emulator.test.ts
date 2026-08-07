import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Firestore } from '@google-cloud/firestore';
import { buildG8ProductShadowWritePlan, createFirestoreG8ProductShadowStore, executeG8ProductShadowWritePlan, verifyG8ProductShadowNamespace } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, createFirestoreG8V2ActivationStore, executeG8V2Activation, rollbackG8V2Activation, verifyG8V2Activation } from './g8V2Activation.js';
import { validateLocalProductBundle } from './localProductBundle.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('run this test with the alternate Firebase emulator configuration');
process.env.PROJECT_ID = 'politipiks';
process.env.FIRESTORE_DATABASE_ID = 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a';
const bundle = validateLocalProductBundle(JSON.parse(readFileSync('.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', 'utf8')));
const shadowPlan = buildG8ProductShadowWritePlan(bundle, 'b'.repeat(40));
const plan = buildG8V2ActivationPlan(shadowPlan, { shadowVerification: 'g8-3a-shadow-emulator', promotion: 'g8-3a-promotion-emulator', activation: 'g8-3a-activation-emulator', rollback: 'g8-3a-rollback-emulator' });
const db = new Firestore({ projectId: process.env.PROJECT_ID, databaseId: process.env.FIRESTORE_DATABASE_ID });
await db.doc('races/legacy-emulator-sentinel').create({ legacy: true });
await db.doc('ballotMeasures/unrelated-emulator-measure').create({ nonFederal: true });

const shadowStore = await createFirestoreG8ProductShadowStore(shadowPlan);
const shadowResult = await executeG8ProductShadowWritePlan(shadowStore, shadowPlan, () => '2026-08-06T00:00:00.000Z');
assert.equal(shadowResult.status, 'completed');
assert.equal((await verifyG8ProductShadowNamespace(shadowStore, shadowPlan)).verified, true);
assert.equal((await db.doc(plan.manifestPath).get()).exists, false, 'shadow promotion must not expose a selector');
assert.equal((await db.doc('races/2026-CA-senate-class-1').get()).exists, false, 'shadow promotion must not write active documents');

await db.doc(plan.manifestPath).create({ ...plan.pendingSelector, pendingAt: '2026-08-06T00:01:00.000Z' });
await db.doc(plan.documents[0].path).create(plan.documents[0].data);
const activationStore = await createFirestoreG8V2ActivationStore(plan);
const resumed = await executeG8V2Activation(activationStore, plan, () => '2026-08-06T00:02:00.000Z');
assert.equal(resumed.resumed, true);
assert.equal(resumed.documentsWritten, 3351);
assert.equal((await db.doc(plan.manifestPath).get()).get('state'), 'active');
assert.equal((await verifyG8V2Activation(activationStore, plan)).promotedContentDocuments, 3352);
assert.deepEqual((await db.doc('races/legacy-emulator-sentinel').get()).data(), { legacy: true });
assert.deepEqual((await db.doc('ballotMeasures/unrelated-emulator-measure').get()).data(), { nonFederal: true });
const rollback = await rollbackG8V2Activation(activationStore, plan, () => '2026-08-06T00:03:00.000Z');
assert.equal(rollback.activeMeasureGeneration, 'none');
assert.equal((await db.doc(plan.manifestPath).get()).get('activeFederalGeneration'), 'legacy-2026');
assert.equal((await db.doc('ballotMeasures/2026-CA-proposition-1').get()).exists, true, 'rollback retains v2 measure data');
console.log('G8.3A v2 activation emulator tests passed');
