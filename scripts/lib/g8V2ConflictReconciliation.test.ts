import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  assertG8V2ConflictReconciliationManifest,
  assertG8V2ConflictReconciliationPlan,
  assertG8V2ConflictReconciliationResult,
  buildCertifiedG8V2ConflictReconciliationPlan,
  createOfflineG8V2ConflictReconciliationStore,
  executeG8V2ConflictReconciliation,
  G8_V2_RECONCILIATION_BATCH_SIZE,
  type G8V2ReconciliationStore,
  verifyG8V2ConflictReconciliationReplay,
} from './g8V2ConflictReconciliation.js';
import { semanticDigest } from './g8V2ExecutorReadinessReview.js';

class MemoryStore implements G8V2ReconciliationStore {
  readonly values: Map<string, Record<string, any>>;
  readonly batches: number[] = [];
  readonly readPaths: string[] = [];
  failBeforeBatch: number | null = null;
  commitAttempts = 0;
  failReadPath: string | null = null;

  constructor(state: 'output' | 'rollback') {
    this.values = new Map(plan.operations.map((operation) => [operation.path, structuredClone(state === 'output' ? operation.output : operation.rollback)]));
  }

  async read(path: string) {
    this.readPaths.push(path);
    if (path === this.failReadPath) throw new Error('read failed credential=SECRET');
    return { data: this.values.has(path) ? structuredClone(this.values.get(path)!) : null };
  }

  async commit(writes: Array<{ path: string; expectedDigest: string; data: Record<string, any> }>) {
    assert.ok(writes.length > 0 && writes.length <= G8_V2_RECONCILIATION_BATCH_SIZE);
    for (let index = 0; index < writes.length; index += 1) {
      const write = writes[index];
      if (semanticDigest(this.values.get(write.path)) !== write.expectedDigest) {
        throw Object.assign(new Error('guarded write rejected changed current value'), { guardReads: index + 1, writeOutcome: 'none' as const });
      }
    }
    this.commitAttempts += 1;
    if (this.failBeforeBatch === this.commitAttempts) throw Object.assign(new Error('simulated interruption token=SECRET candidate=PRIVATE'), { guardReads: writes.length, writeOutcome: 'none' as const });
    this.batches.push(writes.length);
    for (const write of writes) this.values.set(write.path, structuredClone(write.data));
    return { guardReads: writes.length };
  }
}

const plan = buildCertifiedG8V2ConflictReconciliationPlan();
const dryRun = await executeG8V2ConflictReconciliation({
  mode: 'dry-run',
  plan,
  store: createOfflineG8V2ConflictReconciliationStore(plan, 'rollback'),
});

assert.equal(dryRun.status, 'completed');
assert.equal(dryRun.manifest.state, 'pending');
assert.equal(dryRun.operations.reads.preflight, 858);
assert.equal(dryRun.operations.reads.scans, 0);
assert.equal(dryRun.operations.writes.planned, 858);
assert.equal(dryRun.operations.writes.attempted, 0);
assert.equal(dryRun.manifest.batchProgress.totalBatches, 9);
assert.equal(dryRun.manifest.batchProgress.plannedWrites, 858);
assert.deepEqual(dryRun.classification, {
  certifiedOutputs: 0,
  certifiedRollbacks: 858,
  missing: 0,
  malformed: 0,
  thirdValue: 0,
  readErrors: 0,
});
assert.equal(dryRun.manifest.counts.paths, 858);
assert.equal(dryRun.manifest.counts.races, 429);
assert.equal(dryRun.manifest.counts.metrics, 429);
assert.equal(dryRun.manifest.counts.replaceWithCertified, 4);
assert.equal(dryRun.manifest.counts.deterministicMerges, 854);
assert.doesNotThrow(() => assertG8V2ConflictReconciliationPlan(plan));
assert.doesNotThrow(() => assertG8V2ConflictReconciliationManifest(dryRun.manifest));
assert.doesNotThrow(() => assertG8V2ConflictReconciliationResult(dryRun));
assert.equal(verifyG8V2ConflictReconciliationReplay(dryRun, structuredClone(dryRun)), true);
assert.doesNotMatch(JSON.stringify(dryRun), /races\/|contestMetrics\/|candidate|private[_ -]?key|credential|bearer|token\s*[=:]/i);
const exactPathStore = new MemoryStore('rollback');
await executeG8V2ConflictReconciliation({ mode: 'dry-run', plan, store: exactPathStore });
assert.deepEqual(exactPathStore.readPaths, plan.operations.map((operation) => operation.path));
assert.equal(new Set(exactPathStore.readPaths).size, 858);

assert.throws(() => assertG8V2ConflictReconciliationPlan({ ...plan, unexpected: true } as any), /KEY_SET/);
assert.throws(() => assertG8V2ConflictReconciliationPlan({ ...plan, identities: { ...plan.identities, plan: { ...plan.identities.plan, sha256: '0'.repeat(64) } } } as any), /BINDING/);
assert.throws(() => assertG8V2ConflictReconciliationPlan({ ...plan, counts: { ...plan.counts, paths: 857 } } as any), /COUNT/);
assert.throws(() => assertG8V2ConflictReconciliationPlan({ ...plan, operations: [plan.operations[1], plan.operations[0], ...plan.operations.slice(2)] } as any), /ORDER/);
assert.throws(() => assertG8V2ConflictReconciliationPlan({ ...plan, operations: [plan.operations[0], plan.operations[0], ...plan.operations.slice(2)] } as any), /COVERAGE/);
assert.throws(() => assertG8V2ConflictReconciliationPlan({ ...plan, operations: [{ ...plan.operations[0], output: { tampered: true } }, ...plan.operations.slice(1)] } as any), /OUTPUT_TAMPER/);
assert.throws(() => assertG8V2ConflictReconciliationPlan({ ...plan, operations: [{ ...plan.operations[0], rollback: { tampered: true } }, ...plan.operations.slice(1)] } as any), /ROLLBACK_TAMPER/);
assert.throws(() => assertG8V2ConflictReconciliationPlan({ ...plan, executorPlanDigest: '0'.repeat(64) } as any), /PLAN_DIGEST/);
assert.throws(() => assertG8V2ConflictReconciliationManifest({ ...dryRun.manifest, unexpected: true } as any), /KEY_SET/);
assert.throws(() => assertG8V2ConflictReconciliationManifest({ ...dryRun.manifest, manifestDigest: '0'.repeat(64) } as any), /MANIFEST_DIGEST/);
assert.throws(() => assertG8V2ConflictReconciliationResult({ ...dryRun, rawDocument: plan.operations[0].rollback } as any), /KEY_SET|UNSAFE/);
assert.throws(() => assertG8V2ConflictReconciliationResult({ ...dryRun, receiptDigest: '0'.repeat(64) } as any), /RECEIPT_DIGEST/);
const driftedAccountingBase = { ...dryRun, operations: { ...dryRun.operations, writes: { ...dryRun.operations.writes, planned: 857 } } };
const { receiptDigest: _discardedDriftDigest, ...driftedAccountingBody } = driftedAccountingBase;
assert.throws(() => assertG8V2ConflictReconciliationResult({ ...driftedAccountingBody, receiptDigest: semanticDigest(driftedAccountingBody) } as any), /MANIFEST_OPERATION_DRIFT/);
assert.throws(() => verifyG8V2ConflictReconciliationReplay(dryRun, { ...dryRun, receiptDigest: '0'.repeat(64) } as any), /REPLAY/);

const applyStore = new MemoryStore('rollback');
const applied = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: applyStore });
assert.equal(applied.status, 'completed');
assert.equal(applied.manifest.state, 'completed');
assert.equal(applied.operations.writes.succeeded, 858);
assert.equal(applied.operations.writes.batchesCompleted, 9);
assert.equal(Math.max(...applyStore.batches), G8_V2_RECONCILIATION_BATCH_SIZE);
assert.equal(applied.operations.reads.preflight, 858);
assert.equal(applied.operations.reads.guards, 858);
assert.equal(applied.operations.reads.verification, 858);
assert.equal(applied.operations.reads.scans, 0);
assert.equal(applied.operations.writes.deletes, 0);
assert.equal(applied.operations.writes.selectorOperations, 0);
const appliedVerification = await executeG8V2ConflictReconciliation({ mode: 'dry-run', plan, store: applyStore });
assert.equal(appliedVerification.classification.certifiedOutputs, 858);
assert.equal(appliedVerification.operations.writes.attempted, 0);
const persistedManifests: Array<typeof applied.manifest> = [];
const persistedRollback = await executeG8V2ConflictReconciliation({
  mode: 'rollback',
  plan,
  store: applyStore,
  persistManifest: async (manifest) => { persistedManifests.push(structuredClone(manifest)); },
});
assert.equal(persistedRollback.status, 'completed');
assert.equal(persistedManifests.length, 11, 'pending + nine batch checkpoints + final rollback');
assert.equal(persistedManifests[0].state, 'pending');
assert.equal(persistedManifests[0].batchProgress.completedWrites, 0);
assert.equal(persistedManifests.at(-1)?.state, 'rollback');
assert.equal(persistedManifests.at(-1)?.batchProgress.completedWrites, 858);
persistedManifests.forEach(assertG8V2ConflictReconciliationManifest);

const interruptedStore = new MemoryStore('rollback');
interruptedStore.failBeforeBatch = 2;
const interrupted = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: interruptedStore });
assert.equal(interrupted.status, 'failed');
assert.equal(interrupted.phase, 'batch-write');
assert.equal(interrupted.error?.code, 'BR7B_GUARDED_BATCH_WRITE_FAILED');
assert.equal(interrupted.manifest.state, 'pending');
assert.equal(interrupted.manifest.batchProgress.completedWrites, 100);
assert.equal(interrupted.manifest.batchProgress.completedBatches, 1);
assert.equal(interrupted.operations.reads.guards, 200);
assert.equal(interrupted.operations.writes.failed, 100);
assert.equal(interrupted.operations.writes.unknown, 0);
assert.doesNotMatch(JSON.stringify(interrupted), /SECRET|PRIVATE|candidate=/);

interruptedStore.failBeforeBatch = null;
const resumed = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: interruptedStore });
assert.equal(resumed.status, 'completed');
assert.equal(resumed.manifest.state, 'completed');
assert.equal(resumed.manifest.resume.wasResume, true);
assert.equal(resumed.manifest.resume.certifiedOutputsBefore, 100);
assert.equal(resumed.operations.writes.succeeded, 758);
assert.equal(resumed.operations.writes.batchesCompleted, 8);

const idempotentApply = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: interruptedStore });
assert.equal(idempotentApply.status, 'completed');
assert.equal(idempotentApply.operations.writes.attempted, 0);
assert.equal(idempotentApply.classification.certifiedOutputs, 858);

const rolledBack = await executeG8V2ConflictReconciliation({ mode: 'rollback', plan, store: interruptedStore });
assert.equal(rolledBack.status, 'completed');
assert.equal(rolledBack.manifest.state, 'rollback');
assert.equal(rolledBack.operations.writes.succeeded, 858);
assert.equal(rolledBack.operations.writes.batchesCompleted, 9);
const rollbackVerification = await executeG8V2ConflictReconciliation({ mode: 'dry-run', plan, store: interruptedStore });
assert.equal(rollbackVerification.classification.certifiedRollbacks, 858);

const idempotentRollback = await executeG8V2ConflictReconciliation({ mode: 'rollback', plan, store: interruptedStore });
assert.equal(idempotentRollback.status, 'completed');
assert.equal(idempotentRollback.operations.writes.attempted, 0);
assert.equal(idempotentRollback.manifest.state, 'rollback');

const rejectedPath = plan.operations[0].path;
const missingStore = new MemoryStore('rollback');
missingStore.values.delete(rejectedPath);
const missing = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: missingStore });
assert.equal(missing.error?.code, 'BR7B_DESTINATION_MISSING');
assert.equal(missing.classification.missing, 1);
assert.equal(missing.operations.writes.batchesAttempted, 0);

const malformedStore = new MemoryStore('rollback');
malformedStore.values.set(rejectedPath, { unsupported: undefined });
const malformed = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: malformedStore });
assert.equal(malformed.error?.code, 'BR7B_DESTINATION_MALFORMED');
assert.equal(malformed.classification.malformed, 1);
assert.equal(malformed.operations.writes.batchesAttempted, 0);

const thirdValueStore = new MemoryStore('rollback');
thirdValueStore.values.set(rejectedPath, { unrelated: true });
const thirdValue = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: thirdValueStore });
assert.equal(thirdValue.error?.code, 'BR7B_DESTINATION_THIRD_VALUE');
assert.equal(thirdValue.classification.thirdValue, 1);
assert.equal(thirdValue.operations.writes.batchesAttempted, 0);

const readFailureStore = new MemoryStore('rollback');
readFailureStore.failReadPath = rejectedPath;
const readFailure = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: readFailureStore });
assert.equal(readFailure.error?.code, 'BR7B_DESTINATION_READ_FAILED');
assert.equal(readFailure.classification.readErrors, 1);
assert.equal(readFailure.operations.reads.preflight, 858);
assert.equal(readFailure.operations.writes.batchesAttempted, 0);
assert.doesNotMatch(JSON.stringify(readFailure), /SECRET|credential=/);

const rollbackMissingStore = new MemoryStore('output');
rollbackMissingStore.values.delete(rejectedPath);
const rollbackMissing = await executeG8V2ConflictReconciliation({ mode: 'rollback', plan, store: rollbackMissingStore });
assert.equal(rollbackMissing.error?.code, 'BR7B_DESTINATION_MISSING');
assert.equal(rollbackMissing.operations.writes.batchesAttempted, 0);

const rollbackThirdValueStore = new MemoryStore('output');
rollbackThirdValueStore.values.set(rejectedPath, { unrelated: true });
const rollbackThirdValue = await executeG8V2ConflictReconciliation({ mode: 'rollback', plan, store: rollbackThirdValueStore });
assert.equal(rollbackThirdValue.error?.code, 'BR7B_DESTINATION_THIRD_VALUE');
assert.equal(rollbackThirdValue.operations.writes.batchesAttempted, 0);

const changedDuringApplyStore = new MemoryStore('rollback');
const guardedCommit = changedDuringApplyStore.commit.bind(changedDuringApplyStore);
changedDuringApplyStore.commit = async (writes) => {
  changedDuringApplyStore.values.set(writes[0].path, { changedAfterPreclassification: true });
  return guardedCommit(writes);
};
const changedDuringApply = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: changedDuringApplyStore });
assert.equal(changedDuringApply.error?.code, 'BR7B_GUARDED_BATCH_WRITE_FAILED');
assert.equal(changedDuringApply.operations.writes.succeeded, 0);
assert.equal(changedDuringApply.operations.writes.failed, 100);
assert.equal(changedDuringApply.operations.writes.unknown, 0);
assert.equal(changedDuringApply.operations.reads.guards, 1);
assert.equal(changedDuringApply.manifest.state, 'pending');

const unknownOutcomeStore = new MemoryStore('rollback');
unknownOutcomeStore.commit = async () => { throw new Error('unclassified local transport failure credential=SECRET'); };
const unknownOutcome = await executeG8V2ConflictReconciliation({ mode: 'apply', plan, store: unknownOutcomeStore });
assert.equal(unknownOutcome.operations.writes.failed, 0);
assert.equal(unknownOutcome.operations.writes.unknown, 100);
assert.equal(unknownOutcome.operations.reads.guards, 0);
assert.doesNotMatch(JSON.stringify(unknownOutcome), /SECRET|credential=/);

const changedDuringRollbackStore = new MemoryStore('output');
const guardedRollbackCommit = changedDuringRollbackStore.commit.bind(changedDuringRollbackStore);
changedDuringRollbackStore.commit = async (writes) => {
  changedDuringRollbackStore.values.set(writes[0].path, { changedAfterRollbackPreclassification: true });
  return guardedRollbackCommit(writes);
};
const changedDuringRollback = await executeG8V2ConflictReconciliation({ mode: 'rollback', plan, store: changedDuringRollbackStore });
assert.equal(changedDuringRollback.error?.code, 'BR7B_GUARDED_BATCH_WRITE_FAILED');
assert.equal(changedDuringRollback.operations.writes.succeeded, 0);
assert.equal(changedDuringRollback.operations.writes.failed, 100);
assert.equal(changedDuringRollback.operations.writes.unknown, 0);

const offlineReporterSource = readFileSync('scripts/report-g8-4br7b-reconciliation.ts', 'utf8');
const offlineReplaySource = readFileSync('scripts/run-g8-4br7b-offline-replays.ts', 'utf8');
for (const source of [offlineReporterSource, offlineReplaySource]) {
  assert.doesNotMatch(source, /(?:from\s+|import\s*\()['"](?:firebase(?:\/|['"])|@google-cloud\/firestore)/);
}
assert.match(offlineReporterSource, /flag:\s*'wx'/);
assert.match(offlineReplaySource, /g8-4br7b-offline-replay-v2-/);
assert.match(offlineReplaySource, /g8-4br7b-offline-replay-v1-receipt\.json/);
assert.match(offlineReplaySource, /OFFLINE_RUNNER_OUTPUT_COLLISION/);

const emulatorRunnerSource = readFileSync('scripts/run-g8-4br7b-emulator-test.ts', 'utf8');
assert.match(emulatorRunnerSource, /NO_PROXY\s*=\s*'127\.0\.0\.1,localhost,::1'/);
assert.match(emulatorRunnerSource, /FIREBASE_CLI_DISABLE_UPDATE_CHECK/);
assert.match(emulatorRunnerSource, /emulatorTerminated/);
assert.match(emulatorRunnerSource, /buildG8Br7bInnerTsxInvocation/);
assert.match(emulatorRunnerSource, /NODE_OPTIONS/);
assert.match(emulatorRunnerSource, /certifiedCounts/);
assert.match(emulatorRunnerSource, /paths:\s*858[^\n]*races:\s*429[^\n]*metrics:\s*429[^\n]*replaceWithCertified:\s*4[^\n]*deterministicMerges:\s*854/);

const emulatorTestSource = readFileSync('scripts/lib/g8V2ConflictReconciliation.emulator.test.ts', 'utf8');
assert.match(emulatorTestSource, /globalThis[^\n]*gc/);
assert.match(emulatorTestSource, /getHeapStatistics/);
assert.match(emulatorTestSource, /256\s*\*\s*1024\s*\*\s*1024/);

const finalRunnerSource = readFileSync('scripts/run-g8-4br7b-final-certification.ts', 'utf8');
const orderedFinalLabels = [
  'focused-congressional-service',
  'br7br2ar-inner-tsx-invocation',
  'br7b-unit',
  'br7b-two-isolated-offline-replays',
  'br7a-readiness-review',
  'br6cr-final-identity-resolution',
  'br7b-emulator-18084',
  'g8-2a-product-shadow-unit',
  "npm(8, 'lint'",
  "npm(9, 'build'",
  "step: 10, label: 'git-diff-check'",
];
let priorIndex = -1;
for (const label of orderedFinalLabels) {
  const index = finalRunnerSource.indexOf(label);
  assert.ok(index > priorIndex, `final certification order drifted at ${label}`);
  priorIndex = index;
}
assert.match(finalRunnerSource, /flag:\s*'wx'/);
assert.match(finalRunnerSource, /g8-4br7b-final-certification-v2-receipt\.json/);
assert.match(finalRunnerSource, /g8-4br7b-final-certification-v1-receipt\.json/);
assert.match(finalRunnerSource, /stop without retry/);
assert.match(finalRunnerSource, /if \(child\.status !== 0[^]*?return;/);
assert.match(finalRunnerSource, /br7bMemoryPolicy/);
assert.match(finalRunnerSource, /buildG8Br7bInnerTsxInvocation/);
assert.match(finalRunnerSource, /NODE_OPTIONS/);

const structuredAuditEnvironment = { ...process.env };
for (const key of Object.keys(structuredAuditEnvironment)) {
  const upper = key.toUpperCase();
  if (['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIRESTORE_EMULATOR_HOST'].includes(upper)) delete structuredAuditEnvironment[key];
}
structuredAuditEnvironment.FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true';
structuredAuditEnvironment.NPM_CONFIG_OFFLINE = 'true';
structuredAuditEnvironment.FIREBASE_SERVICE_ACCOUNT = 'C:\\definitely-missing-g8-4br7b.json';
structuredAuditEnvironment.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-missing-g8-4br7b.json';
structuredAuditEnvironment.HTTP_PROXY = 'http://127.0.0.1:9';
structuredAuditEnvironment.HTTPS_PROXY = 'http://127.0.0.1:9';
structuredAuditEnvironment.ALL_PROXY = 'http://127.0.0.1:9';
structuredAuditEnvironment.NO_PROXY = '';
structuredAuditEnvironment.no_proxy = '';
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const structuredAudit = spawnSync(process.execPath, [npmCli, 'run', 'test-g8-4br3a-structured-audit'], {
  cwd: process.cwd(),
  env: structuredAuditEnvironment,
  shell: false,
  windowsHide: true,
  encoding: null,
  timeout: 10 * 60 * 1000,
  maxBuffer: 128 * 1024 * 1024,
});
assert.equal(structuredAudit.status, 0, 'BR7BR1 regression: BR3A structured audit must pass under the exact final-certification child policy');

console.log('G8.4BR7B conflict reconciliation lifecycle and fail-closed destination slices passed');
