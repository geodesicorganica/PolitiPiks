import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { buildG8Br7bInnerTsxInvocation } from './lib/g8Br7bInnerTsxInvocation.js';

type Gate = { step: number; label: string; executable: string; arguments: string[]; emulator?: boolean; br7bMemoryPolicy?: boolean };
type Json = Record<string, unknown>;
const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const privateRoot = resolve('.artifacts/private/canonical-migration');
const receiptPath = resolve(privateRoot, 'g8-4br7b-final-certification-v2-receipt.json');
const replayReceiptPath = resolve(privateRoot, 'g8-4br7b-offline-replay-v2-receipt.json');
const requiredHead = '84125e0646dd0130c901c718d3dca19bdd8ef1e0';
const requiredBranch = 'codex/politipiks-canonical-shadow-release';
const expectedWorktreePaths = [
  'docs/2026-live-50-state-roadmap.md',
  'docs/status/g8-4br7br1-structured-audit-recovery.md',
  'docs/status/g8-4br7br2ar-inner-tsx-heap-recovery.md',
  'docs/status/g8-4br7b-local-reconciliation-executor.md',
  'scripts/firebase.g8-4br7b-emulator.json',
  'scripts/lib/g8Br7bInnerTsxInvocation.probe.ts',
  'scripts/lib/g8Br7bInnerTsxInvocation.test.ts',
  'scripts/lib/g8Br7bInnerTsxInvocation.ts',
  'scripts/lib/g8V2ConflictReconciliation.emulator.test.ts',
  'scripts/lib/g8V2ConflictReconciliation.test.ts',
  'scripts/lib/g8V2ConflictReconciliation.ts',
  'scripts/report-g8-4br7b-reconciliation.ts',
  'scripts/run-g8-4br7b-emulator-test.ts',
  'scripts/run-g8-4br7b-final-certification.ts',
  'scripts/run-g8-4br7b-offline-replays.ts',
].sort();
const certifiedInputPaths = {
  plan: '.artifacts/private/canonical-migration/g8-4br6cr-build-1-final-identity-plan.json',
  snapshot: '.artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json',
  bundle: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  br6bPlan: '.artifacts/private/canonical-migration/g8-4br6b-revised-disposition-plan-build-1.json',
  overrides: 'data/2026/canonical-identity-overrides.json',
  reviewEvidence: 'docs/status/g8-4br7a-independent-executor-readiness-evidence.json',
} as const;
const expectedInputs = {
  plan: { bytes: 75_926_293, sha256: '654349812a2d2806b75b58e0f57ba09713bb27d22f955c85a100cc70cf7a80ec' },
  snapshot: { bytes: 35_148_779, sha256: '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3' },
  bundle: { bytes: 23_043_218, sha256: '8387a248be9cf08c3d4a380748be5dd6744c0d81b081d770804db1cf1edbf7b4' },
  br6bPlan: { bytes: 81_061_814, sha256: '1f0b71444b2958ab012a03fde3b74f8603df4035f843a2363361d584a7b6752e' },
  overrides: { bytes: 2_137, sha256: 'dae9946a70fb23d935a86f9affdcab97459d07a4024a84e4e0b6c3a5559a5b77' },
  reviewEvidence: { bytes: 2_546, sha256: '359a8a2ccf4bd4acb52e1073f770aa401a3ca77e42f091b84541a082fb90bab9' },
} as const;
const preservedEvidencePaths = {
  offlineReplayV1: '.artifacts/private/canonical-migration/g8-4br7b-offline-replay-v1-receipt.json',
  finalCertificationV1: '.artifacts/private/canonical-migration/g8-4br7b-final-certification-v1-receipt.json',
} as const;
const expectedPreservedEvidence = {
  offlineReplayV1: { bytes: 2_396, sha256: '1e79773034cf7c379469ba5d44debfe5851fd4ed52956b57426eaafa936fb790' },
  finalCertificationV1: { bytes: 10_126, sha256: 'c0d0c17238b92a6ce216f1f522a15c5a48ae15d1d293eb99cb0a29d0e9d49f2f' },
} as const;
const semanticDigests = {
  plan: 'ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23',
  entries: 'db946e81664318e666daf12ecfc1bdbcf600dea6b1cc109296f933a979d8cbfb',
  aggregate: '0ae00a719842cbfa58767dae12b280e35406ed72a3cf2501ad3518c8d7dbfc8c',
  outputs: '0ac958cd0dbcf43cba20ef1b64ab7957fa4255dc76a79efb71306146957f84e2',
  rollback: '80241286ec7cfb0e45844adbf2758883e0c8d8ec8d2b98c26b3db5f66986529d',
  overridePolicy: '1167d651066fe8e0c130366e1981000d538b3d12405607cb8a5dfa1be1c64b3b',
} as const;
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const safety = { credentialsLoaded: false, externalNetworkRequests: 0, productionOperations: 0, selectors: 0, deletes: 0, deployments: 0, activations: 0 } as const;
const expect: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new Error(`BR7B_${code}`); };

function fileIdentity(path: string) {
  const absolute = resolve(path);
  const handle = openSync(absolute, 'r');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const hash = createHash('sha256');
  try {
    for (;;) {
      const bytes = readSync(handle, buffer, 0, buffer.length, null);
      if (bytes === 0) return { bytes: statSync(absolute).size, sha256: hash.digest('hex') };
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(handle);
  }
}

const certifiedInputs = () => Object.fromEntries(Object.entries(certifiedInputPaths).map(([key, path]) => [key, fileIdentity(path)]));
const preservedEvidence = () => Object.fromEntries(Object.entries(preservedEvidencePaths).map(([key, path]) => [key, fileIdentity(path)]));
const writeExclusive = (value: unknown) => writeFileSync(receiptPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const tsx = (step: number, label: string, script: string): Gate => ({ step, label, executable: process.execPath, arguments: [tsxCli, script] });
const npm = (step: number, label: string, script: string): Gate => ({ step, label, executable: process.execPath, arguments: [npmCli, 'run', script] });
const emulator = (step: number, label: string, config: string, test: string, br7bMemoryPolicy = false): Gate => {
  const innerCommand = br7bMemoryPolicy
    ? buildG8Br7bInnerTsxInvocation(resolve(test)).emulatorsExecCommand
    : `"${process.execPath}" "${tsxCli}" "${resolve(test)}"`;
  return {
    step,
    label,
    executable: process.execPath,
    arguments: [firebaseCli, 'emulators:exec', '--project', 'demo-no-project', '--config', config, '--only', 'firestore', innerCommand],
    emulator: true,
    br7bMemoryPolicy,
  };
};
const gates: Gate[] = [
  tsx(1, 'focused-congressional-service', 'src/lib/congressionalServiceRecord.test.ts'),
  tsx(2, 'br7br2ar-inner-tsx-invocation', 'scripts/lib/g8Br7bInnerTsxInvocation.test.ts'),
  tsx(2, 'br7b-unit', 'scripts/lib/g8V2ConflictReconciliation.test.ts'),
  tsx(3, 'br7b-two-isolated-offline-replays', 'scripts/run-g8-4br7b-offline-replays.ts'),
  tsx(4, 'br7a-readiness-review', 'scripts/lib/g8V2ExecutorReadinessReview.test.ts'),
  tsx(5, 'br6cr-final-identity-resolution', 'scripts/lib/g8V2IdentityExceptionResolution.test.ts'),
  tsx(5, 'canonical-migration-override-regression', 'scripts/lib/canonicalMigration.test.ts'),
  tsx(5, 'br6b-fec-equivalence-regression', 'scripts/lib/g8V2FecCandidateEquivalence.test.ts'),
  tsx(5, 'br6a-disposition-regression', 'scripts/lib/g8V2ConflictDisposition.test.ts'),
  tsx(5, 'br5a-analysis-regression', 'scripts/lib/g8V2ConflictAnalysis.test.ts'),
  tsx(5, 'br5c-offline-runner-regression', 'scripts/lib/g8V2ConflictOfflineRunner.test.ts'),
  tsx(5, 'br5a-preflight-regression', 'scripts/lib/g8V2ConflictPreflight.test.ts'),
  emulator(6, 'br7b-emulator-18084', 'scripts/firebase.g8-4br7b-emulator.json', 'scripts/lib/g8V2ConflictReconciliation.emulator.test.ts', true),
  npm(7, 'g8-2a-product-shadow-unit', 'test-g8-2a-product-shadow'),
  npm(7, 'g8-2-local-product-bundle-unit', 'test-local-product-bundle'),
  npm(7, 'g8-3a-v2-activation-unit', 'test-g8-3a-v2-activation'),
  npm(7, 'g8-4br0-state-audit-unit', 'test-g8-4br0-state-audit'),
  npm(7, 'g8-4br1-state-audit-launcher-unit', 'test-g8-4br1-state-audit-launcher'),
  npm(7, 'g8-4br2-1-preflight-receipt-unit', 'test-g8-4br2-1-preflight-receipt'),
  npm(7, 'g8-4br3a-structured-audit-unit', 'test-g8-4br3a-structured-audit'),
  npm(7, 'g8-4br4a-activation-recovery-unit', 'test-g8-4br4a-activation-recovery'),
  emulator(7, 'g8-2a-product-shadow-emulator-8081', 'scripts/firebase.emulator-test.json', 'scripts/lib/g8ProductShadowExecutor.emulator.test.ts'),
  emulator(7, 'g8-3a-v2-activation-emulator-8081', 'scripts/firebase.emulator-test.json', 'scripts/lib/g8V2Activation.emulator.test.ts'),
  emulator(7, 'g8-4br0-state-audit-emulator-18081', 'scripts/firebase.g8-4br0-emulator.json', 'scripts/lib/g8V2StateAudit.emulator.test.ts'),
  emulator(7, 'g8-4br4a-activation-recovery-emulator-18082', 'scripts/firebase.g8-4br4a-emulator.json', 'scripts/lib/g8V2Activation.emulator.test.ts'),
  emulator(7, 'g8-4br5a-conflict-capture-emulator-18083', 'scripts/firebase.g8-4br5a-emulator.json', 'scripts/lib/g8V2ConflictCapture.emulator.test.ts'),
  npm(8, 'lint', 'lint'),
  npm(9, 'build', 'build'),
  { step: 10, label: 'git-diff-check', executable: 'git', arguments: ['diff', '--check'] },
];

function childEnvironment(emulatorChild: boolean, br7bMemoryPolicy = false) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    const upper = key.toUpperCase();
    if (['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIRESTORE_EMULATOR_HOST'].includes(upper)) delete environment[key];
    if (emulatorChild && ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'].includes(upper)) delete environment[key];
    if (br7bMemoryPolicy && upper === 'NODE_OPTIONS') delete environment[key];
  }
  environment.FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true';
  environment.NPM_CONFIG_OFFLINE = 'true';
  if (emulatorChild) {
    environment.NO_PROXY = '127.0.0.1,localhost,::1';
    environment.no_proxy = environment.NO_PROXY;
  } else {
    environment.FIREBASE_SERVICE_ACCOUNT = 'C:\\definitely-missing-g8-4br7b.json';
    environment.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-missing-g8-4br7b.json';
    environment.HTTP_PROXY = 'http://127.0.0.1:9';
    environment.HTTPS_PROXY = 'http://127.0.0.1:9';
    environment.ALL_PROXY = 'http://127.0.0.1:9';
    environment.NO_PROXY = '';
    environment.no_proxy = '';
  }
  return environment;
}

function runGit(arguments_: string[]) {
  const child = spawnSync('git', arguments_, { cwd: process.cwd(), shell: false, windowsHide: true, encoding: 'utf8' });
  expect(child.status === 0, 'FINAL_GIT_PREFLIGHT_FAILED');
  return String(child.stdout).trim();
}

function main() {
  expect(process.argv.length === 2, 'FINAL_RUNNER_ACCEPTS_NO_ARGUMENTS');
  expect(!existsSync(receiptPath), 'FINAL_RECEIPT_COLLISION');
  expect(!existsSync(replayReceiptPath), 'REPLAY_RECEIPT_COLLISION');
  expect(runGit(['branch', '--show-current']) === requiredBranch, 'FINAL_BRANCH_MISMATCH');
  expect(runGit(['rev-parse', 'HEAD']) === requiredHead, 'FINAL_HEAD_MISMATCH');
  expect(runGit(['diff', '--cached', '--name-only']) === '', 'FINAL_INDEX_NOT_EMPTY');
  const status = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: process.cwd(), shell: false, windowsHide: true, encoding: 'buffer' });
  expect(status.status === 0, 'FINAL_STATUS_PREFLIGHT_FAILED');
  const worktreePaths = Buffer.from(status.stdout ?? '').toString('utf8').split('\0').filter(Boolean).map((entry) => entry.slice(3).replaceAll('\\', '/')).sort();
  expect(JSON.stringify(worktreePaths) === JSON.stringify(expectedWorktreePaths), 'FINAL_WIP_INVENTORY_MISMATCH');
  const emulatorEnvironment = childEnvironment(true, true);
  const emulatorKeys = Object.keys(emulatorEnvironment).map((key) => key.toUpperCase());
  expect(!emulatorKeys.includes('FIREBASE_SERVICE_ACCOUNT') && !emulatorKeys.includes('GOOGLE_APPLICATION_CREDENTIALS') && !emulatorKeys.includes('FIRESTORE_EMULATOR_HOST'), 'FINAL_EMULATOR_CREDENTIAL_OR_HOST_LEAK');
  expect(!emulatorKeys.includes('HTTP_PROXY') && !emulatorKeys.includes('HTTPS_PROXY') && !emulatorKeys.includes('ALL_PROXY'), 'FINAL_EMULATOR_PROXY_LEAK');
  expect(!emulatorKeys.includes('NODE_OPTIONS'), 'FINAL_BR7B_EMULATOR_NODE_OPTIONS_LEAK');
  expect(emulatorEnvironment.NO_PROXY === '127.0.0.1,localhost,::1' && emulatorEnvironment.no_proxy === emulatorEnvironment.NO_PROXY, 'FINAL_EMULATOR_LOOPBACK_POLICY_MISMATCH');
  const before = certifiedInputs();
  expect(JSON.stringify(before) === JSON.stringify(expectedInputs), 'FINAL_CERTIFIED_INPUT_MISMATCH_BEFORE');
  const preservedBefore = preservedEvidence();
  expect(JSON.stringify(preservedBefore) === JSON.stringify(expectedPreservedEvidence), 'FINAL_PRESERVED_EVIDENCE_MISMATCH_BEFORE');
  const results: Json[] = [];
  for (const gate of gates) {
    const child = spawnSync(gate.executable, gate.arguments, {
      cwd: process.cwd(),
      env: childEnvironment(gate.emulator === true, gate.br7bMemoryPolicy === true),
      shell: false,
      windowsHide: true,
      encoding: null,
      timeout: gate.emulator ? 15 * 60 * 1000 : 10 * 60 * 1000,
      maxBuffer: 128 * 1024 * 1024,
    });
    const stdout = Buffer.isBuffer(child.stdout) ? child.stdout : Buffer.from(child.stdout ?? '');
    const stderr = Buffer.isBuffer(child.stderr) ? child.stderr : Buffer.from(child.stderr ?? '');
    const result: Json = {
      step: gate.step,
      label: gate.label,
      emulator: gate.emulator === true,
      br7bMemoryPolicy: gate.br7bMemoryPolicy === true,
      exitStatus: child.status,
      signal: child.signal,
      errorCode: child.error && 'code' in child.error ? String(child.error.code) : null,
      stdoutBytes: stdout.length,
      stdoutSha256: sha256(stdout),
      stderrBytes: stderr.length,
      stderrSha256: sha256(stderr),
      emulatorTerminated: gate.emulator === true ? child.status === 0 && child.signal === null && child.error === undefined : null,
    };
    results.push(result);
    const afterGate = certifiedInputs();
    if (JSON.stringify(afterGate) !== JSON.stringify(before)) {
      writeExclusive({ schemaVersion: 2, contract: 'g8-4br7b-final-certification-receipt/v2', status: 'failed', failedStep: gate.step, failedGate: gate.label, failureClass: 'BR7B_FINAL_CERTIFIED_INPUT_DRIFT', results, inputs: { before, afterGate }, preservedEvidence: { before: preservedBefore }, semanticDigests, safety, safeNextAction: 'stop without retry; preserve sanitized local evidence' });
      process.stdout.write(`${JSON.stringify({ status: 'failed', failedStep: gate.step, failedGate: gate.label, failureClass: 'BR7B_FINAL_CERTIFIED_INPUT_DRIFT', safety })}\n`);
      process.exitCode = 1;
      return;
    }
    const preservedAfterGate = preservedEvidence();
    if (JSON.stringify(preservedAfterGate) !== JSON.stringify(preservedBefore)) {
      writeExclusive({ schemaVersion: 2, contract: 'g8-4br7b-final-certification-receipt/v2', status: 'failed', failedStep: gate.step, failedGate: gate.label, failureClass: 'BR7B_FINAL_PRESERVED_EVIDENCE_DRIFT', results, inputs: { before }, preservedEvidence: { before: preservedBefore, afterGate: preservedAfterGate }, semanticDigests, safety, safeNextAction: 'stop without retry; preserve sanitized local evidence' });
      process.stdout.write(`${JSON.stringify({ status: 'failed', failedStep: gate.step, failedGate: gate.label, failureClass: 'BR7B_FINAL_PRESERVED_EVIDENCE_DRIFT', safety })}\n`);
      process.exitCode = 1;
      return;
    }
    if (child.status !== 0 || (gate.emulator === true && result.emulatorTerminated !== true)) {
      writeExclusive({ schemaVersion: 2, contract: 'g8-4br7b-final-certification-receipt/v2', status: 'failed', failedStep: gate.step, failedGate: gate.label, results, inputs: { before }, preservedEvidence: { before: preservedBefore, afterGate: preservedAfterGate }, semanticDigests, safety, safeNextAction: 'stop without retry; preserve sanitized local evidence' });
      process.stdout.write(`${JSON.stringify({ status: 'failed', failedStep: gate.step, failedGate: gate.label, result, safety })}\n`);
      process.exitCode = 1;
      return;
    }
  }
  const after = certifiedInputs();
  expect(JSON.stringify(after) === JSON.stringify(before), 'FINAL_CERTIFIED_INPUT_DRIFT');
  const preservedAfter = preservedEvidence();
  expect(JSON.stringify(preservedAfter) === JSON.stringify(preservedBefore), 'FINAL_PRESERVED_EVIDENCE_DRIFT');
  const finalStatus = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: process.cwd(), shell: false, windowsHide: true, encoding: 'buffer' });
  expect(finalStatus.status === 0, 'FINAL_STATUS_POSTFLIGHT_FAILED');
  const finalWorktreePaths = Buffer.from(finalStatus.stdout ?? '').toString('utf8').split('\0').filter(Boolean).map((entry) => entry.slice(3).replaceAll('\\', '/')).sort();
  expect(JSON.stringify(finalWorktreePaths) === JSON.stringify(worktreePaths), 'FINAL_WIP_INVENTORY_DRIFT');
  expect(existsSync(replayReceiptPath), 'FINAL_REPLAY_RECEIPT_MISSING');
  const replayReceipt = JSON.parse(readFileSync(replayReceiptPath, 'utf8')) as Json;
  expect(replayReceipt.status === 'completed', 'FINAL_REPLAY_NOT_COMPLETED');
  const receipt = {
    schemaVersion: 2,
    contract: 'g8-4br7b-final-certification-receipt/v2',
    status: 'completed',
    branch: requiredBranch,
    head: requiredHead,
    indexEmpty: true,
    worktreePaths,
    finalWorktreePaths,
    contracts: {
      plan: 'g8-4br7b-local-conflict-reconciliation-plan/v1',
      manifest: 'g8-4br7b-local-conflict-reconciliation-manifest/v1',
      result: 'g8-4br7b-local-conflict-reconciliation-result/v1',
    },
    counts: { paths: 858, races: 429, metrics: 429, replaceWithCertified: 4, deterministicMerges: 854, historicallyMissingDocumentsCreated: 0 },
    semanticDigests,
    replay: { receipt: fileIdentity(replayReceiptPath), byteIdentical: true },
    results,
    inputs: { before, after, byteIdentical: true },
    preservedEvidence: { before: preservedBefore, after: preservedAfter, byteIdentical: true },
    emulatorPolicy: { projectId: 'demo-no-project', credentialVariables: 0, externalNetworkRequests: 0, proxyBypass: '127.0.0.1,localhost,::1', allTerminated: true },
    safety,
  };
  writeExclusive(receipt);
  process.stdout.write(`${JSON.stringify({ status: receipt.status, gates: results.map((result) => ({ step: result.step, label: result.label, exitStatus: result.exitStatus })), replay: receipt.replay, inputs: receipt.inputs, emulatorPolicy: receipt.emulatorPolicy, safety: receipt.safety })}\n`);
}

try {
  main();
} catch (error) {
  const code = error instanceof Error ? error.message.match(/\bBR7B_[A-Z0-9_]+\b/)?.[0] ?? 'BR7B_FINAL_CERTIFICATION_FAILED' : 'BR7B_FINAL_CERTIFICATION_FAILED';
  const failure = { schemaVersion: 2, contract: 'g8-4br7b-final-certification-receipt/v2', status: 'failed', errorCode: code, semanticDigests, safety, safeNextAction: 'stop without retry; preserve sanitized local evidence' };
  if (!existsSync(receiptPath)) writeExclusive(failure);
  process.stdout.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}
