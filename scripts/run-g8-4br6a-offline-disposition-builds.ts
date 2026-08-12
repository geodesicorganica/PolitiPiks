import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { G8_V2_DISPOSITION_REPORT_CONTRACT } from './lib/g8V2ConflictDisposition.js';

type Json = Record<string, any>;
const require = createRequire(import.meta.url);
const privateRoot = resolve('.artifacts/private/canonical-migration');
const snapshot = resolve(privateRoot, 'g8-4br5b-production-conflict-snapshot.json');
const receiptPath = resolve(privateRoot, 'g8-4br6a-resource-safe-offline-runner-receipt.json');
const steps = [
  { label: 'independent-build-1', verifyReplay: false, planPath: resolve(privateRoot, 'g8-4br6a-resource-safe-disposition-plan-build-1.json') },
  { label: 'independent-build-2', verifyReplay: false, planPath: resolve(privateRoot, 'g8-4br6a-resource-safe-disposition-plan-build-2.json') },
  { label: 'verify-replay', verifyReplay: true, planPath: resolve(privateRoot, 'g8-4br6a-resource-safe-disposition-plan-verified.json') },
] as const;
const expectedSnapshotBytes = 35_148_779;
const expectedSnapshotSha256 = '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3';
const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
function sha256File(path: string) {
  const handle = openSync(path, 'r'); const buffer = Buffer.allocUnsafe(64 * 1024); const hash = createHash('sha256');
  try { for (;;) { const bytes = readSync(handle, buffer, 0, buffer.length, null); if (bytes === 0) return hash.digest('hex'); hash.update(buffer.subarray(0, bytes)); } }
  finally { closeSync(handle); }
}
const expect: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new Error(code); };
const writeExclusive = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const snapshotIdentity = () => ({ bytes: statSync(snapshot).size, sha256: sha256File(snapshot) });
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
  for (const key of Object.keys(environment)) {
    if (['FIREBASE_SERVICE_ACCOUNT','GOOGLE_APPLICATION_CREDENTIALS','FIRESTORE_EMULATOR_HOST'].includes(key.toUpperCase())) delete environment[key];
  }
  environment.FIREBASE_SERVICE_ACCOUNT = 'C:\\definitely-missing-g8-4br6a.json';
  environment.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-missing-g8-4br6a.json';
  environment.HTTP_PROXY = 'http://127.0.0.1:9';
  environment.HTTPS_PROXY = 'http://127.0.0.1:9';
  environment.ALL_PROXY = 'http://127.0.0.1:9';
  environment.NO_PROXY = '';
  environment.no_proxy = '';
  return environment;
}

function validateReport(value: unknown) {
  expect(value !== null && typeof value === 'object' && !Array.isArray(value), 'BR6A_REPORT_NOT_OBJECT');
  const report = value as Json;
  expect(report.schemaVersion === 1 && report.contract === G8_V2_DISPOSITION_REPORT_CONTRACT && report.operation === 'g8-4br6a-offline-conflict-disposition-plan', 'BR6A_REPORT_CONTRACT_MISMATCH');
  expect(report.aggregate?.plannedPaths === 858 && report.aggregate?.duplicatePaths === 0 && report.aggregate?.omittedPaths === 0, 'BR6A_REPORT_PATH_COVERAGE_MISMATCH');
  expect(report.aggregate?.byFamily?.races === 429 && report.aggregate?.byFamily?.metrics === 429, 'BR6A_REPORT_FAMILY_MISMATCH');
  expect(report.safety?.firebaseImported === false && report.safety?.credentialsLoaded === false && report.safety?.networkRequests === 0 && report.safety?.productionOperations === 0, 'BR6A_REPORT_SAFETY_MISMATCH');
  expect(report.readiness?.readyForExecutor === false && report.readiness?.deterministicallyResolved + report.readiness?.unresolved === 858, 'BR6A_REPORT_READINESS_MISMATCH');
  expect(typeof report.digests?.plan === 'string' && /^[a-f0-9]{64}$/.test(report.digests.plan), 'BR6A_REPORT_DIGEST_MISMATCH');
  return report;
}

function main() {
  expect(process.argv.length === 2, 'BR6A_RUNNER_ACCEPTS_NO_ARGUMENTS');
  for (const output of [receiptPath, ...steps.map((step) => step.planPath)]) expect(!existsSync(output), 'BR6A_OUTPUT_COLLISION');
  const before = snapshotIdentity();
  expect(before.bytes === expectedSnapshotBytes && before.sha256 === expectedSnapshotSha256, 'BR6A_SNAPSHOT_INTEGRITY_MISMATCH_BEFORE');
  const tsxCli = require.resolve('tsx/cli');
  const runs: Json[] = [];
  const reports: Buffer[] = [];
  const plans: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const step of steps) {
    const child = spawnSync(process.execPath, [tsxCli, 'scripts/report-g8-4br6a-dispositions.ts', '--plan-out', step.planPath, ...(step.verifyReplay ? ['--verify-replay'] : [])], {
      cwd: process.cwd(), env: offlineEnvironment(), shell: false, windowsHide: true, maxBuffer: 128 * 1024 * 1024, timeout: 10 * 60 * 1000,
    });
    const stdout = Buffer.from(child.stdout ?? '');
    const stderr = Buffer.from(child.stderr ?? '');
    const run: Json = {
      label: step.label,
      verifyReplay: step.verifyReplay,
      exitStatus: child.status,
      signal: child.signal,
      errorCode: child.error && 'code' in child.error ? String(child.error.code) : null,
      stdoutBytes: stdout.length,
      stdoutSha256: sha256(stdout),
      stderrBytes: stderr.length,
      stderrSha256: sha256(stderr),
    };
    runs.push(run);
    if (child.status !== 0) {
      writeExclusive(receiptPath, { contract: 'g8-4br6a-offline-runner-receipt/v1', status: 'failed', runs, safety: { productionOperations: 0 }, safeNextAction: 'stop; preserve snapshot and local failure evidence' });
      process.stdout.write(`${JSON.stringify({ ...runs.at(-1), status: 'failed', safety: { productionOperations: 0 } })}\n`);
      process.exitCode = 1;
      return;
    }
    expect(stderr.length === 0 && sha256(stderr) === emptySha256, 'BR6A_CHILD_STDERR_PRESENT');
    validateReport(JSON.parse(stdout.toString('utf8')) as unknown);
    const planBytes = statSync(step.planPath).size; const planSha256 = sha256File(step.planPath);
    reports.push(stdout); plans.push({ path: step.planPath, bytes: planBytes, sha256: planSha256 });
    run.planBytes = planBytes; run.planSha256 = planSha256;
  }
  expect(reports[0].equals(reports[1]) && reports[1].equals(reports[2]), 'BR6A_REPORT_BYTES_DRIFT');
  expect(filesByteIdentical(plans[0].path, plans[1].path) && filesByteIdentical(plans[1].path, plans[2].path), 'BR6A_PLAN_BYTES_DRIFT');
  const parsed = validateReport(JSON.parse(reports[0].toString('utf8')) as unknown);
  const after = snapshotIdentity();
  expect(after.bytes === before.bytes && after.sha256 === before.sha256, 'BR6A_SNAPSHOT_INTEGRITY_MISMATCH_AFTER');
  const receipt = {
    contract: 'g8-4br6a-offline-runner-receipt/v1',
    status: 'completed',
    snapshot: { bytesBefore: before.bytes, bytesAfter: after.bytes, sha256Before: before.sha256, sha256After: after.sha256, byteIdentical: true },
    runs,
    reports: { byteIdentical: true, bytes: reports[0].length, sha256: sha256(reports[0]) },
    plans: { byteIdentical: true, bytes: plans[0].bytes, sha256: plans[0].sha256 },
    lineage: parsed.lineage,
    aggregate: parsed.aggregate,
    readiness: parsed.readiness,
    digests: parsed.digests,
    safety: { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, productionOperations: 0 },
  };
  writeExclusive(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

try { main(); }
catch (error) {
  const failure = { contract: 'g8-4br6a-offline-runner-receipt/v1', status: 'failed', errorClass: error instanceof Error ? error.message : 'BR6A_UNKNOWN_OFFLINE_FAILURE', safety: { productionOperations: 0 }, safeNextAction: 'stop; preserve snapshot and local failure evidence' };
  if (!existsSync(receiptPath)) writeExclusive(receiptPath, failure);
  process.stdout.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}
