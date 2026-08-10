import assert from 'node:assert/strict';
import { Firestore } from '@google-cloud/firestore';
import { encodeFirestoreSnapshotValue } from './canonicalMigration.js';
import { captureG8V2Conflicts } from './g8V2ConflictCapture.js';
import { buildG8V2ConflictCertifiedPlan } from './g8V2ConflictCli.js';
import { sameG8V2ActivationData } from './g8V2Activation.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('run with the alternate G8.4BR5A Firestore emulator configuration');
process.env.PROJECT_ID = 'politipiks';
process.env.FIRESTORE_DATABASE_ID = 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a';
const { plan } = buildG8V2ConflictCertifiedPlan();
const db = new Firestore({ projectId: process.env.PROJECT_ID, databaseId: process.env.FIRESTORE_DATABASE_ID });
const exact = plan.documents[0];
const metadata = plan.documents.find((document) => document.path !== exact.path && document.data.canonicalActivation)!;
const substantive = plan.documents.find((document) => ![exact.path, metadata.path].includes(document.path))!;
const metadataActual = structuredClone(metadata.data);
(metadataActual.canonicalActivation as Record<string, unknown>).activationImplementationCommit = 'b'.repeat(40);
const substantiveActual = structuredClone(substantive.data);
substantiveActual.productionOnlyEvidence = { preserved: true, sourceUrl: 'https://example.invalid/emulator' };
const selector = { contract: 'legacy/v1', state: 'active', preserved: true };

let setup = db.batch();
setup.create(db.doc(plan.manifestPath), selector);
setup.create(db.doc(exact.path), exact.data);
setup.create(db.doc(metadata.path), metadataActual);
setup.create(db.doc(substantive.path), substantiveActual);
await setup.commit();

let reads = 0;
let writesDuringCapture = 0;
const snapshot = await captureG8V2Conflicts({
  plan,
  capture: {
    capturedAt: '2026-08-10T20:00:00.000Z', captureReceipt: 'g8-4br5b-emulator-conflict-capture',
    projectId: plan.target.projectId, databaseId: plan.target.databaseId, generation: plan.generation,
    shadowSourceCommit: plan.shadowSourceCommit, activationImplementationCommit: plan.activationImplementationCommit,
    conflictAnalysisImplementationCommit: 'a'.repeat(40),
  },
  store: {
    async get(path) {
      reads += 1;
      const document = await db.doc(path).get();
      return document.exists ? encodeFirestoreSnapshotValue(document.data(), path) as Record<string, unknown> : null;
    },
  },
});

assert.equal(reads, 3353);
assert.equal(writesDuringCapture, 0);
assert.equal(snapshot.readAccounting.selector.attempted, 1);
assert.equal(snapshot.readAccounting.exactPaths.attempted, 3352);
assert.equal(snapshot.readAccounting.collectionScans, 0);
assert.deepEqual({ exact: snapshot.counts.exact, missing: snapshot.counts.missing, conflicting: snapshot.counts.conflicting, unknown: snapshot.counts.unknown }, { exact: 1, missing: 3349, conflicting: 2, unknown: 0 });
assert.equal(snapshot.writeAccounting.attempted, 0);
assert.equal(snapshot.selector.status, 'present');
assert.equal(snapshot.conflicts.length, 2);
assert.ok(snapshot.conflicts.every((conflict) => conflict.actual && conflict.expected));

const afterSelector = await db.doc(plan.manifestPath).get();
const afterExact = await db.doc(exact.path).get();
const afterMetadata = await db.doc(metadata.path).get();
const afterSubstantive = await db.doc(substantive.path).get();
assert.ok(sameG8V2ActivationData(encodeFirestoreSnapshotValue(afterSelector.data()), selector));
assert.ok(sameG8V2ActivationData(encodeFirestoreSnapshotValue(afterExact.data()), exact.data));
assert.ok(sameG8V2ActivationData(encodeFirestoreSnapshotValue(afterMetadata.data()), metadataActual));
assert.ok(sameG8V2ActivationData(encodeFirestoreSnapshotValue(afterSubstantive.data()), substantiveActual));
console.log('G8.4BR5A alternate-port mixed conflict capture passed: 3353 exact reads, 0 writes, 0 scans');
