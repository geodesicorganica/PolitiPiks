import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  G8_V2_BR6B_CERTIFIED_PLAN_DIGEST,
  G8_V2_BR6B_CERTIFIED_PRIVATE_SHA256,
  G8_V2_FINAL_IDENTITY_REPORT_CONTRACT,
  G8_V2_G2_1_STATUS_SHA256,
  G8_V2_OVERRIDE_BYTES,
  G8_V2_OVERRIDE_SHA256,
} from './lib/g8V2IdentityExceptionResolution.js';

type Json = Record<string, any>;
type Step = { label: string; phase: 'build' | 'replay'; verifyReplay: boolean; planPath: string };
const require = createRequire(import.meta.url);
const privateRoot = resolve('.artifacts/private/canonical-migration');
const snapshot = resolve(privateRoot, 'g8-4br5b-production-conflict-snapshot.json');
const overrideArtifact = resolve('data/2026/canonical-identity-overrides.json');
const g2Status = resolve('docs/status/g2-1-identity-resolution.md');
const br6bPlan = resolve(privateRoot, 'g8-4br6b-revised-disposition-plan-build-1.json');
const originalFailureReceipt = resolve(privateRoot, 'g8-4br6c-offline-runner-receipt.json');
const finalReceiptPath = resolve(privateRoot, 'g8-4br6cr-final-certification-receipt.json');
const finalSteps: Step[] = [
  { label: 'independent-build-1', phase: 'build', verifyReplay: false, planPath: resolve(privateRoot, 'g8-4br6cr-build-1-final-identity-plan.json') },
  { label: 'independent-build-2', phase: 'build', verifyReplay: false, planPath: resolve(privateRoot, 'g8-4br6cr-build-2-final-identity-plan.json') },
  { label: 'verify-replay', phase: 'replay', verifyReplay: true, planPath: resolve(privateRoot, 'g8-4br6cr-replay-final-identity-plan.json') },
];
const expectedSnapshot = { bytes: 35_148_779, sha256: '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3' };
const expectedOverride = { bytes: G8_V2_OVERRIDE_BYTES, sha256: G8_V2_OVERRIDE_SHA256 };
const expectedG2Status = { bytes: 4_627, sha256: G8_V2_G2_1_STATUS_SHA256 };
const expectedBr6b = { bytes: 81_061_814, sha256: G8_V2_BR6B_CERTIFIED_PRIVATE_SHA256 };
const expectedOriginalFailure = { bytes: 635, sha256: '165e87b4c6e395ca0d1691af559c39a9e321a7e213a1a91962fc28095c08fb1d' };
const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const safety = { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, productionOperations: 0, dispositionsExecuted: 0 } as const;
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
function fileIdentity(path: string) {
  const handle = openSync(path, 'r'); const buffer = Buffer.allocUnsafe(64 * 1024); const hash = createHash('sha256');
  try { for (;;) { const bytes = readSync(handle, buffer, 0, buffer.length, null); if (bytes === 0) return { bytes: statSync(path).size, sha256: hash.digest('hex') }; hash.update(buffer.subarray(0, bytes)); } }
  finally { closeSync(handle); }
}
const expect: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new Error(code); };
const writeExclusive = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
function filesByteIdentical(leftPath: string, rightPath: string) {
  if (statSync(leftPath).size !== statSync(rightPath).size) return false;
  const left = openSync(leftPath, 'r'); const right = openSync(rightPath, 'r');
  const leftBuffer = Buffer.allocUnsafe(64 * 1024); const rightBuffer = Buffer.allocUnsafe(64 * 1024);
  try {
    for (;;) {
      const leftBytes = readSync(left, leftBuffer, 0, leftBuffer.length, null); const rightBytes = readSync(right, rightBuffer, 0, rightBuffer.length, null);
      if (leftBytes !== rightBytes || !leftBuffer.subarray(0, leftBytes).equals(rightBuffer.subarray(0, rightBytes))) return false;
      if (leftBytes === 0) return true;
    }
  } finally { closeSync(left); closeSync(right); }
}

function offlineEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (['FIREBASE_SERVICE_ACCOUNT','GOOGLE_APPLICATION_CREDENTIALS','FIRESTORE_EMULATOR_HOST'].includes(key.toUpperCase())) delete environment[key];
  environment.FIREBASE_SERVICE_ACCOUNT = 'C:\\definitely-missing-g8-4br6cr.json';
  environment.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-missing-g8-4br6cr.json';
  environment.HTTP_PROXY = 'http://127.0.0.1:9';
  environment.HTTPS_PROXY = 'http://127.0.0.1:9';
  environment.ALL_PROXY = 'http://127.0.0.1:9';
  environment.NO_PROXY = '';
  environment.no_proxy = '';
  return environment;
}

function certifiedInputs() {
  return {
    snapshot: fileIdentity(snapshot),
    overrides: fileIdentity(overrideArtifact),
    g2Status: fileIdentity(g2Status),
    br6bPlan: fileIdentity(br6bPlan),
    originalFailureReceipt: fileIdentity(originalFailureReceipt),
  };
}

function validateCertifiedInputs(value: ReturnType<typeof certifiedInputs>, suffix: string) {
  expect(JSON.stringify(value.snapshot) === JSON.stringify(expectedSnapshot), `BR6CR_SNAPSHOT_INTEGRITY_MISMATCH_${suffix}`);
  expect(JSON.stringify(value.overrides) === JSON.stringify(expectedOverride), `BR6CR_OVERRIDE_INTEGRITY_MISMATCH_${suffix}`);
  expect(JSON.stringify(value.g2Status) === JSON.stringify(expectedG2Status), `BR6CR_G2_STATUS_INTEGRITY_MISMATCH_${suffix}`);
  expect(JSON.stringify(value.br6bPlan) === JSON.stringify(expectedBr6b), `BR6CR_BR6B_PLAN_INTEGRITY_MISMATCH_${suffix}`);
  expect(JSON.stringify(value.originalFailureReceipt) === JSON.stringify(expectedOriginalFailure), `BR6CR_ORIGINAL_FAILURE_RECEIPT_INTEGRITY_MISMATCH_${suffix}`);
}

function sanitizeErrorCode(stderr: Buffer, fallback: string) {
  return stderr.toString('utf8').match(/\bBR6C(?:R)?_[A-Z0-9_]+\b/)?.[0] ?? fallback;
}

function sanitizeThrownError(error: unknown) {
  if (!(error instanceof Error)) return 'BR6CR_UNKNOWN_OFFLINE_FAILURE';
  return error.message.match(/\bBR6C(?:R)?_[A-Z0-9_]+\b/)?.[0] ?? 'BR6CR_RUNNER_INTERNAL_FAILURE';
}

function validateReport(value: unknown) {
  expect(value !== null && typeof value === 'object' && !Array.isArray(value), 'BR6CR_REPORT_NOT_OBJECT');
  const report = value as Json;
  expect(report.schemaVersion === 1 && report.contract === G8_V2_FINAL_IDENTITY_REPORT_CONTRACT && report.operation === 'g8-4br6c-offline-final-candidate-identity-resolution', 'BR6CR_REPORT_CONTRACT_MISMATCH');
  expect(report.basePlan?.planDigest === G8_V2_BR6B_CERTIFIED_PLAN_DIGEST && report.basePlan?.privatePlanSha256 === G8_V2_BR6B_CERTIFIED_PRIVATE_SHA256, 'BR6CR_BASE_PLAN_IDENTITY_MISMATCH');
  expect(report.certifiedOverrides?.bytes === G8_V2_OVERRIDE_BYTES && report.certifiedOverrides?.sha256 === G8_V2_OVERRIDE_SHA256, 'BR6CR_REPORT_OVERRIDE_ARTIFACT_MISMATCH');
  expect(report.identityResolution?.aggregate?.resolvedRaces === 4 && report.identityResolution?.aggregate?.correctedOneToOneRaces === 3 && report.identityResolution?.aggregate?.consumedOverrides === 8, 'BR6CR_REPORT_RESOLUTION_COUNT_MISMATCH');
  expect(report.identityResolution?.aggregate?.approvedManyToOneMergeGroups === 1 && report.identityResolution?.aggregate?.approvedManyToOneAliases === 2, 'BR6CR_REPORT_MERGE_COUNT_MISMATCH');
  expect(report.identityResolution?.aggregate?.resolvedIdentityBlockers === 7 && report.identityResolution?.aggregate?.remainingConflicts === 0, 'BR6CR_REPORT_IDENTITY_CONFLICT_MISMATCH');
  expect(report.aggregate?.plannedPaths === 858 && report.aggregate?.duplicatePaths === 0 && report.aggregate?.omittedPaths === 0, 'BR6CR_REPORT_PATH_COVERAGE_MISMATCH');
  expect(report.aggregate?.byDisposition?.unresolved === 0 && report.aggregate?.byDisposition?.['replace-with-certified'] === 4 && report.aggregate?.byDisposition?.['deterministic-merge'] === 854, 'BR6CR_REPORT_DISPOSITION_MISMATCH');
  expect(report.readiness?.deterministicallyResolved === 858 && report.readiness?.unresolved === 0 && report.readiness?.policyConflicts === 0 && report.readiness?.readyForExecutor === true, 'BR6CR_REPORT_READINESS_MISMATCH');
  expect(report.readiness?.reproducibleOutputs === true && report.readiness?.rollbackEvidenceComplete === true, 'BR6CR_REPORT_EVIDENCE_INCOMPLETE');
  expect(report.safety?.firebaseImported === false && report.safety?.credentialsLoaded === false && report.safety?.networkRequests === 0 && report.safety?.productionOperations === 0 && report.safety?.dispositionsExecuted === 0, 'BR6CR_REPORT_SAFETY_MISMATCH');
  expect(typeof report.digests?.plan === 'string' && /^[a-f0-9]{64}$/.test(report.digests.plan), 'BR6CR_REPORT_DIGEST_MISMATCH');
  return report;
}

function runStep(step: Step) {
  const tsxCli = require.resolve('tsx/cli');
  const child = spawnSync(process.execPath, [tsxCli, 'scripts/report-g8-4br6c-final-identity-resolution.ts', '--plan-out', step.planPath, ...(step.verifyReplay ? ['--verify-replay'] : [])], {
    cwd: process.cwd(), env: offlineEnvironment(), shell: false, windowsHide: true, maxBuffer: 128 * 1024 * 1024, timeout: 10 * 60 * 1000,
  });
  const stdout = Buffer.from(child.stdout ?? ''); const stderr = Buffer.from(child.stderr ?? '');
  const result: Json = {
    label: step.label, phase: step.phase, verifyReplay: step.verifyReplay, exitStatus: child.status, signal: child.signal,
    errorCode: child.status === 0 ? null : sanitizeErrorCode(stderr, 'BR6CR_CHILD_NONZERO_WITHOUT_CODE'),
    spawnErrorCode: child.error && 'code' in child.error ? String(child.error.code) : null,
    stdoutBytes: stdout.length, stdoutSha256: sha256(stdout), stderrBytes: stderr.length, stderrSha256: sha256(stderr),
  };
  return { child, stdout, stderr, result };
}

function runDiagnostic(id: string) {
  expect(/^[a-z0-9][a-z0-9-]{0,31}$/.test(id), 'BR6CR_INVALID_DIAGNOSTIC_ID');
  const receiptPath = resolve(privateRoot, `g8-4br6cr-diagnostic-${id}-receipt.json`);
  const step: Step = { label: `diagnostic-${id}`, phase: 'build', verifyReplay: false, planPath: resolve(privateRoot, `g8-4br6cr-diagnostic-${id}-plan.json`) };
  expect(!existsSync(receiptPath) && !existsSync(step.planPath), 'BR6CR_DIAGNOSTIC_OUTPUT_COLLISION');
  const before = certifiedInputs(); validateCertifiedInputs(before, 'BEFORE');
  const { child, stdout, stderr, result } = runStep(step);
  if (child.status !== 0) {
    writeExclusive(receiptPath, { contract: 'g8-4br6cr-diagnostic-receipt/v1', status: 'failed', phase: step.phase, result, inputs: { before, after: certifiedInputs() }, safety, safeNextAction: 'diagnose from phase, sanitized error code, and hashes only; do not print raw stderr or private data' });
    process.stdout.write(`${JSON.stringify({ status: 'failed', phase: step.phase, result, safety })}\n`); process.exitCode = 1; return;
  }
  expect(stderr.length === 0 && sha256(stderr) === emptySha256 && existsSync(step.planPath), 'BR6CR_DIAGNOSTIC_CHILD_OUTPUT_INVALID');
  const report = validateReport(JSON.parse(stdout.toString('utf8')) as unknown);
  const after = certifiedInputs(); validateCertifiedInputs(after, 'AFTER');
  expect(JSON.stringify(after) === JSON.stringify(before), 'BR6CR_CERTIFIED_INPUT_DRIFT_AFTER_DIAGNOSTIC');
  const receipt = { contract: 'g8-4br6cr-diagnostic-receipt/v1', status: 'completed', phase: step.phase, result: { ...result, plan: fileIdentity(step.planPath), planDigest: report.digests.plan }, inputs: { before, after, byteIdentical: true }, safety };
  writeExclusive(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function runFinalSequence() {
  for (const output of [finalReceiptPath, ...finalSteps.map((step) => step.planPath), resolve(privateRoot, 'g8-4br6cr-replay-final-identity-plan.verify-replay.json')]) expect(!existsSync(output), 'BR6CR_FINAL_OUTPUT_COLLISION');
  const before = certifiedInputs(); validateCertifiedInputs(before, 'BEFORE');
  const runs: Json[] = []; const reports: Buffer[] = []; const plans: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const step of finalSteps) {
    const { child, stdout, stderr, result } = runStep(step); runs.push(result);
    if (child.status !== 0) {
      const afterFailure = certifiedInputs();
      writeExclusive(finalReceiptPath, { contract: 'g8-4br6cr-final-certification-receipt/v1', status: 'failed', failedPhase: step.phase, failedStep: step.label, runs, inputs: { before, after: afterFailure, byteIdentical: JSON.stringify(before) === JSON.stringify(afterFailure) }, safety, safeNextAction: 'stop without retry' });
      process.stdout.write(`${JSON.stringify({ status: 'failed', failedPhase: step.phase, failedStep: step.label, result, safety })}\n`); process.exitCode = 1; return;
    }
    expect(stderr.length === 0 && sha256(stderr) === emptySha256, 'BR6CR_CHILD_STDERR_PRESENT');
    validateReport(JSON.parse(stdout.toString('utf8')) as unknown);
    const planIdentity = fileIdentity(step.planPath);
    reports.push(stdout); plans.push({ path: step.planPath, ...planIdentity });
    result.planBytes = planIdentity.bytes; result.planSha256 = planIdentity.sha256;
  }
  expect(reports[0].equals(reports[1]) && reports[1].equals(reports[2]), 'BR6CR_REPORT_BYTES_DRIFT');
  expect(filesByteIdentical(plans[0].path, plans[1].path) && filesByteIdentical(plans[1].path, plans[2].path), 'BR6CR_PLAN_BYTES_DRIFT');
  expect(filesByteIdentical(plans[2].path, resolve(privateRoot, 'g8-4br6cr-replay-final-identity-plan.verify-replay.json')), 'BR6CR_REPLAY_PLAN_BYTES_DRIFT');
  const parsed = validateReport(JSON.parse(reports[0].toString('utf8')) as unknown);
  const after = certifiedInputs(); validateCertifiedInputs(after, 'AFTER');
  expect(JSON.stringify(after) === JSON.stringify(before), 'BR6CR_CERTIFIED_INPUT_DRIFT_AFTER_FINAL');
  const receipt = {
    contract: 'g8-4br6cr-final-certification-receipt/v1', status: 'completed', inputs: { before, after, byteIdentical: true },
    runs, reports: { byteIdentical: true, bytes: reports[0].length, sha256: sha256(reports[0]) },
    plans: { byteIdentical: true, bytes: plans[0].bytes, sha256: plans[0].sha256 },
    replay: { byteIdentical: true, verifiedPlan: fileIdentity(plans[2].path), replayPlan: fileIdentity(resolve(privateRoot, 'g8-4br6cr-replay-final-identity-plan.verify-replay.json')) },
    basePlan: parsed.basePlan, certifiedOverrides: parsed.certifiedOverrides, identityResolution: parsed.identityResolution,
    aggregate: parsed.aggregate, readiness: parsed.readiness, digests: parsed.digests, safety,
  };
  writeExclusive(finalReceiptPath, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) { runFinalSequence(); return; }
  expect(args.length === 2 && args[0] === '--diagnostic-id', 'BR6CR_RUNNER_ARGUMENT_MISMATCH');
  runDiagnostic(args[1]);
}

try { main(); }
catch (error) {
  const code = sanitizeThrownError(error);
  const diagnosticIndex = process.argv.indexOf('--diagnostic-id');
  const diagnosticId = diagnosticIndex >= 0 ? process.argv[diagnosticIndex + 1] : undefined;
  const receiptPath = diagnosticId && /^[a-z0-9][a-z0-9-]{0,31}$/.test(diagnosticId)
    ? resolve(privateRoot, `g8-4br6cr-diagnostic-${diagnosticId}-receipt.json`)
    : finalReceiptPath;
  const failure = { contract: 'g8-4br6cr-sanitized-failure-receipt/v1', status: 'failed', phase: 'runner', errorCode: code, safety, safeNextAction: 'stop; preserve immutable inputs and sanitized local failure evidence' };
  if (!existsSync(receiptPath)) writeExclusive(receiptPath, failure);
  process.stdout.write(`${JSON.stringify(failure)}\n`); process.exitCode = 1;
}
