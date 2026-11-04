import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { encodeFirestoreSnapshotValue, type FirestoreTimestampTag } from './canonicalMigration.js';
import { draftG8V2RevisedDisposition } from './g8V2FecCandidateEquivalence.js';
import {
  G8_BR7A_PATHS,
  loadG8V2ExecutorReadinessInputs,
  semanticDigest,
  verifyG8V2ExecutorReadiness,
} from './g8V2ExecutorReadinessReview.js';

type Json = Record<string, any>;

export const G8_V2_RECONCILIATION_PLAN_CONTRACT = 'g8-4br7b-local-conflict-reconciliation-plan/v1' as const;
export const G8_V2_RECONCILIATION_MANIFEST_CONTRACT = 'g8-4br7b-local-conflict-reconciliation-manifest/v1' as const;
export const G8_V2_RECONCILIATION_RESULT_CONTRACT = 'g8-4br7b-local-conflict-reconciliation-result/v1' as const;
export const G8_V2_RECONCILIATION_BATCH_SIZE = 100 as const;
export const G8_V2_RECONCILIATION_EXECUTOR_PLAN_DIGEST = '3abb3cba4d679e5cd141e8f386c7ca6173e121deae723b4f79fa3ebb4ba26994' as const;

const CERTIFIED = {
  identities: {
    plan: { bytes: 75_926_293, sha256: '654349812a2d2806b75b58e0f57ba09713bb27d22f955c85a100cc70cf7a80ec' },
    snapshot: { bytes: 35_148_779, sha256: '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3' },
    bundle: { bytes: 23_043_218, sha256: '8387a248be9cf08c3d4a380748be5dd6744c0d81b081d770804db1cf1edbf7b4' },
    br6bPlan: { bytes: 81_061_814, sha256: '1f0b71444b2958ab012a03fde3b74f8603df4035f843a2363361d584a7b6752e' },
    overrides: { bytes: 2_137, sha256: 'dae9946a70fb23d935a86f9affdcab97459d07a4024a84e4e0b6c3a5559a5b77' },
    reviewEvidence: { bytes: 2_546, sha256: '359a8a2ccf4bd4acb52e1073f770aa401a3ca77e42f091b84541a082fb90bab9' },
  },
  digests: {
    overridePolicy: '1167d651066fe8e0c130366e1981000d538b3d12405607cb8a5dfa1be1c64b3b',
    entries: 'db946e81664318e666daf12ecfc1bdbcf600dea6b1cc109296f933a979d8cbfb',
    aggregate: '0ae00a719842cbfa58767dae12b280e35406ed72a3cf2501ad3518c8d7dbfc8c',
    outputs: '0ac958cd0dbcf43cba20ef1b64ab7957fa4255dc76a79efb71306146957f84e2',
    rollback: '80241286ec7cfb0e45844adbf2758883e0c8d8ec8d2b98c26b3db5f66986529d',
    plan: 'ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23',
  },
  reviewReceiptSha256: '6b84d9fe141cd0c992ef8262a93cc0baaedc223d2ddf99011240eb61ec8ad491',
} as const;

export type G8V2ReconciliationMode = 'dry-run' | 'apply' | 'rollback';
export type G8V2ReconciliationOperation = {
  path: string;
  family: 'races' | 'metrics';
  disposition: 'replace-with-certified' | 'deterministic-merge';
  output: Json;
  outputDigest: string;
  rollback: Json;
  rollbackDigest: string;
};
export type G8V2ConflictReconciliationPlan = {
  schemaVersion: 1;
  contract: typeof G8_V2_RECONCILIATION_PLAN_CONTRACT;
  identities: typeof CERTIFIED.identities;
  semanticDigests: typeof CERTIFIED.digests;
  counts: { paths: 858; races: 429; metrics: 429; replaceWithCertified: 4; deterministicMerges: 854 };
  operations: G8V2ReconciliationOperation[];
  executorPlanDigest: string;
};
export type G8V2ReconciliationStore = {
  read(path: string): Promise<{ data: Json | null }>;
  commit(writes: Array<{ path: string; expectedDigest: string; data: Json }>): Promise<{ guardReads: number }>;
  close?(): Promise<void>;
};

type GuardedCommitFailure = Error & {
  guardReads?: number;
  writeOutcome?: 'none' | 'unknown';
};

type Classification = {
  certifiedOutputs: number;
  certifiedRollbacks: number;
  missing: number;
  malformed: number;
  thirdValue: number;
  readErrors: number;
};

const byteSha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const expect: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new Error(`BR7B_${code}`); };
function exactKeys(value: unknown, keys: readonly string[], code: string): asserts value is Json {
  expect(isRecord(value), `${code}_NOT_OBJECT`);
  const actual = Object.keys(value).sort();
  const required = [...keys].sort();
  expect(actual.length === required.length && actual.every((key, index) => key === required[index]), `${code}_KEY_SET_MISMATCH`);
}
const same = (left: unknown, right: unknown) => semanticDigest(left) === semanticDigest(right);

function operationSummaries(operations: G8V2ReconciliationOperation[]) {
  return operations.map((operation) => ({
    pathDigest: semanticDigest(operation.path),
    family: operation.family,
    disposition: operation.disposition,
    outputDigest: operation.outputDigest,
    rollbackDigest: operation.rollbackDigest,
  }));
}

function executorPlanDigest(plan: Omit<G8V2ConflictReconciliationPlan, 'executorPlanDigest'>) {
  return semanticDigest({
    schemaVersion: plan.schemaVersion,
    contract: plan.contract,
    identities: plan.identities,
    semanticDigests: plan.semanticDigests,
    counts: plan.counts,
    operations: operationSummaries(plan.operations),
  });
}

function validateReviewEvidence(value: unknown, reviewIdentity: { bytes: number; sha256: string }, receipt: ReturnType<typeof verifyG8V2ExecutorReadiness>) {
  expect(same(reviewIdentity, CERTIFIED.identities.reviewEvidence), 'REVIEW_EVIDENCE_IDENTITY_MISMATCH');
  exactKeys(value, ['schemaVersion','contract','verdict','reviewedCommitRange','identities','counts','digests','executorSafety','finalCertification','safety'], 'REVIEW_EVIDENCE');
  expect(value.schemaVersion === 1 && value.contract === 'g8-4br7a-sanitized-aggregate-evidence/v1', 'REVIEW_EVIDENCE_CONTRACT_MISMATCH');
  expect(value.verdict === 'PASS-safe-to-design-local-executor-not-production-authorization', 'REVIEW_EVIDENCE_VERDICT_MISMATCH');
  expect(same(value.identities, CERTIFIED.identities) === false, 'REVIEW_EVIDENCE_INTERNAL_GUARD');
  expect(same(value.identities, {
    plan: CERTIFIED.identities.plan,
    snapshot: CERTIFIED.identities.snapshot,
    bundle: CERTIFIED.identities.bundle,
    br6bPlan: CERTIFIED.identities.br6bPlan,
    overrides: CERTIFIED.identities.overrides,
  }), 'REVIEW_INPUT_IDENTITIES_MISMATCH');
  expect(same(value.digests, CERTIFIED.digests), 'REVIEW_SEMANTIC_DIGEST_MISMATCH');
  expect(value.counts?.paths === 858 && value.counts?.races === 429 && value.counts?.metrics === 429, 'REVIEW_PATH_COUNT_MISMATCH');
  expect(value.counts?.replaceWithCertified === 4 && value.counts?.deterministicMerges === 854, 'REVIEW_DISPOSITION_COUNT_MISMATCH');
  expect(value.counts?.unresolvedProvenance === 0 && value.counts?.policyConflicts === 0 && value.counts?.p0Findings === 0 && value.counts?.p1Findings === 0, 'REVIEW_UNRESOLVED_FINDING');
  expect(value.finalCertification?.receiptsByteIdentical === true && value.finalCertification?.receiptSha256 === CERTIFIED.reviewReceiptSha256, 'REVIEW_FINAL_CERTIFICATION_MISMATCH');
  expect(same(value.safety, { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, productionOperations: 0, dispositionsExecuted: 0 }), 'REVIEW_SAFETY_MISMATCH');
  expect(receipt.verdict === 'PASS' && same(receipt.digests, {
    plan: CERTIFIED.digests.plan,
    entries: CERTIFIED.digests.entries,
    aggregate: CERTIFIED.digests.aggregate,
    outputs: CERTIFIED.digests.outputs,
    rollback: CERTIFIED.digests.rollback,
    overridePolicy: CERTIFIED.digests.overridePolicy,
  }), 'INDEPENDENT_REVIEW_RECEIPT_MISMATCH');
}

export function buildCertifiedG8V2ConflictReconciliationPlan(): G8V2ConflictReconciliationPlan {
  const inputs = loadG8V2ExecutorReadinessInputs();
  const reviewReceipt = verifyG8V2ExecutorReadiness(inputs);
  expect(same(inputs.identities.plan, CERTIFIED.identities.plan), 'PLAN_FILE_IDENTITY_MISMATCH');
  expect(same(inputs.identities.snapshot, CERTIFIED.identities.snapshot), 'SNAPSHOT_FILE_IDENTITY_MISMATCH');
  expect(same(inputs.identities.bundle, CERTIFIED.identities.bundle), 'BUNDLE_FILE_IDENTITY_MISMATCH');
  expect(same(inputs.identities.br6bPlan, CERTIFIED.identities.br6bPlan), 'BR6B_PLAN_FILE_IDENTITY_MISMATCH');
  expect(same(inputs.identities.overrides, CERTIFIED.identities.overrides), 'OVERRIDE_FILE_IDENTITY_MISMATCH');

  const reviewBytes = readFileSync('docs/status/g8-4br7a-independent-executor-readiness-evidence.json');
  validateReviewEvidence(JSON.parse(reviewBytes.toString('utf8')) as unknown, { bytes: reviewBytes.length, sha256: byteSha256(reviewBytes) }, reviewReceipt);

  const sourcePlan = inputs.plan as Json;
  const snapshot = inputs.snapshot as Json;
  expect(same(sourcePlan.digests, {
    entries: CERTIFIED.digests.entries,
    aggregate: CERTIFIED.digests.aggregate,
    outputs: CERTIFIED.digests.outputs,
    rollback: CERTIFIED.digests.rollback,
    plan: CERTIFIED.digests.plan,
  }), 'PLAN_SEMANTIC_DIGEST_MISMATCH');
  const conflicts = new Map<string, Json>(snapshot.conflicts.map((conflict: Json) => [conflict.path, conflict]));
  const operations = sourcePlan.entries.map((entry: Json): G8V2ReconciliationOperation => {
    const conflict = conflicts.get(entry.path);
    expect(conflict !== undefined, 'PLAN_PATH_NOT_IN_SNAPSHOT');
    const drafted = draftG8V2RevisedDisposition(conflict as any, entry.pointerRules);
    expect(entry.disposition === drafted.disposition && ['replace-with-certified','deterministic-merge'].includes(entry.disposition), 'UNSAFE_DISPOSITION');
    expect(semanticDigest(drafted.output) === entry.proposedOutputDigest, 'OUTPUT_RECONSTRUCTION_MISMATCH');
    expect(semanticDigest(conflict.actual) === entry.rollbackDigest, 'ROLLBACK_RECONSTRUCTION_MISMATCH');
    return {
      path: entry.path,
      family: entry.family,
      disposition: entry.disposition,
      output: drafted.output,
      outputDigest: entry.proposedOutputDigest,
      rollback: conflict.actual,
      rollbackDigest: entry.rollbackDigest,
    };
  });
  expect(operations.length === 858 && new Set(operations.map((operation) => operation.path)).size === 858, 'PATH_COVERAGE_MISMATCH');
  expect(operations.every((operation, index) => index === 0 || operations[index - 1].path.localeCompare(operation.path) < 0), 'PATH_ORDER_MISMATCH');
  const counts = {
    paths: 858 as const,
    races: operations.filter((operation) => operation.family === 'races').length as 429,
    metrics: operations.filter((operation) => operation.family === 'metrics').length as 429,
    replaceWithCertified: operations.filter((operation) => operation.disposition === 'replace-with-certified').length as 4,
    deterministicMerges: operations.filter((operation) => operation.disposition === 'deterministic-merge').length as 854,
  };
  expect(same(counts, { paths: 858, races: 429, metrics: 429, replaceWithCertified: 4, deterministicMerges: 854 }), 'EXECUTOR_COUNT_MISMATCH');
  const base = { schemaVersion: 1 as const, contract: G8_V2_RECONCILIATION_PLAN_CONTRACT, identities: CERTIFIED.identities, semanticDigests: CERTIFIED.digests, counts, operations };
  const computedExecutorPlanDigest = executorPlanDigest(base);
  expect(computedExecutorPlanDigest === G8_V2_RECONCILIATION_EXECUTOR_PLAN_DIGEST, 'EXECUTOR_PLAN_CERTIFIED_DIGEST_MISMATCH');
  return { ...base, executorPlanDigest: computedExecutorPlanDigest };
}

export function assertG8V2ConflictReconciliationPlan(plan: G8V2ConflictReconciliationPlan) {
  exactKeys(plan, ['schemaVersion','contract','identities','semanticDigests','counts','operations','executorPlanDigest'], 'EXECUTOR_PLAN');
  expect(plan.schemaVersion === 1 && plan.contract === G8_V2_RECONCILIATION_PLAN_CONTRACT, 'EXECUTOR_PLAN_CONTRACT_MISMATCH');
  expect(same(plan.identities, CERTIFIED.identities) && same(plan.semanticDigests, CERTIFIED.digests), 'EXECUTOR_PLAN_BINDING_MISMATCH');
  expect(same(plan.counts, { paths: 858, races: 429, metrics: 429, replaceWithCertified: 4, deterministicMerges: 854 }), 'EXECUTOR_PLAN_COUNT_MISMATCH');
  expect(plan.operations.length === 858 && new Set(plan.operations.map((operation) => operation.path)).size === 858, 'EXECUTOR_PLAN_PATH_COVERAGE_MISMATCH');
  expect(plan.operations.every((operation, index) => index === 0 || plan.operations[index - 1].path.localeCompare(operation.path) < 0), 'EXECUTOR_PLAN_ORDER_MISMATCH');
  for (const operation of plan.operations) {
    exactKeys(operation, ['path','family','disposition','output','outputDigest','rollback','rollbackDigest'], 'EXECUTOR_OPERATION');
    expect(/^(?:races|contestMetrics)\/[^/]+$/.test(operation.path), 'EXECUTOR_OPERATION_PATH_MISMATCH');
    expect(['races','metrics'].includes(operation.family) && ['replace-with-certified','deterministic-merge'].includes(operation.disposition), 'EXECUTOR_OPERATION_KIND_MISMATCH');
    expect(semanticDigest(operation.output) === operation.outputDigest, 'EXECUTOR_OUTPUT_TAMPER');
    expect(semanticDigest(operation.rollback) === operation.rollbackDigest, 'EXECUTOR_ROLLBACK_TAMPER');
  }
  const { executorPlanDigest: recorded, ...base } = plan;
  expect(recorded === G8_V2_RECONCILIATION_EXECUTOR_PLAN_DIGEST && recorded === executorPlanDigest(base), 'EXECUTOR_PLAN_DIGEST_MISMATCH');
}

export function createOfflineG8V2ConflictReconciliationStore(plan: G8V2ConflictReconciliationPlan, state: 'output' | 'rollback'): G8V2ReconciliationStore {
  assertG8V2ConflictReconciliationPlan(plan);
  const values = new Map(plan.operations.map((operation) => [operation.path, state === 'output' ? operation.output : operation.rollback]));
  return {
    async read(path) { expect(values.has(path), 'OFFLINE_READ_OUTSIDE_PLAN'); return { data: structuredClone(values.get(path)!) }; },
    async commit() { throw new Error('BR7B_OFFLINE_STORE_WRITE_FORBIDDEN'); },
  };
}

function decodeTimestampTags(value: unknown, timestamp: (seconds: number, nanoseconds: number) => unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => decodeTimestampTags(item, timestamp));
  if (!isRecord(value)) return value;
  if ('__firestoreType' in value) {
    exactKeys(value, ['__firestoreType','seconds','nanoseconds'], 'FIRESTORE_TIMESTAMP');
    expect(value.__firestoreType === 'timestamp/v1' && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds), 'FIRESTORE_TIMESTAMP_TYPE_MISMATCH');
    expect(value.nanoseconds >= 0 && value.nanoseconds < 1_000_000_000 && value.nanoseconds % 1_000 === 0, 'FIRESTORE_TIMESTAMP_PRECISION_MISMATCH');
    return timestamp(value.seconds, value.nanoseconds);
  }
  expect(!('seconds' in value && 'nanoseconds' in value), 'FIRESTORE_TIMESTAMP_LOOKALIKE');
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decodeTimestampTags(child, timestamp)]));
}

export async function createFirestoreG8V2ConflictReconciliationStore(
  plan: G8V2ConflictReconciliationPlan,
  options: { projectId: string; databaseId?: string; emulatorHost?: string; environment?: NodeJS.ProcessEnv },
): Promise<G8V2ReconciliationStore> {
  assertG8V2ConflictReconciliationPlan(plan);
  expect(options.projectId === 'demo-no-project', 'DEMO_PROJECT_REQUIRED');
  const environment = options.environment ?? process.env;
  const emulatorHost = options.emulatorHost ?? environment.FIRESTORE_EMULATOR_HOST ?? '';
  const hostMatch = /^(127\.0\.0\.1|localhost|\[::1\]):(\d{2,5})$/.exec(emulatorHost);
  expect(hostMatch !== null, 'LOOPBACK_EMULATOR_REQUIRED');
  const emulatorPort = Number(hostMatch[2]);
  expect(Number.isSafeInteger(emulatorPort) && emulatorPort > 0 && emulatorPort <= 65_535, 'LOOPBACK_EMULATOR_PORT_INVALID');
  const credentialConfigured = Object.entries(environment).some(([key, value]) => ['FIREBASE_SERVICE_ACCOUNT','GOOGLE_APPLICATION_CREDENTIALS'].includes(key.toUpperCase()) && typeof value === 'string' && value.trim().length > 0);
  expect(!credentialConfigured, 'CREDENTIAL_ENVIRONMENT_FORBIDDEN');
  const [{ Firestore, Timestamp }] = await Promise.all([import('@google-cloud/firestore')]);
  const db = new Firestore({
    projectId: options.projectId,
    servicePath: hostMatch[1] === '[::1]' ? '::1' : hostMatch[1],
    port: emulatorPort,
    ssl: false,
    ...(options.databaseId && options.databaseId !== '(default)' ? { databaseId: options.databaseId } : {}),
  });
  const allowed = new Set(plan.operations.map((operation) => operation.path));
  const document = (path: string) => { expect(allowed.has(path), 'STORE_PATH_OUTSIDE_CERTIFIED_INVENTORY'); return db.doc(path); };
  return {
    async read(path) {
      const snapshot = await document(path).get();
      return { data: snapshot.exists ? encodeFirestoreSnapshotValue(snapshot.data(), 'certified-destination') as Json : null };
    },
    async commit(writes) {
      expect(writes.length > 0 && writes.length <= G8_V2_RECONCILIATION_BATCH_SIZE, 'STORE_BATCH_SIZE_MISMATCH');
      expect(new Set(writes.map((write) => write.path)).size === writes.length, 'STORE_DUPLICATE_BATCH_PATH');
      const references = writes.map((write) => document(write.path));
      let guardReads = 0;
      let writesScheduled = false;
      try {
        await db.runTransaction(async (transaction) => {
          const snapshots = await transaction.getAll(...references);
          guardReads = snapshots.length;
          expect(snapshots.length === writes.length, 'STORE_GUARD_READ_COUNT_MISMATCH');
          for (let index = 0; index < snapshots.length; index += 1) {
            const snapshot = snapshots[index];
            expect(snapshot.exists, 'STORE_GUARD_DOCUMENT_MISSING');
            let actualDigest: string;
            try { actualDigest = semanticDigest(encodeFirestoreSnapshotValue(snapshot.data(), 'guarded-destination')); }
            catch { throw new Error('BR7B_STORE_GUARD_DOCUMENT_MALFORMED'); }
            expect(actualDigest === writes[index].expectedDigest, 'STORE_GUARD_DOCUMENT_CHANGED');
          }
          for (let index = 0; index < writes.length; index += 1) transaction.set(references[index], decodeTimestampTags(writes[index].data, (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds)) as Json);
          writesScheduled = true;
        }, { maxAttempts: 1 });
      } catch {
        const failure = new Error('BR7B_STORE_GUARDED_COMMIT_FAILED') as GuardedCommitFailure;
        failure.guardReads = guardReads;
        failure.writeOutcome = writesScheduled ? 'unknown' : 'none';
        throw failure;
      }
      return { guardReads: writes.length };
    },
    async close() { await db.terminate(); },
  };
}

function manifestFor(plan: G8V2ConflictReconciliationPlan, mode: G8V2ReconciliationMode, state: 'pending' | 'completed' | 'rollback', classification: Classification) {
  const plannedWrites = mode === 'rollback' ? classification.certifiedOutputs : classification.certifiedRollbacks;
  const batches = Math.ceil(plannedWrites / G8_V2_RECONCILIATION_BATCH_SIZE);
  const base = {
    schemaVersion: 1 as const,
    contract: G8_V2_RECONCILIATION_MANIFEST_CONTRACT,
    state,
    operation: mode,
    identities: plan.identities,
    counts: plan.counts,
    digests: { ...plan.semanticDigests, executorPlan: plan.executorPlanDigest },
    classification,
    batchProgress: { batchSize: G8_V2_RECONCILIATION_BATCH_SIZE, totalBatches: batches, completedBatches: 0, plannedWrites, completedWrites: 0 },
    resume: {
      certifiedOutputsBefore: classification.certifiedOutputs,
      certifiedRollbacksBefore: classification.certifiedRollbacks,
      resumableNoOps: mode === 'apply' ? classification.certifiedOutputs : mode === 'rollback' ? classification.certifiedRollbacks : 0,
      wasResume: mode !== 'dry-run' && classification.certifiedOutputs > 0 && classification.certifiedRollbacks > 0,
    },
  };
  return { ...base, manifestDigest: semanticDigest(base) };
}

export async function executeG8V2ConflictReconciliation(options: {
  mode: G8V2ReconciliationMode;
  plan: G8V2ConflictReconciliationPlan;
  store: G8V2ReconciliationStore;
  persistManifest?: (manifest: ReturnType<typeof manifestFor>) => void | Promise<void>;
}) {
  assertG8V2ConflictReconciliationPlan(options.plan);
  const classification: Classification = { certifiedOutputs: 0, certifiedRollbacks: 0, missing: 0, malformed: 0, thirdValue: 0, readErrors: 0 };
  const observedDigests = new Map<string, string>();
  for (let start = 0; start < options.plan.operations.length; start += 100) {
    const chunk = options.plan.operations.slice(start, start + 100);
    const observed = await Promise.allSettled(chunk.map(async (operation) => ({ operation, value: (await options.store.read(operation.path)).data })));
    for (const item of observed) {
      if (item.status === 'rejected') { classification.readErrors += 1; continue; }
      if (item.value.value === null) { classification.missing += 1; continue; }
      let digest: string;
      try { digest = semanticDigest(item.value.value); }
      catch { classification.malformed += 1; continue; }
      observedDigests.set(item.value.operation.path, digest);
      if (digest === item.value.operation.outputDigest) classification.certifiedOutputs += 1;
      else if (digest === item.value.operation.rollbackDigest) classification.certifiedRollbacks += 1;
      else classification.thirdValue += 1;
    }
  }
  expect(classification.certifiedOutputs + classification.certifiedRollbacks + classification.missing + classification.malformed + classification.thirdValue + classification.readErrors === 858, 'CLASSIFICATION_ACCOUNTING_MISMATCH');
  const invalid = classification.missing + classification.malformed + classification.thirdValue + classification.readErrors;
  const manifest = manifestFor(options.plan, options.mode, 'pending', classification);
  const operationAccounting = {
    reads: { preflight: 858, guards: 0, verification: 0, scans: 0 },
    writes: { planned: manifest.batchProgress.plannedWrites, attempted: 0, succeeded: 0, failed: 0, unknown: 0, deletes: 0, selectorOperations: 0, batchesAttempted: 0, batchesCompleted: 0 },
  };
  const resultBase = (status: 'completed' | 'failed', phase: 'preclassification' | 'batch-write' | 'verification' | 'completed', error: { classification: string; code: string } | null) => ({
    schemaVersion: 1 as const,
    contract: G8_V2_RECONCILIATION_RESULT_CONTRACT,
    mode: options.mode,
    status,
    phase,
    error,
    classification,
    operations: operationAccounting,
    manifest,
    safety: { emulatorOnly: true, productionOperations: 0, collectionScans: 0, deletes: 0, selectorOperations: 0, historicallyMissingDocumentsCreated: 0, documentBodiesInReceipt: false },
  });
  const finish = (base: ReturnType<typeof resultBase>) => ({ ...base, receiptDigest: semanticDigest(base) });
  const refreshManifest = () => {
    const { manifestDigest: _discarded, ...base } = manifest;
    manifest.manifestDigest = semanticDigest(base);
  };
  const persistManifest = async () => { await options.persistManifest?.(structuredClone(manifest)); };
  try { await persistManifest(); }
  catch { return finish(resultBase('failed', 'preclassification', { classification: 'manifest', code: 'BR7B_MANIFEST_PERSISTENCE_FAILED' })); }
  if (invalid > 0) {
    const code = classification.readErrors > 0 ? 'BR7B_DESTINATION_READ_FAILED'
      : classification.missing > 0 ? 'BR7B_DESTINATION_MISSING'
        : classification.malformed > 0 ? 'BR7B_DESTINATION_MALFORMED'
          : 'BR7B_DESTINATION_THIRD_VALUE';
    return finish(resultBase('failed', 'preclassification', { classification: classification.readErrors > 0 ? 'read' : 'conflict', code }));
  }
  if (options.mode === 'dry-run') return finish(resultBase('completed', 'completed', null));

  const eligible = options.plan.operations.filter((operation) => observedDigests.get(operation.path) === (options.mode === 'apply' ? operation.rollbackDigest : operation.outputDigest));
  const target = (operation: G8V2ReconciliationOperation) => options.mode === 'apply' ? operation.output : operation.rollback;
  const targetDigest = (operation: G8V2ReconciliationOperation) => options.mode === 'apply' ? operation.outputDigest : operation.rollbackDigest;
  const currentDigest = (operation: G8V2ReconciliationOperation) => options.mode === 'apply' ? operation.rollbackDigest : operation.outputDigest;
  operationAccounting.writes.planned = eligible.length;
  manifest.batchProgress.plannedWrites = eligible.length;
  manifest.batchProgress.totalBatches = Math.ceil(eligible.length / G8_V2_RECONCILIATION_BATCH_SIZE);
  refreshManifest();
  for (let start = 0; start < eligible.length; start += G8_V2_RECONCILIATION_BATCH_SIZE) {
    const chunk = eligible.slice(start, start + G8_V2_RECONCILIATION_BATCH_SIZE);
    const writes = chunk.map((operation) => ({ path: operation.path, expectedDigest: currentDigest(operation), data: target(operation) }));
    operationAccounting.writes.attempted += writes.length;
    operationAccounting.writes.batchesAttempted += 1;
    try {
      const committed = await options.store.commit(writes);
      expect(committed.guardReads === writes.length, 'GUARD_READ_ACCOUNTING_MISMATCH');
      operationAccounting.reads.guards += committed.guardReads;
      operationAccounting.writes.succeeded += writes.length;
      operationAccounting.writes.batchesCompleted += 1;
      manifest.batchProgress.completedWrites += writes.length;
      manifest.batchProgress.completedBatches += 1;
      refreshManifest();
      try { await persistManifest(); }
      catch { return finish(resultBase('failed', 'batch-write', { classification: 'manifest', code: 'BR7B_MANIFEST_PERSISTENCE_FAILED' })); }
    } catch (error) {
      const failure = error as GuardedCommitFailure;
      const guardReads = Number.isSafeInteger(failure.guardReads) && Number(failure.guardReads) >= 0 && Number(failure.guardReads) <= writes.length ? Number(failure.guardReads) : 0;
      operationAccounting.reads.guards += guardReads;
      if (failure.writeOutcome === 'none') operationAccounting.writes.failed += writes.length;
      else operationAccounting.writes.unknown += writes.length;
      refreshManifest();
      try { await persistManifest(); } catch { /* the stable write failure remains authoritative */ }
      return finish(resultBase('failed', 'batch-write', { classification: 'write', code: 'BR7B_GUARDED_BATCH_WRITE_FAILED' }));
    }
  }

  let verificationFailures = 0;
  for (let start = 0; start < options.plan.operations.length; start += 100) {
    const chunk = options.plan.operations.slice(start, start + 100);
    const verified = await Promise.allSettled(chunk.map(async (operation) => ({ operation, value: (await options.store.read(operation.path)).data })));
    operationAccounting.reads.verification += verified.length;
    for (const item of verified) {
      if (item.status === 'rejected' || item.value.value === null) { verificationFailures += 1; continue; }
      try { if (semanticDigest(item.value.value) !== targetDigest(item.value.operation)) verificationFailures += 1; }
      catch { verificationFailures += 1; }
    }
  }
  if (verificationFailures > 0) {
    try { await persistManifest(); } catch { /* retain the exact-verification failure */ }
    return finish(resultBase('failed', 'verification', { classification: 'conflict', code: 'BR7B_EXACT_VERIFICATION_FAILED' }));
  }
  manifest.state = options.mode === 'apply' ? 'completed' : 'rollback';
  refreshManifest();
  try { await persistManifest(); }
  catch { return finish(resultBase('failed', 'verification', { classification: 'manifest', code: 'BR7B_MANIFEST_PERSISTENCE_FAILED' })); }
  return finish(resultBase('completed', 'completed', null));
}

export type G8V2ConflictReconciliationManifest = ReturnType<typeof manifestFor>;
export type G8V2ConflictReconciliationResult = Awaited<ReturnType<typeof executeG8V2ConflictReconciliation>>;

export function assertG8V2ConflictReconciliationManifest(value: unknown): asserts value is G8V2ConflictReconciliationManifest {
  exactKeys(value, ['schemaVersion','contract','state','operation','identities','counts','digests','classification','batchProgress','resume','manifestDigest'], 'MANIFEST');
  expect(value.schemaVersion === 1 && value.contract === G8_V2_RECONCILIATION_MANIFEST_CONTRACT, 'MANIFEST_CONTRACT_MISMATCH');
  expect(['pending','completed','rollback'].includes(value.state) && ['dry-run','apply','rollback'].includes(value.operation), 'MANIFEST_STATE_MISMATCH');
  expect(same(value.identities, CERTIFIED.identities), 'MANIFEST_IDENTITY_MISMATCH');
  expect(same(value.counts, { paths: 858, races: 429, metrics: 429, replaceWithCertified: 4, deterministicMerges: 854 }), 'MANIFEST_COUNT_MISMATCH');
  expect(same(value.digests, { ...CERTIFIED.digests, executorPlan: G8_V2_RECONCILIATION_EXECUTOR_PLAN_DIGEST }), 'MANIFEST_DIGEST_BINDING_MISMATCH');
  exactKeys(value.classification, ['certifiedOutputs','certifiedRollbacks','missing','malformed','thirdValue','readErrors'], 'MANIFEST_CLASSIFICATION');
  exactKeys(value.batchProgress, ['batchSize','totalBatches','completedBatches','plannedWrites','completedWrites'], 'MANIFEST_BATCH_PROGRESS');
  exactKeys(value.resume, ['certifiedOutputsBefore','certifiedRollbacksBefore','resumableNoOps','wasResume'], 'MANIFEST_RESUME');
  for (const count of [...Object.values(value.classification), ...Object.values(value.batchProgress).filter((item) => typeof item === 'number'), ...Object.values(value.resume).filter((item) => typeof item === 'number')]) expect(Number.isSafeInteger(count) && (count as number) >= 0, 'MANIFEST_INVALID_COUNT');
  expect(Object.values(value.classification).reduce((sum: number, count: unknown) => sum + Number(count), 0) === 858, 'MANIFEST_CLASSIFICATION_ACCOUNTING_MISMATCH');
  expect(value.batchProgress.batchSize === G8_V2_RECONCILIATION_BATCH_SIZE && value.batchProgress.completedBatches <= value.batchProgress.totalBatches && value.batchProgress.completedWrites <= value.batchProgress.plannedWrites, 'MANIFEST_BATCH_ACCOUNTING_MISMATCH');
  expect(typeof value.resume.wasResume === 'boolean', 'MANIFEST_RESUME_ACCOUNTING_MISMATCH');
  const { manifestDigest: recorded, ...base } = value;
  expect(recorded === semanticDigest(base), 'MANIFEST_DIGEST_MISMATCH');
}

export function assertG8V2ConflictReconciliationResult(value: unknown): asserts value is G8V2ConflictReconciliationResult {
  exactKeys(value, ['schemaVersion','contract','mode','status','phase','error','classification','operations','manifest','safety','receiptDigest'], 'RESULT');
  expect(value.schemaVersion === 1 && value.contract === G8_V2_RECONCILIATION_RESULT_CONTRACT, 'RESULT_CONTRACT_MISMATCH');
  expect(['dry-run','apply','rollback'].includes(value.mode) && ['completed','failed'].includes(value.status) && ['preclassification','batch-write','verification','completed'].includes(value.phase), 'RESULT_STATE_MISMATCH');
  if (value.error !== null) {
    exactKeys(value.error, ['classification','code'], 'RESULT_ERROR');
    expect(typeof value.error.classification === 'string' && /^BR7B_[A-Z0-9_]{3,80}$/.test(String(value.error.code)), 'RESULT_ERROR_MISMATCH');
  }
  expect(value.status === 'completed' ? value.error === null && value.phase === 'completed' : value.error !== null && value.phase !== 'completed', 'RESULT_STATUS_COHERENCE_MISMATCH');
  assertG8V2ConflictReconciliationManifest(value.manifest);
  expect(same(value.classification, value.manifest.classification), 'RESULT_CLASSIFICATION_MISMATCH');
  exactKeys(value.operations, ['reads','writes'], 'RESULT_OPERATIONS');
  exactKeys(value.operations.reads, ['preflight','guards','verification','scans'], 'RESULT_READS');
  exactKeys(value.operations.writes, ['planned','attempted','succeeded','failed','unknown','deletes','selectorOperations','batchesAttempted','batchesCompleted'], 'RESULT_WRITES');
  for (const count of [...Object.values(value.operations.reads), ...Object.values(value.operations.writes)]) expect(Number.isSafeInteger(count) && (count as number) >= 0, 'RESULT_INVALID_OPERATION_COUNT');
  expect(value.operations.reads.preflight === 858 && value.operations.reads.scans === 0 && value.operations.writes.deletes === 0 && value.operations.writes.selectorOperations === 0, 'RESULT_UNSAFE_OPERATION_ACCOUNTING');
  expect(value.operations.writes.planned === value.manifest.batchProgress.plannedWrites && value.operations.writes.succeeded === value.manifest.batchProgress.completedWrites && value.operations.writes.batchesCompleted === value.manifest.batchProgress.completedBatches, 'RESULT_MANIFEST_OPERATION_DRIFT');
  expect(value.operations.writes.attempted === value.operations.writes.succeeded + value.operations.writes.failed + value.operations.writes.unknown, 'RESULT_WRITE_OUTCOME_ACCOUNTING_MISMATCH');
  expect(value.operations.writes.batchesCompleted <= value.operations.writes.batchesAttempted && value.operations.reads.guards >= value.operations.writes.succeeded && value.operations.reads.guards <= value.operations.writes.attempted, 'RESULT_GUARD_ACCOUNTING_MISMATCH');
  exactKeys(value.safety, ['emulatorOnly','productionOperations','collectionScans','deletes','selectorOperations','historicallyMissingDocumentsCreated','documentBodiesInReceipt'], 'RESULT_SAFETY');
  expect(same(value.safety, { emulatorOnly: true, productionOperations: 0, collectionScans: 0, deletes: 0, selectorOperations: 0, historicallyMissingDocumentsCreated: 0, documentBodiesInReceipt: false }), 'RESULT_SAFETY_MISMATCH');
  const serialized = JSON.stringify(value);
  expect(serialized.length < 50_000 && !/(?:races|contestMetrics)\/[^"\\]+|private[_ -]?key|client[_ -]?email|credential|bearer|token\s*[=:]/i.test(serialized), 'RESULT_UNSAFE_RECEIPT_BODY');
  const { receiptDigest: recorded, ...base } = value;
  expect(recorded === semanticDigest(base), 'RESULT_RECEIPT_DIGEST_MISMATCH');
}

export function verifyG8V2ConflictReconciliationReplay(first: unknown, second: unknown) {
  try {
    assertG8V2ConflictReconciliationResult(first);
    assertG8V2ConflictReconciliationResult(second);
  } catch { throw new Error('BR7B_REPLAY_RESULT_INVALID'); }
  expect(first.mode === 'dry-run' && second.mode === 'dry-run' && first.status === 'completed' && second.status === 'completed', 'REPLAY_NOT_COMPLETED_DRY_RUN');
  expect(first.receiptDigest === second.receiptDigest && semanticDigest(first) === semanticDigest(second), 'REPLAY_BYTES_OR_DIGEST_MISMATCH');
  return true;
}
