import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Firestore } from '@google-cloud/firestore';
import {
  buildG8ProductShadowRootManifest,
  buildG8ProductShadowWritePlan,
  createFirestoreG8ProductShadowStore,
  executeG8ProductShadowWritePlan,
  verifyG8ProductShadowNamespace,
  CERTIFIED_G8_PRODUCT_SHADOW,
} from './g8ProductShadowExecutor.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('run this test with firebase emulators:exec --only firestore');
process.env.PROJECT_ID = CERTIFIED_G8_PRODUCT_SHADOW.projectId;
process.env.FIRESTORE_DATABASE_ID = CERTIFIED_G8_PRODUCT_SHADOW.databaseId;

const bundle = JSON.parse(readFileSync('.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', 'utf8')) as unknown;
const plan = buildG8ProductShadowWritePlan(bundle, 'b'.repeat(40));
const db = new Firestore({ projectId: CERTIFIED_G8_PRODUCT_SHADOW.projectId, databaseId: CERTIFIED_G8_PRODUCT_SHADOW.databaseId });
await db.doc('races/active-emulator-sentinel').create({ untouched: true });
await db.doc('catalogActivations/canonical-2026').create({ state: 'active', untouched: true });
const activeBefore = (await db.doc('races/active-emulator-sentinel').get()).data();
const selectorBefore = (await db.doc('catalogActivations/canonical-2026').get()).data();
const store = await createFirestoreG8ProductShadowStore(plan);
const initialRoot = buildG8ProductShadowRootManifest(plan, 'running', 399, 1, '2026-08-05T00:02:00.000Z');
await store.commit([
  { operation: 'create', path: 'migrationShadows/canonical-2026-shadow-v2', data: initialRoot },
  ...plan.documents.slice(0, 399).map((document) => ({ operation: 'create' as const, path: document.path, data: document.data })),
]);
const resumed = await executeG8ProductShadowWritePlan(store, plan, () => '2026-08-05T00:03:00.000Z');
assert.equal(resumed.applied, true);
assert.equal(resumed.resumed, true);
assert.equal(resumed.documentsWritten, 2953);
assert.equal(resumed.batches, 9);
const verification = await verifyG8ProductShadowNamespace(store, plan);
assert.equal(verification.verified, true);
assert.equal(verification.contentDigest, plan.namespaceDigest);
assert.deepEqual((await db.doc('races/active-emulator-sentinel').get()).data(), activeBefore);
assert.deepEqual((await db.doc('catalogActivations/canonical-2026').get()).data(), selectorBefore);
const noOp = await executeG8ProductShadowWritePlan(store, plan);
assert.equal(noOp.applied, false);
assert.equal(noOp.documentsWritten, 0);
console.log('G8.2A product shadow emulator tests passed');
