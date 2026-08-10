import { TextDecoder } from 'node:util';

export const G8_V2_ACTIVATION_RESULT_CONTRACT = 'g8-4br4a-activation-result/v1' as const;
export const G8_V2_ACTIVATION_RESULT_SCHEMA_VERSION = 1 as const;

export type G8V2ActivationMode = 'apply' | 'verify-only' | 'rollback' | 'unknown';
export type G8V2ActivationPhase =
  | 'argument-parsing'
  | 'bundle-manifest-validation'
  | 'plan-guard-validation'
  | 'implementation-identity'
  | 'environment-validation'
  | 'firestore-bootstrap'
  | 'shadow-verification'
  | 'selector-read'
  | 'content-validation'
  | 'pending-selector-write'
  | 'content-promotion'
  | 'exact-verification'
  | 'active-selector-write'
  | 'rollback-selector-write'
  | 'result-validation'
  | 'completed';
export type G8V2ActivationFailureClassification =
  | 'argument'
  | 'validation'
  | 'guard'
  | 'identity'
  | 'environment'
  | 'bootstrap'
  | 'shadow-verification'
  | 'selector-read'
  | 'selector-write'
  | 'content-read'
  | 'content-write'
  | 'conflict'
  | 'result-contract';
export type G8V2OperationOutcome = 'not-attempted' | 'attempted-unknown' | 'succeeded' | 'failed' | 'mixed';

export type G8V2OperationAccounting = {
  planned: number;
  attempted: number;
  succeeded: number;
  failed: number;
  unknown: number;
  notAttempted: number;
  outcome: G8V2OperationOutcome;
};

export type G8V2StructuredActivationResult = {
  schemaVersion: typeof G8_V2_ACTIVATION_RESULT_SCHEMA_VERSION;
  contract: typeof G8_V2_ACTIVATION_RESULT_CONTRACT;
  mode: G8V2ActivationMode;
  status: 'completed' | 'failed';
  phase: G8V2ActivationPhase;
  failedPhase: G8V2ActivationPhase | null;
  error: { classification: G8V2ActivationFailureClassification; code: string } | null;
  identity: {
    projectId: string | null;
    databaseId: string | null;
    generation: string | null;
    shadowSourceCommit: string | null;
    activationImplementationCommit: string | null;
    namespaceDigest: string | null;
    planDigest: string | null;
    expectedContentDocuments: number | null;
  };
  firebase: { initialization: 'not-attempted' | 'succeeded' | 'attempted-failed'; bootstrap: 'not-attempted' | 'succeeded' | 'attempted-failed' };
  operations: {
    reads: { selector: G8V2OperationAccounting; content: G8V2OperationAccounting };
    writes: { selector: G8V2OperationAccounting; content: G8V2OperationAccounting };
  };
  batches: { attempted: number; completed: number; failed: number; unknown: number };
  selector: {
    before: 'unknown/unverified' | 'absent' | 'pending' | 'active' | 'rollback' | 'incompatible';
    pending: 'not-attempted' | 'created' | 'compatible' | 'conflicting' | 'unknown';
    active: 'not-attempted' | 'written' | 'verified' | 'absent' | 'conflicting' | 'unknown';
  };
  content: { expected: number; exact: number; missing: number; conflicting: number; unknown: number };
  safeNextAction: string;
};

const accounting = (planned: number): G8V2OperationAccounting => ({ planned, attempted: 0, succeeded: 0, failed: 0, unknown: 0, notAttempted: planned, outcome: 'not-attempted' });

export function createG8V2StructuredActivationResult(): G8V2StructuredActivationResult {
  return {
    schemaVersion: G8_V2_ACTIVATION_RESULT_SCHEMA_VERSION,
    contract: G8_V2_ACTIVATION_RESULT_CONTRACT,
    mode: 'unknown', status: 'failed', phase: 'argument-parsing', failedPhase: null, error: null,
    identity: { projectId: null, databaseId: null, generation: null, shadowSourceCommit: null, activationImplementationCommit: null, namespaceDigest: null, planDigest: null, expectedContentDocuments: null },
    firebase: { initialization: 'not-attempted', bootstrap: 'not-attempted' },
    operations: { reads: { selector: accounting(0), content: accounting(0) }, writes: { selector: accounting(0), content: accounting(0) } },
    batches: { attempted: 0, completed: 0, failed: 0, unknown: 0 },
    selector: { before: 'unknown/unverified', pending: 'not-attempted', active: 'not-attempted' },
    content: { expected: 3352, exact: 0, missing: 0, conflicting: 0, unknown: 3352 },
    safeNextAction: 'stop for review; do not retry or perform a production operation without separate authorization',
  };
}

export function configureG8V2ActivationMode(result: G8V2StructuredActivationResult, mode: Exclude<G8V2ActivationMode, 'unknown'>) {
  result.mode = mode;
  result.operations.reads.selector = accounting(1);
  result.operations.reads.content = accounting(mode === 'apply' ? 6704 : mode === 'verify-only' ? 3352 : 0);
  result.operations.writes.selector = accounting(mode === 'apply' ? 2 : mode === 'rollback' ? 1 : 0);
  result.operations.writes.content = accounting(mode === 'apply' ? 3352 : 0);
  return result;
}

function refreshOutcome(operation: G8V2OperationAccounting) {
  if (operation.attempted === 0) return 'not-attempted' as const;
  const kinds = [operation.succeeded > 0, operation.failed > 0, operation.unknown > 0].filter(Boolean).length;
  if (kinds > 1) return 'mixed' as const;
  if (operation.unknown > 0) return 'attempted-unknown' as const;
  if (operation.failed > 0) return 'failed' as const;
  return 'succeeded' as const;
}

export function beginG8V2Operations(operation: G8V2OperationAccounting, count = 1) {
  operation.attempted += count;
  operation.notAttempted = Math.max(0, operation.notAttempted - count);
}

export function completeG8V2Operations(operation: G8V2OperationAccounting, outcome: 'succeeded' | 'failed' | 'attempted-unknown', count = 1) {
  if (outcome === 'succeeded') operation.succeeded += count;
  else if (outcome === 'failed') operation.failed += count;
  else operation.unknown += count;
  operation.outcome = refreshOutcome(operation);
}

export function g8V2OperationOutcomeFromError(error: unknown): 'failed' | 'attempted-unknown' {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : error && typeof error === 'object' && 'activationCode' in error && typeof error.activationCode === 'string' ? error.activationCode : '';
  return ['DEADLINE_EXCEEDED', 'UNAVAILABLE', 'ABORTED', 'SERVER_COMPLETION_UNKNOWN'].includes(code) ? 'attempted-unknown' : 'failed';
}

const stableCodes = new Set([
  'ACTIVATION_MODE_REQUIRED', 'INVALID_ARGUMENT', 'INPUT_NOT_FOUND', 'INPUT_PARSE_FAILED', 'GUARD_MISMATCH',
  'IMPLEMENTATION_IDENTITY_MISMATCH', 'UNSAFE_ENVIRONMENT_FLAGS', 'CREDENTIAL_PATH_MISSING', 'CREDENTIAL_JSON_INVALID',
  'CREDENTIAL_FIELDS_INVALID', 'CONFIGURED_PROJECT_MISMATCH', 'CONFIGURED_DATABASE_MISMATCH', 'BOOTSTRAP_FAILED',
  'SHADOW_VERIFICATION_FAILED', 'PERMISSION_DENIED', 'QUOTA_EXCEEDED', 'SERVER_COMPLETION_UNKNOWN', 'READ_FAILED',
  'WRITE_FAILED', 'SELECTOR_CONFLICT', 'CONTENT_CONFLICT', 'EXACT_VERIFICATION_FAILED', 'MALFORMED_RESULT',
]);

function phaseClassification(phase: G8V2ActivationPhase, code: string): G8V2ActivationFailureClassification {
  if (code === 'SELECTOR_CONFLICT' || code === 'CONTENT_CONFLICT' || code === 'EXACT_VERIFICATION_FAILED') return 'conflict';
  if (phase === 'argument-parsing') return 'argument';
  if (phase === 'bundle-manifest-validation') return 'validation';
  if (phase === 'plan-guard-validation') return 'guard';
  if (phase === 'implementation-identity') return 'identity';
  if (phase === 'environment-validation') return 'environment';
  if (phase === 'firestore-bootstrap') return 'bootstrap';
  if (phase === 'shadow-verification') return 'shadow-verification';
  if (phase === 'selector-read') return 'selector-read';
  if (phase === 'pending-selector-write' || phase === 'active-selector-write' || phase === 'rollback-selector-write') return 'selector-write';
  if (phase === 'content-validation' || phase === 'exact-verification') return 'content-read';
  if (phase === 'content-promotion') return 'content-write';
  return 'result-contract';
}

export function stableG8V2ActivationErrorCode(phase: G8V2ActivationPhase, error: unknown): string {
  const candidate = error && typeof error === 'object' && 'activationCode' in error && typeof error.activationCode === 'string'
    ? error.activationCode
    : error && typeof error === 'object' && 'auditCode' in error && typeof error.auditCode === 'string'
      ? error.auditCode
      : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  if (stableCodes.has(candidate)) return candidate;
  if (candidate === 'ENOENT') return 'INPUT_NOT_FOUND';
  if (candidate === 'EINVAL') return 'INVALID_ARGUMENT';
  if (candidate === 'PERMISSION_DENIED' || candidate === 'PERMISSION_DENIED:') return 'PERMISSION_DENIED';
  if (candidate === 'RESOURCE_EXHAUSTED') return 'QUOTA_EXCEEDED';
  if (candidate === 'DEADLINE_EXCEEDED' || candidate === 'UNAVAILABLE' || candidate === 'ABORTED') return 'SERVER_COMPLETION_UNKNOWN';
  if (candidate === 'ALREADY_EXISTS') return phase === 'pending-selector-write' ? 'SELECTOR_CONFLICT' : 'CONTENT_CONFLICT';
  if (phase === 'plan-guard-validation') return 'GUARD_MISMATCH';
  if (phase === 'implementation-identity') return 'IMPLEMENTATION_IDENTITY_MISMATCH';
  if (phase === 'firestore-bootstrap') return 'BOOTSTRAP_FAILED';
  if (phase === 'shadow-verification') return 'SHADOW_VERIFICATION_FAILED';
  if (phase === 'selector-read' || phase === 'content-validation' || phase === 'exact-verification') return 'READ_FAILED';
  if (phase === 'pending-selector-write' || phase === 'active-selector-write' || phase === 'rollback-selector-write' || phase === 'content-promotion') return 'WRITE_FAILED';
  if (phase === 'bundle-manifest-validation') return 'INPUT_PARSE_FAILED';
  return 'INVALID_ARGUMENT';
}

export function failG8V2StructuredActivationResult(result: G8V2StructuredActivationResult, phase: G8V2ActivationPhase, error: unknown) {
  const code = stableG8V2ActivationErrorCode(phase, error);
  result.status = 'failed'; result.phase = phase; result.failedPhase = phase;
  result.error = { classification: phaseClassification(phase, code), code };
  if (code === 'SELECTOR_CONFLICT' || code === 'CONTENT_CONFLICT' || code === 'EXACT_VERIFICATION_FAILED') result.safeNextAction = 'stop for review; never overwrite conflicting selector or content';
  else if (phase === 'content-promotion' && result.selector.pending !== 'not-attempted') result.safeNextAction = 'stop; preserve pending state and require a separately authorized compatible resume';
  else if (['firestore-bootstrap', 'shadow-verification', 'selector-read', 'content-validation', 'pending-selector-write', 'exact-verification', 'active-selector-write', 'rollback-selector-write'].includes(phase)) result.safeNextAction = 'stop for review; completion or production state may be unknown and no automatic retry is permitted';
  else result.safeNextAction = 'repair the local phase failure and rerun the Firebase-free preflight';
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key)) || keys.some((key) => !(key in value))) throw Object.assign(new Error('malformed activation result fields'), { activationCode: 'MALFORMED_RESULT' });
}

export function assertG8V2StructuredActivationResult(value: unknown): asserts value is G8V2StructuredActivationResult {
  if (!isRecord(value) || value.schemaVersion !== G8_V2_ACTIVATION_RESULT_SCHEMA_VERSION || value.contract !== G8_V2_ACTIVATION_RESULT_CONTRACT) throw Object.assign(new Error('malformed activation result contract'), { activationCode: 'MALFORMED_RESULT' });
  assertExactKeys(value, ['schemaVersion', 'contract', 'mode', 'status', 'phase', 'failedPhase', 'error', 'identity', 'firebase', 'operations', 'batches', 'selector', 'content', 'safeNextAction']);
  if (!['apply', 'verify-only', 'rollback', 'unknown'].includes(String(value.mode)) || !['completed', 'failed'].includes(String(value.status))) throw Object.assign(new Error('malformed activation result status'), { activationCode: 'MALFORMED_RESULT' });
  if (!isRecord(value.identity) || !isRecord(value.firebase) || !isRecord(value.operations) || !isRecord(value.batches) || !isRecord(value.selector) || !isRecord(value.content) || typeof value.safeNextAction !== 'string' || value.safeNextAction.length > 256) throw Object.assign(new Error('malformed activation result body'), { activationCode: 'MALFORMED_RESULT' });
  assertExactKeys(value.identity, ['projectId', 'databaseId', 'generation', 'shadowSourceCommit', 'activationImplementationCommit', 'namespaceDigest', 'planDigest', 'expectedContentDocuments']);
  assertExactKeys(value.firebase, ['initialization', 'bootstrap']);
  assertExactKeys(value.operations, ['reads', 'writes']);
  assertExactKeys(value.batches, ['attempted', 'completed', 'failed', 'unknown']);
  assertExactKeys(value.selector, ['before', 'pending', 'active']);
  assertExactKeys(value.content, ['expected', 'exact', 'missing', 'conflicting', 'unknown']);
  if (!isRecord(value.operations.reads) || !isRecord(value.operations.writes)) throw Object.assign(new Error('malformed activation operation accounting'), { activationCode: 'MALFORMED_RESULT' });
  for (const group of [value.operations.reads, value.operations.writes]) {
    assertExactKeys(group, ['selector', 'content']);
    for (const operation of [group.selector, group.content]) {
      if (!isRecord(operation)) throw Object.assign(new Error('malformed activation operation accounting'), { activationCode: 'MALFORMED_RESULT' });
      assertExactKeys(operation, ['planned', 'attempted', 'succeeded', 'failed', 'unknown', 'notAttempted', 'outcome']);
      if (['planned', 'attempted', 'succeeded', 'failed', 'unknown', 'notAttempted'].some((key) => !Number.isSafeInteger(operation[key]) || (operation[key] as number) < 0)) throw Object.assign(new Error('invalid activation operation count'), { activationCode: 'MALFORMED_RESULT' });
    }
  }
  for (const count of [...Object.values(value.batches), ...Object.values(value.content)]) if (!Number.isSafeInteger(count) || (count as number) < 0) throw Object.assign(new Error('invalid activation result count'), { activationCode: 'MALFORMED_RESULT' });
  if (value.status === 'completed' ? value.error !== null || value.failedPhase !== null : !isRecord(value.error) || typeof value.failedPhase !== 'string') throw Object.assign(new Error('incoherent activation result status'), { activationCode: 'MALFORMED_RESULT' });
  if (isRecord(value.error)) {
    assertExactKeys(value.error, ['classification', 'code']);
    if (typeof value.error.classification !== 'string' || typeof value.error.code !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(value.error.code)) throw Object.assign(new Error('malformed activation result error'), { activationCode: 'MALFORMED_RESULT' });
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 20_000 || /private[_ -]?key|client[_ -]?email|credential|bearer|token\s*[=:]/i.test(serialized)) throw Object.assign(new Error('unsafe activation result field'), { activationCode: 'MALFORMED_RESULT' });
}

export function parseG8V2StructuredActivationResult(raw: string | Uint8Array) {
  const text = typeof raw === 'string' ? raw : new TextDecoder('utf-8', { fatal: true }).decode(raw);
  let value: unknown;
  try { value = JSON.parse(text.trim()) as unknown; } catch { throw Object.assign(new Error('malformed activation result JSON'), { activationCode: 'MALFORMED_RESULT' }); }
  assertG8V2StructuredActivationResult(value);
  return value;
}

export function malformedG8V2StructuredActivationResult() {
  return failG8V2StructuredActivationResult(createG8V2StructuredActivationResult(), 'result-validation', { activationCode: 'MALFORMED_RESULT' });
}
