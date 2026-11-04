import assert from 'node:assert/strict';
import { getHeapStatistics } from 'node:v8';
import { G8_BR7B_INNER_TSX_HEAP_MB } from './g8Br7bInnerTsxInvocation.js';
import {
  buildCertifiedG8V2ConflictReconciliationPlan,
  createFirestoreG8V2ConflictReconciliationStore,
  executeG8V2ConflictReconciliation,
  G8_V2_RECONCILIATION_BATCH_SIZE,
  type G8V2ReconciliationStore,
} from './g8V2ConflictReconciliation.js';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const hostMatch = /^(127\.0\.0\.1|localhost|\[::1\]):(\d{2,5})$/.exec(emulatorHost);
if (!hostMatch) throw new Error('run with the loopback G8.4BR7B Firestore emulator configuration');
const credentialConfigured = Object.entries(process.env).some(([key, value]) =>
  ['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS'].includes(key.toUpperCase())
  && typeof value === 'string'
  && value.trim().length > 0,
);
if (credentialConfigured) throw new Error('credential environment is forbidden for the G8.4BR7B emulator test');

const [{ Firestore, Timestamp }] = await Promise.all([import('@google-cloud/firestore')]);
const projectId = 'demo-no-project';
const plan = buildCertifiedG8V2ConflictReconciliationPlan();
const certifiedSemanticDigests = {
  overridePolicy: '1167d651066fe8e0c130366e1981000d538b3d12405607cb8a5dfa1be1c64b3b',
  entries: 'db946e81664318e666daf12ecfc1bdbcf600dea6b1cc109296f933a979d8cbfb',
  aggregate: '0ae00a719842cbfa58767dae12b280e35406ed72a3cf2501ad3518c8d7dbfc8c',
  outputs: '0ac958cd0dbcf43cba20ef1b64ab7957fa4255dc76a79efb71306146957f84e2',
  rollback: '80241286ec7cfb0e45844adbf2758883e0c8d8ec8d2b98c26b3db5f66986529d',
  plan: 'ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23',
} as const;
assert.deepEqual(plan.semanticDigests, certifiedSemanticDigests, 'the BR7B emulator plan semantic digests must remain certified');
const certifiedHeapArgument = `--max-old-space-size=${G8_BR7B_INNER_TSX_HEAP_MB}`;
assert.deepEqual(
  process.execArgv.filter((argument) => argument.startsWith('--max-old-space-size=')),
  [certifiedHeapArgument],
  'the BR7B emulator test child must receive the exact direct heap argument',
);
const heapLimitBytes = getHeapStatistics().heap_size_limit;
assert.ok(
  heapLimitBytes >= G8_BR7B_INNER_TSX_HEAP_MB * 1024 * 1024
    && heapLimitBytes <= (G8_BR7B_INNER_TSX_HEAP_MB + 64) * 1024 * 1024,
  'the BR7B emulator test child must enforce its bounded heap policy',
);
const heapUsedBeforeCompaction = process.memoryUsage().heapUsed;
const explicitGc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
assert.equal(typeof explicitGc, 'function', 'BR7B_EMULATOR_HEAP_COMPACTION_REQUIRED');
explicitGc();
const heapUsedAfterCompaction = process.memoryUsage().heapUsed;
assert.ok(heapUsedAfterCompaction <= heapUsedBeforeCompaction, 'post-plan heap compaction must not increase retained heap');
assert.ok(heapUsedAfterCompaction <= 256 * 1024 * 1024, 'post-plan retained heap must remain within the emulator-test envelope');
console.log('BR7B_SAFE_PHASE:heap-policy-and-plan');
const allowedPaths = new Set(plan.operations.map((operation) => operation.path));
const db = new Firestore({
  projectId,
  servicePath: hostMatch[1] === '[::1]' ? '::1' : hostMatch[1],
  port: Number(hostMatch[2]),
  ssl: false,
});
console.log('BR7B_SAFE_PHASE:firestore-client-created');

const decodeTags = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(decodeTags);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, any>;
  if (record.__firestoreType === 'timestamp/v1') return new Timestamp(record.seconds, record.nanoseconds);
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, decodeTags(child)]));
};

for (let start = 0; start < plan.operations.length; start += G8_V2_RECONCILIATION_BATCH_SIZE) {
  const batch = db.batch();
  for (const operation of plan.operations.slice(start, start + G8_V2_RECONCILIATION_BATCH_SIZE)) {
    batch.set(db.doc(operation.path), decodeTags(operation.rollback) as Record<string, any>);
  }
  await batch.commit();
}
console.log('BR7B_SAFE_PHASE:certified-rollbacks-seeded');

await assert.rejects(() => createFirestoreG8V2ConflictReconciliationStore(plan, { projectId: 'politipiks', emulatorHost, environment: {} }), /DEMO_PROJECT_REQUIRED/);
await assert.rejects(() => createFirestoreG8V2ConflictReconciliationStore(plan, { projectId, emulatorHost: 'example.com:443', environment: {} }), /LOOPBACK_EMULATOR_REQUIRED/);
await assert.rejects(() => createFirestoreG8V2ConflictReconciliationStore(plan, { projectId, emulatorHost, environment: { GOOGLE_APPLICATION_CREDENTIALS: 'forbidden.json' } }), /CREDENTIAL_ENVIRONMENT_FORBIDDEN/);
const firestoreStore = await createFirestoreG8V2ConflictReconciliationStore(plan, { projectId, emulatorHost, environment: { FIRESTORE_EMULATOR_HOST: emulatorHost } });
console.log('BR7B_SAFE_PHASE:emulator-store-created');
let commitCalls = 0;
let interruptBeforeBatch: number | null = null;
let changeBeforeGuard = false;
let closedStores = 0;
const batchSizes: number[] = [];
const readPaths: string[] = [];
const trackedStore: G8V2ReconciliationStore = {
  read(path) {
    readPaths.push(path);
    return firestoreStore.read(path);
  },
  async commit(writes) {
    commitCalls += 1;
    batchSizes.push(writes.length);
    if (commitCalls === interruptBeforeBatch) {
      throw Object.assign(new Error('injected interruption'), { guardReads: 0, writeOutcome: 'none' as const });
    }
    if (changeBeforeGuard) {
      changeBeforeGuard = false;
      await db.doc(writes[0].path).set({ changedAfterPreclassification: true });
    }
    return firestoreStore.commit(writes);
  },
  async close() {
    await firestoreStore.close?.();
    closedStores += 1;
  },
};

const initialDryRun = await executeG8V2ConflictReconciliation({ mode: 'dry-run', plan, store: trackedStore });
assert.equal(initialDryRun.status, 'completed');
assert.equal(initialDryRun.classification.certifiedRollbacks, 858);
assert.equal(initialDryRun.operations.writes.planned, 858);
assert.equal(initialDryRun.operations.writes.attempted, 0);
assert.deepEqual(readPaths, plan.operations.map((operation) => operation.path));
assert.equal(new Set(readPaths).size, 858);
assert.ok(readPaths.every((path) => allowedPaths.has(path)));
console.log('BR7B_SAFE_PHASE:initial-dry-run-complete');

const first = plan.operations[0];
await db.doc(first.path).set({ thirdValue: true });
readPaths.length = 0;
const rejected = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: trackedStore });
assert.equal(rejected.error?.code, 'BR7B_DESTINATION_THIRD_VALUE');
assert.equal(rejected.operations.reads.preflight, 858);
assert.equal(rejected.operations.reads.scans, 0);
assert.equal(rejected.operations.writes.batchesAttempted, 0);
assert.equal(commitCalls, 0);
assert.equal(readPaths.length, 858);
assert.ok(readPaths.every((path) => allowedPaths.has(path)));
await db.doc(first.path).set(decodeTags(first.rollback) as Record<string, any>);
console.log('BR7B_SAFE_PHASE:third-value-guard-complete');

interruptBeforeBatch = 2;
const interrupted = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: trackedStore });
assert.equal(interrupted.status, 'failed');
assert.equal(interrupted.manifest.batchProgress.completedWrites, 100);
assert.equal(interrupted.operations.writes.batchesCompleted, 1);
assert.equal(interrupted.operations.writes.failed, 100);
assert.equal(interrupted.operations.writes.unknown, 0);

interruptBeforeBatch = null;
commitCalls = 0;
const resumed = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: trackedStore });
assert.equal(resumed.status, 'completed');
assert.equal(resumed.manifest.resume.wasResume, true);
assert.equal(resumed.classification.certifiedOutputs, 100);
assert.equal(resumed.classification.certifiedRollbacks, 758);
assert.equal(resumed.operations.writes.succeeded, 758);
assert.ok(batchSizes.every((size) => size > 0 && size <= G8_V2_RECONCILIATION_BATCH_SIZE));
assert.equal(resumed.operations.reads.preflight, 858);
assert.equal(resumed.operations.reads.guards, 758);
assert.equal(resumed.operations.reads.verification, 858);
assert.equal(resumed.operations.reads.scans, 0);
console.log('BR7B_SAFE_PHASE:resume-complete');

const exactOutputs = await executeG8V2ConflictReconciliation({ mode: 'dry-run', plan, store: trackedStore });
assert.equal(exactOutputs.classification.certifiedOutputs, 858);
assert.equal(exactOutputs.operations.writes.planned, 0);
const idempotent = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: trackedStore });
assert.equal(idempotent.operations.writes.attempted, 0);
console.log('BR7B_SAFE_PHASE:idempotence-complete');

commitCalls = 0;
changeBeforeGuard = true;
const guardedRollback = await executeG8V2ConflictReconciliation({ mode: 'rollback', plan, store: trackedStore });
assert.equal(guardedRollback.status, 'failed');
assert.equal(guardedRollback.error?.code, 'BR7B_GUARDED_BATCH_WRITE_FAILED');
assert.equal(guardedRollback.operations.writes.succeeded, 0);
assert.equal(guardedRollback.operations.writes.failed, 100);
assert.equal(guardedRollback.operations.writes.unknown, 0);
await db.doc(first.path).set(decodeTags(first.output) as Record<string, any>);
console.log('BR7B_SAFE_PHASE:guarded-rollback-complete');

const rolledBack = await executeG8V2ConflictReconciliation({ mode: 'rollback', plan, store: trackedStore });
assert.equal(rolledBack.status, 'completed');
assert.equal(rolledBack.manifest.state, 'rollback');
assert.equal(rolledBack.operations.writes.succeeded, 858);
const exactRollbacks = await executeG8V2ConflictReconciliation({ mode: 'dry-run', plan, store: trackedStore });
assert.equal(exactRollbacks.classification.certifiedRollbacks, 858);

assert.ok(readPaths.every((path) => allowedPaths.has(path)), 'the executor must never read outside the 858 certified paths');
await trackedStore.close?.();
await db.terminate();
assert.equal(closedStores, 1);
console.log('BR7B_SAFE_PHASE:clients-closed');

console.log('G8.4BR7B emulator lifecycle passed: 858 exact paths, zero scans/deletes/selectors, bounded guarded transactions, post-plan heap <= 256 MiB, unchanged semantic digests, closed clients');
