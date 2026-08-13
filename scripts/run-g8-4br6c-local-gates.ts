import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { G8_V2_BR6B_CERTIFIED_PRIVATE_SHA256, G8_V2_G2_1_STATUS_SHA256, G8_V2_OVERRIDE_BYTES, G8_V2_OVERRIDE_SHA256 } from './lib/g8V2IdentityExceptionResolution.js';

type Gate = { label: string; executable: string; arguments: string[]; emulator?: boolean };
type Json = Record<string, unknown>;
const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const tscCli = require.resolve('typescript/bin/tsc');
const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const privateRoot = resolve('.artifacts/private/canonical-migration');
const receiptPath = resolve(privateRoot, 'g8-4br6cr-local-gate-receipt.json');
const snapshotPath = resolve(privateRoot, 'g8-4br5b-production-conflict-snapshot.json');
const overridePath = resolve('data/2026/canonical-identity-overrides.json');
const g2StatusPath = resolve('docs/status/g2-1-identity-resolution.md');
const br6bPlanPath = resolve(privateRoot, 'g8-4br6b-revised-disposition-plan-build-1.json');
const originalFailureReceiptPath = resolve(privateRoot, 'g8-4br6c-offline-runner-receipt.json');
const expectedSnapshot = { bytes: 35_148_779, sha256: '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3' };
const expectedOverride = { bytes: G8_V2_OVERRIDE_BYTES, sha256: G8_V2_OVERRIDE_SHA256 };
const expectedG2Status = { bytes: 4_627, sha256: G8_V2_G2_1_STATUS_SHA256 };
const expectedBr6bPlan = { bytes: 81_061_814, sha256: G8_V2_BR6B_CERTIFIED_PRIVATE_SHA256 };
const expectedOriginalFailureReceipt = { bytes: 635, sha256: '165e87b4c6e395ca0d1691af559c39a9e321a7e213a1a91962fc28095c08fb1d' };
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const safety = { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, externalNetworkRequests: 0, productionOperations: 0, dispositionsExecuted: 0 } as const;
const expect: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new Error(code); };
function fileIdentity(path: string) {
  const handle = openSync(path, 'r'); const buffer = Buffer.allocUnsafe(64 * 1024); const hash = createHash('sha256');
  try { for (;;) { const bytes = readSync(handle, buffer, 0, buffer.length, null); if (bytes === 0) return { bytes: statSync(path).size, sha256: hash.digest('hex') }; hash.update(buffer.subarray(0, bytes)); } }
  finally { closeSync(handle); }
}
const certifiedInputs = () => ({
  snapshot: fileIdentity(snapshotPath),
  overrides: fileIdentity(overridePath),
  g2Status: fileIdentity(g2StatusPath),
  br6bPlan: fileIdentity(br6bPlanPath),
  originalFailureReceipt: fileIdentity(originalFailureReceiptPath),
});
const writeExclusive = (value: unknown) => writeFileSync(receiptPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const npm = (label: string, script: string): Gate => ({ label, executable: process.execPath, arguments: [npmCli, 'run', script] });
const emulator = (label: string, config: string, test: string): Gate => ({
  label, executable: process.execPath,
  arguments: [firebaseCli, 'emulators:exec', '--project', 'demo-no-project', '--config', config, '--only', 'firestore', `"${process.execPath}" "${tsxCli}" "${test}"`],
  emulator: true,
});
const gates: Gate[] = [
  { label: 'br6c-focused', executable: process.execPath, arguments: [tsxCli, 'scripts/lib/g8V2IdentityExceptionResolution.test.ts'] },
  { label: 'canonical-migration-overrides', executable: process.execPath, arguments: [tsxCli, 'scripts/lib/canonicalMigration.test.ts'] },
  { label: 'br6b-equivalence-regression', executable: process.execPath, arguments: [tsxCli, 'scripts/lib/g8V2FecCandidateEquivalence.test.ts'] },
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
  { label: 'git-diff-check', executable: 'git', arguments: ['diff', '--check'] },
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
    environment.FIREBASE_SERVICE_ACCOUNT = 'C:\\definitely-missing-g8-4br6c.json';
    environment.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-missing-g8-4br6c.json';
    environment.HTTP_PROXY = 'http://127.0.0.1:9';
    environment.HTTPS_PROXY = 'http://127.0.0.1:9';
    environment.ALL_PROXY = 'http://127.0.0.1:9';
    environment.NO_PROXY = '';
    environment.no_proxy = '';
  }
  return environment;
}

function main() {
  expect(process.argv.length === 2, 'BR6CR_GATE_RUNNER_ACCEPTS_NO_ARGUMENTS');
  expect(existsSync(npmCli), 'BR6CR_LOCAL_NPM_CLI_MISSING');
  expect(!existsSync(receiptPath), 'BR6CR_GATE_RECEIPT_COLLISION');
  const emulatorEnvironment = childEnvironment(true);
  const emulatorKeys = Object.keys(emulatorEnvironment).map((key) => key.toUpperCase());
  expect(!emulatorKeys.includes('FIREBASE_SERVICE_ACCOUNT') && !emulatorKeys.includes('GOOGLE_APPLICATION_CREDENTIALS') && !emulatorKeys.includes('FIRESTORE_EMULATOR_HOST'), 'BR6CR_EMULATOR_CREDENTIAL_OR_HOST_LEAK');
  expect(!emulatorKeys.includes('HTTP_PROXY') && !emulatorKeys.includes('HTTPS_PROXY') && !emulatorKeys.includes('ALL_PROXY'), 'BR6CR_EMULATOR_PROXY_LEAK');
  expect(emulatorEnvironment.NO_PROXY === '127.0.0.1,localhost,::1' && emulatorEnvironment.no_proxy === '127.0.0.1,localhost,::1' && emulatorEnvironment.FIREBASE_CLI_DISABLE_UPDATE_CHECK === 'true', 'BR6CR_EMULATOR_LOOPBACK_POLICY_MISMATCH');
  const before = certifiedInputs();
  expect(JSON.stringify(before.snapshot) === JSON.stringify(expectedSnapshot), 'BR6CR_GATE_SNAPSHOT_MISMATCH_BEFORE');
  expect(JSON.stringify(before.overrides) === JSON.stringify(expectedOverride), 'BR6CR_GATE_OVERRIDE_MISMATCH_BEFORE');
  expect(JSON.stringify(before.g2Status) === JSON.stringify(expectedG2Status), 'BR6CR_GATE_G2_STATUS_MISMATCH_BEFORE');
  expect(JSON.stringify(before.br6bPlan) === JSON.stringify(expectedBr6bPlan), 'BR6CR_GATE_BR6B_PLAN_MISMATCH_BEFORE');
  expect(JSON.stringify(before.originalFailureReceipt) === JSON.stringify(expectedOriginalFailureReceipt), 'BR6CR_GATE_ORIGINAL_FAILURE_RECEIPT_MISMATCH_BEFORE');
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
    const afterGate = certifiedInputs();
    if (JSON.stringify(afterGate) !== JSON.stringify(before)) {
      writeExclusive({ contract: 'g8-4br6cr-local-gate-receipt/v1', status: 'failed', failureClass: 'BR6CR_CERTIFIED_INPUT_DRIFT', results, inputs: { before, afterGate }, safety });
      process.exitCode = 1; return;
    }
    if (child.status !== 0) {
      writeExclusive({ contract: 'g8-4br6cr-local-gate-receipt/v1', status: 'failed', failureClass: 'BR6CR_NONZERO_GATE', failedGate: gate.label, results, inputs: { before, after: afterGate }, safety });
      process.stdout.write(`${JSON.stringify({ status: 'failed', failedGate: gate.label, result, safety })}\n`);
      process.exitCode = 1; return;
    }
  }
  const after = certifiedInputs();
  const receipt = {
    contract: 'g8-4br6cr-local-gate-receipt/v1', status: 'completed', results,
    inputs: { before, after, byteIdentical: JSON.stringify(before) === JSON.stringify(after) },
    emulatorPolicy: { projectId: 'demo-no-project', proxyBypass: '127.0.0.1,localhost,::1', credentialVariables: 0, updateChecks: false, productionTargets: 0 },
    safety,
  };
  writeExclusive(receipt);
  process.stdout.write(`${JSON.stringify({ status: receipt.status, gates: results.map((result) => ({ label: result.label, exitStatus: result.exitStatus })), inputs: receipt.inputs, emulatorPolicy: receipt.emulatorPolicy, safety: receipt.safety })}\n`);
}

try { main(); }
catch (error) {
  const code = error instanceof Error ? error.message.match(/\bBR6C(?:R)?_[A-Z0-9_]+\b/)?.[0] : undefined;
  const failure = { contract: 'g8-4br6cr-local-gate-receipt/v1', status: 'failed', failureClass: code ?? 'BR6CR_UNKNOWN_GATE_FAILURE', safety };
  if (!existsSync(receiptPath)) writeExclusive(failure);
  process.stdout.write(`${JSON.stringify(failure)}\n`); process.exitCode = 1;
}
