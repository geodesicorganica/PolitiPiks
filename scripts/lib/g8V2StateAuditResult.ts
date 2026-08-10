export const G8_V2_STATE_AUDIT_RESULT_CONTRACT = 'g8-4br3a-state-audit-result/v1' as const;
export const G8_V2_STATE_AUDIT_RESULT_SCHEMA_VERSION = 1 as const;

export type G8V2StateAuditPhase = 'argument-parsing' | 'bundle-manifest-validation' | 'plan-guard-validation' | 'implementation-identity' | 'environment-validation' | 'firestore-bootstrap' | 'selector-read' | 'exact-path-reads' | 'completed';
export type G8V2ReadOutcome = 'not-attempted' | 'attempted-unknown' | 'succeeded' | 'failed' | 'mixed';
export type G8V2FailureClassification = 'argument' | 'validation' | 'guard' | 'identity' | 'environment' | 'bootstrap' | 'selector-read' | 'content-read' | 'result-contract';

export type G8V2ReadAccounting = {
  expected: number;
  attempted: number;
  succeeded: number;
  failed: number;
  unknown: number;
  notAttempted: number;
  outcome: G8V2ReadOutcome;
};

export type G8V2StructuredAuditResult = {
  schemaVersion: typeof G8_V2_STATE_AUDIT_RESULT_SCHEMA_VERSION;
  contract: typeof G8_V2_STATE_AUDIT_RESULT_CONTRACT;
  status: 'completed' | 'failed';
  phase: G8V2StateAuditPhase;
  failedPhase: G8V2StateAuditPhase | null;
  error: { classification: G8V2FailureClassification; code: string } | null;
  auditReceipt: string | null;
  identity: { projectId: string | null; databaseId: string | null; generation: string | null; namespaceDigest: string | null; planDigest: string | null; expectedContentDocuments: number | null };
  environment: { credentialPathConfigured: boolean | null; credentialPathExists: boolean | null; credentialJsonParseable: boolean | null; requiredCredentialFieldsValid: boolean | null; configuredProjectMatches: boolean | null; configuredDatabaseMatches: boolean | null; unsafeFlagsPresent: boolean | null };
  firebase: { initialization: 'not-attempted' | 'succeeded' | 'attempted-failed'; bootstrap: 'not-attempted' | 'succeeded' | 'attempted-failed' };
  reads: { selector: G8V2ReadAccounting; exactPaths: G8V2ReadAccounting };
  selector: { state: string; contract: string | null; metadata: { status: 'not-applicable' | 'matching' | 'conflicting'; conflictingFields: number } };
  contentAudit: { expected: number; exact: number; missing: number; conflicting: number } | null;
  safeNextAction: string;
};

const accounting = (expected: number): G8V2ReadAccounting => ({ expected, attempted: 0, succeeded: 0, failed: 0, unknown: 0, notAttempted: expected, outcome: 'not-attempted' });

export function createG8V2StructuredAuditResult(): G8V2StructuredAuditResult {
  return {
    schemaVersion: G8_V2_STATE_AUDIT_RESULT_SCHEMA_VERSION,
    contract: G8_V2_STATE_AUDIT_RESULT_CONTRACT,
    status: 'failed', phase: 'argument-parsing', failedPhase: null, error: null,
    auditReceipt: null,
    identity: { projectId: null, databaseId: null, generation: null, namespaceDigest: null, planDigest: null, expectedContentDocuments: null },
    environment: { credentialPathConfigured: null, credentialPathExists: null, credentialJsonParseable: null, requiredCredentialFieldsValid: null, configuredProjectMatches: null, configuredDatabaseMatches: null, unsafeFlagsPresent: null },
    firebase: { initialization: 'not-attempted', bootstrap: 'not-attempted' },
    reads: { selector: accounting(1), exactPaths: accounting(3352) },
    selector: { state: 'unknown/unverified', contract: null, metadata: { status: 'not-applicable', conflictingFields: 0 } },
    contentAudit: null,
    safeNextAction: 'stop for review; do not retry or perform a follow-up production read without separate authorization',
  };
}

function phaseClassification(phase: G8V2StateAuditPhase): G8V2FailureClassification {
  if (phase === 'argument-parsing') return 'argument';
  if (phase === 'bundle-manifest-validation') return 'validation';
  if (phase === 'plan-guard-validation') return 'guard';
  if (phase === 'implementation-identity') return 'identity';
  if (phase === 'environment-validation') return 'environment';
  if (phase === 'firestore-bootstrap') return 'bootstrap';
  if (phase === 'selector-read') return 'selector-read';
  if (phase === 'exact-path-reads') return 'content-read';
  return 'result-contract';
}

const stableCodes = new Set(['AUDIT_MODE_REQUIRED', 'INVALID_ARGUMENT', 'INPUT_NOT_FOUND', 'INPUT_PARSE_FAILED', 'GUARD_MISMATCH', 'IMPLEMENTATION_IDENTITY_MISMATCH', 'UNSAFE_ENVIRONMENT_FLAGS', 'CREDENTIAL_PATH_MISSING', 'CREDENTIAL_JSON_INVALID', 'CREDENTIAL_FIELDS_INVALID', 'CONFIGURED_PROJECT_MISMATCH', 'CONFIGURED_DATABASE_MISMATCH', 'BOOTSTRAP_FAILED', 'PERMISSION_DENIED', 'QUOTA_EXCEEDED', 'SERVER_COMPLETION_UNKNOWN', 'READ_FAILED', 'READ_NOT_FOUND', 'MALFORMED_RESULT']);

export function stableG8V2StateAuditErrorCode(phase: G8V2StateAuditPhase, error: unknown): string {
  const candidate = error && typeof error === 'object' && 'auditCode' in error && typeof error.auditCode === 'string' ? error.auditCode : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  if (stableCodes.has(candidate)) return candidate;
  if (candidate === 'ENOENT') return phase === 'environment-validation' ? 'CREDENTIAL_PATH_MISSING' : 'INPUT_NOT_FOUND';
  if (candidate === 'EACCES') return 'READ_FAILED';
  if (candidate === 'EINVAL') return 'INVALID_ARGUMENT';
  if (candidate === 'PERMISSION_DENIED' || candidate === 'PERMISSION_DENIED:') return 'PERMISSION_DENIED';
  if (candidate === 'RESOURCE_EXHAUSTED' || candidate === 'QUOTA_EXCEEDED') return 'QUOTA_EXCEEDED';
  if (candidate === 'DEADLINE_EXCEEDED' || candidate === 'UNAVAILABLE' || candidate === 'ABORTED') return 'SERVER_COMPLETION_UNKNOWN';
  if (candidate === 'NOT_FOUND') return 'READ_NOT_FOUND';
  if (phase === 'plan-guard-validation') return 'GUARD_MISMATCH';
  if (phase === 'implementation-identity') return 'IMPLEMENTATION_IDENTITY_MISMATCH';
  if (phase === 'firestore-bootstrap') return 'BOOTSTRAP_FAILED';
  if (phase === 'selector-read' || phase === 'exact-path-reads') return 'READ_FAILED';
  if (phase === 'bundle-manifest-validation') return 'INPUT_PARSE_FAILED';
  return 'INVALID_ARGUMENT';
}

export function failG8V2StructuredAuditResult(result: G8V2StructuredAuditResult, phase: G8V2StateAuditPhase, error: unknown) {
  result.status = 'failed';
  result.phase = phase;
  result.failedPhase = phase;
  result.error = { classification: phaseClassification(phase), code: stableG8V2StateAuditErrorCode(phase, error) };
  result.safeNextAction = phase === 'selector-read' || phase === 'exact-path-reads' || phase === 'firestore-bootstrap'
    ? 'stop for review; selector/content state is unknown or incomplete and no retry is permitted'
    : 'repair the local phase failure and rerun the Firebase-free preflight';
  return result;
}

function refreshOutcome(read: G8V2ReadAccounting) {
  if (read.attempted === 0) return 'not-attempted' as const;
  const kinds = [read.succeeded > 0, read.failed > 0, read.unknown > 0].filter(Boolean).length;
  if (kinds > 1) return 'mixed' as const;
  if (read.unknown > 0) return 'attempted-unknown' as const;
  if (read.failed > 0) return 'failed' as const;
  return 'succeeded' as const;
}

export function beginG8V2Read(read: G8V2ReadAccounting) {
  read.attempted += 1;
  read.notAttempted = Math.max(0, read.notAttempted - 1);
}

export function completeG8V2Read(read: G8V2ReadAccounting, outcome: 'succeeded' | 'failed' | 'attempted-unknown') {
  if (outcome === 'succeeded') read.succeeded += 1;
  else if (outcome === 'failed') read.failed += 1;
  else read.unknown += 1;
  read.outcome = refreshOutcome(read);
}

export function readOutcomeFromG8V2Error(error: unknown): 'failed' | 'attempted-unknown' {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : error && typeof error === 'object' && 'auditCode' in error && typeof error.auditCode === 'string' ? error.auditCode : '';
  return ['DEADLINE_EXCEEDED', 'UNAVAILABLE', 'ABORTED', 'SERVER_COMPLETION_UNKNOWN'].includes(code) ? 'attempted-unknown' : 'failed';
}
