import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

type Gate = { label: string; executable: string; arguments: string[]; emulator?: boolean };
type Json = Record<string, unknown>;
const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const tscCli = require.resolve('typescript/bin/tsc');
const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const privateRoot = resolve('.artifacts/private/canonical-migration');
const receiptPath = resolve(privateRoot, 'g8-4br6b-local-gate-receipt.json');
const snapshotPath = resolve(privateRoot, 'g8-4br5b-production-conflict-snapshot.json');
const expectedSnapshotBytes = 35_148_779;
const expectedSnapshotSha256 = '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3';
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const expect: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new Error(code); };
const snapshotIdentity = () => { const body = readFileSync(snapshotPath); return { bytes: statSync(snapshotPath).size, sha256: sha256(body) }; };
const writeExclusive = (value: unknown) => writeFileSync(receiptPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const npm = (label: string, script: string): Gate => ({ label, executable: process.execPath, arguments: [npmCli, 'run', script] });
const emulator = (label: string, config: string, test: string): Gate => ({
  label, executable: process.execPath,
  arguments: [firebaseCli, 'emulators:exec', '--project', 'demo-no-project', '--config', config, '--only', 'firestore', `"${process.execPath}" "${tsxCli}" "${test}"`],
  emulator: true,
});
const gates: Gate[] = [
  { label: 'br6b-focused', executable: process.execPath, arguments: [tsxCli, 'scripts/lib/g8V2FecCandidateEquivalence.test.ts'] },
  { label: 'br6a-disposition-regression', executable: process.execPath, arguments: [tsxCli, 'scripts/lib/g8V2ConflictDisposition.test.ts'] },
  { label: 'br5a-analysis-regression', executable: process.execPath, arguments: [tsxCli, 'scripts/lib/g8V2ConflictAnalysis.test.ts'] },
  { label: 'br5c-runner-regression', executable: process.execPath, arguments: [tsxCli, 'scripts/lib/g8V2ConflictOfflineRunner.test.ts'] },
  { label: 'br5a-preflight-regression', executable: process.execPath, arguments: [tsxCli, 'scripts/lib/g8V2ConflictPreflight.test.ts'] },
  npm('br4a-activation-recovery', 'test-g8-4br4a-activation-recovery'),
  npm('g8-3a-activation', 'test-g8-3a-v2-activation'),
  npm('br3a-structured-audit', 'test-g8-4br3a-structured-audit'),
  npm('g8-2a-product-shadow', 'test-g8-2a-product-shadow'),
  npm('local-product-bundle', 'test-local-product-bundle'),
  { label: 'typescript', executable: process.execPath, arguments: [tscCli, '--noEmit', '--pretty', 'false'] },
  npm('lint', 'lint'),
  npm('build', 'build'),
  emulator('br5a-capture-emulator-18083', 'scripts/firebase.g8-4br5a-emulator.json', 'scripts/lib/g8V2ConflictCapture.emulator.test.ts'),
  emulator('br4a-activation-emulator-18082', 'scripts/firebase.g8-4br4a-emulator.json', 'scripts/lib/g8V2Activation.emulator.test.ts'),
  emulator('br3a-audit-emulator-18081', 'scripts/firebase.g8-4br0-emulator.json', 'scripts/lib/g8V2StateAudit.emulator.test.ts'),
  emulator('g8-3a-activation-emulator-8081', 'scripts/firebase.emulator-test.json', 'scripts/lib/g8V2Activation.emulator.test.ts'),
  emulator('g8-2a-shadow-emulator-8081', 'scripts/firebase.emulator-test.json', 'scripts/lib/g8ProductShadowExecutor.emulator.test.ts'),
];

function childEnvironment(emulatorChild: boolean) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    const upper = key.toUpperCase();
    if (['FIREBASE_SERVICE_ACCOUNT','GOOGLE_APPLICATION_CREDENTIALS','FIRESTORE_EMULATOR_HOST'].includes(upper)) delete environment[key];
    if (emulatorChild && ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY'].includes(upper)) delete environment[key];
  }
  if (emulatorChild) {
    environment.FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true';
    environment.NO_PROXY = '127.0.0.1,localhost,::1';
    environment.no_proxy = '127.0.0.1,localhost,::1';
  } else {
    environment.FIREBASE_SERVICE_ACCOUNT = 'C:\\definitely-missing-g8-4br6b.json';
    environment.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-missing-g8-4br6b.json';
    environment.HTTP_PROXY = 'http://127.0.0.1:9';
    environment.HTTPS_PROXY = 'http://127.0.0.1:9';
    environment.ALL_PROXY = 'http://127.0.0.1:9';
    environment.NO_PROXY = '';
    environment.no_proxy = '';
  }
  return environment;
}

function main() {
  expect(process.argv.length === 2, 'BR6B_GATE_RUNNER_ACCEPTS_NO_ARGUMENTS');
  expect(existsSync(npmCli), 'BR6B_LOCAL_NPM_CLI_MISSING');
  expect(!existsSync(receiptPath), 'BR6B_GATE_RECEIPT_COLLISION');
  const emulatorEnvironment = childEnvironment(true);
  const emulatorKeys = Object.keys(emulatorEnvironment).map((key) => key.toUpperCase());
  expect(!emulatorKeys.includes('FIREBASE_SERVICE_ACCOUNT') && !emulatorKeys.includes('GOOGLE_APPLICATION_CREDENTIALS') && !emulatorKeys.includes('FIRESTORE_EMULATOR_HOST'), 'BR6B_EMULATOR_CREDENTIAL_OR_HOST_LEAK');
  expect(!emulatorKeys.includes('HTTP_PROXY') && !emulatorKeys.includes('HTTPS_PROXY') && !emulatorKeys.includes('ALL_PROXY'), 'BR6B_EMULATOR_PROXY_LEAK');
  expect(emulatorEnvironment.NO_PROXY === '127.0.0.1,localhost,::1' && emulatorEnvironment.no_proxy === '127.0.0.1,localhost,::1' && emulatorEnvironment.FIREBASE_CLI_DISABLE_UPDATE_CHECK === 'true', 'BR6B_EMULATOR_LOOPBACK_POLICY_MISMATCH');
  const before = snapshotIdentity();
  expect(before.bytes === expectedSnapshotBytes && before.sha256 === expectedSnapshotSha256, 'BR6B_GATE_SNAPSHOT_MISMATCH_BEFORE');
  const results: Json[] = [];
  for (const gate of gates) {
    const startedAt = new Date().toISOString();
    const child = spawnSync(gate.executable, gate.arguments, {
      cwd: process.cwd(), env: childEnvironment(gate.emulator === true), shell: false, windowsHide: true,
      timeout: gate.emulator ? 10 * 60 * 1000 : 5 * 60 * 1000, maxBuffer: 128 * 1024 * 1024,
    });
    const stdout = Buffer.from(child.stdout ?? ''); const stderr = Buffer.from(child.stderr ?? '');
    const result: Json = {
      label: gate.label, emulator: gate.emulator === true, startedAt, finishedAt: new Date().toISOString(),
      exitStatus: child.status, signal: child.signal, errorCode: child.error && 'code' in child.error ? String(child.error.code) : null,
      stdoutBytes: stdout.length, stdoutSha256: sha256(stdout), stderrBytes: stderr.length, stderrSha256: sha256(stderr),
    };
    results.push(result);
    const afterGate = snapshotIdentity();
    if (afterGate.bytes !== before.bytes || afterGate.sha256 !== before.sha256) {
      writeExclusive({ contract: 'g8-4br6b-local-gate-receipt/v1', status: 'failed', failureClass: 'SNAPSHOT_DRIFT', results, snapshot: { before, afterGate }, safety: { productionOperations: 0 } });
      process.exitCode = 1; return;
    }
    if (child.status !== 0) {
      writeExclusive({ contract: 'g8-4br6b-local-gate-receipt/v1', status: 'failed', failureClass: 'NONZERO_GATE', failedGate: gate.label, results, snapshot: { before, after: afterGate }, safety: { productionOperations: 0 } });
      process.stdout.write(`${JSON.stringify({ status: 'failed', failedGate: gate.label, result, safety: { productionOperations: 0 } })}\n`);
      process.exitCode = 1; return;
    }
  }
  const after = snapshotIdentity();
  const receipt = {
    contract: 'g8-4br6b-local-gate-receipt/v1', status: 'completed', results,
    snapshot: { bytesBefore: before.bytes, bytesAfter: after.bytes, sha256Before: before.sha256, sha256After: after.sha256, byteIdentical: before.bytes === after.bytes && before.sha256 === after.sha256 },
    emulatorPolicy: { projectId: 'demo-no-project', proxyBypass: '127.0.0.1,localhost,::1', credentialVariables: 0, updateChecks: false, productionTargets: 0 },
    safety: { credentialsLoaded: false, externalNetworkRequests: 0, productionOperations: 0 },
  };
  writeExclusive(receipt);
  process.stdout.write(`${JSON.stringify({ status: receipt.status, gates: results.map((result) => ({ label: result.label, exitStatus: result.exitStatus })), snapshot: receipt.snapshot, emulatorPolicy: receipt.emulatorPolicy, safety: receipt.safety })}\n`);
}

try { main(); }
catch (error) {
  const failure = { contract: 'g8-4br6b-local-gate-receipt/v1', status: 'failed', failureClass: error instanceof Error ? error.message : 'BR6B_UNKNOWN_GATE_FAILURE', safety: { productionOperations: 0 } };
  if (!existsSync(receiptPath)) writeExclusive(failure);
  process.stdout.write(`${JSON.stringify(failure)}\n`); process.exitCode = 1;
}
