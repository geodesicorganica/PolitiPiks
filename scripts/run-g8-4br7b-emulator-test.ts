import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { buildG8Br7bInnerTsxInvocation, G8_BR7B_INNER_TSX_HEAP_MB } from './lib/g8Br7bInnerTsxInvocation.js';

const require = createRequire(import.meta.url);
const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
const projectId = 'demo-no-project';
const config = resolve('scripts/firebase.g8-4br7b-emulator.json');
const test = resolve('scripts/lib/g8V2ConflictReconciliation.emulator.test.ts');
const certifiedSemanticDigests = {
  overridePolicy: '1167d651066fe8e0c130366e1981000d538b3d12405607cb8a5dfa1be1c64b3b',
  entries: 'db946e81664318e666daf12ecfc1bdbcf600dea6b1cc109296f933a979d8cbfb',
  aggregate: '0ae00a719842cbfa58767dae12b280e35406ed72a3cf2501ad3518c8d7dbfc8c',
  outputs: '0ac958cd0dbcf43cba20ef1b64ab7957fa4255dc76a79efb71306146957f84e2',
  rollback: '80241286ec7cfb0e45844adbf2758883e0c8d8ec8d2b98c26b3db5f66986529d',
  plan: 'ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23',
} as const;
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const expect: (condition: unknown, code: string) => asserts condition = (condition, code) => {
  if (!condition) throw new Error(`BR7B_${code}`);
};

function emulatorEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    const upper = key.toUpperCase();
    if (['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIRESTORE_EMULATOR_HOST', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'NODE_OPTIONS'].includes(upper)) {
      delete environment[key];
    }
  }
  environment.FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true';
  environment.NO_PROXY = '127.0.0.1,localhost,::1';
  environment.no_proxy = '127.0.0.1,localhost,::1';
  return environment;
}

try {
  expect(process.argv.length === 2, 'EMULATOR_RUNNER_ACCEPTS_NO_ARGUMENTS');
  const environment = emulatorEnvironment();
  const keys = Object.keys(environment).map((key) => key.toUpperCase());
  expect(!keys.includes('FIREBASE_SERVICE_ACCOUNT') && !keys.includes('GOOGLE_APPLICATION_CREDENTIALS') && !keys.includes('FIRESTORE_EMULATOR_HOST'), 'EMULATOR_CREDENTIAL_OR_HOST_LEAK');
  expect(!keys.includes('HTTP_PROXY') && !keys.includes('HTTPS_PROXY') && !keys.includes('ALL_PROXY'), 'EMULATOR_PROXY_LEAK');
  expect(!keys.includes('NODE_OPTIONS'), 'EMULATOR_NODE_OPTIONS_LEAK');
  expect(environment.NO_PROXY === '127.0.0.1,localhost,::1' && environment.no_proxy === environment.NO_PROXY, 'EMULATOR_LOOPBACK_POLICY_MISMATCH');
  const innerTest = buildG8Br7bInnerTsxInvocation(test);
  const child = spawnSync(process.execPath, [firebaseCli, 'emulators:exec', '--project', projectId, '--config', config, '--only', 'firestore', innerTest.emulatorsExecCommand], {
    cwd: process.cwd(),
    env: environment,
    shell: false,
    windowsHide: true,
    encoding: null,
    timeout: 15 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = Buffer.isBuffer(child.stdout) ? child.stdout : Buffer.from(child.stdout ?? '');
  const stderr = Buffer.isBuffer(child.stderr) ? child.stderr : Buffer.from(child.stderr ?? '');
  const diagnosticText = `${stdout.toString('utf8')}\n${stderr.toString('utf8')}`;
  const diagnosticCodes = [...new Set(diagnosticText.match(/\b(?:BR7B_[A-Z0-9_]+|ERR_[A-Z0-9_]+)\b/g) ?? [])].slice(0, 8);
  const sourceLocations = [...new Set(diagnosticText.match(/g8V2ConflictReconciliation(?:\.emulator)?\.test\.ts:\d+:\d+/g) ?? [])].slice(0, 8);
  const safePhases = diagnosticText.match(/BR7B_SAFE_PHASE:[a-z-]+/g) ?? [];
  const summaries = diagnosticText.split(/\r?\n/)
    .filter((line) => /(?:error|failed|unable|could not|port taken|exited unsuccessfully|java)/i.test(line))
    .map((line) => line
      .replace(/https?:\/\/\S+/gi, '<url>')
      .replace(/"[^"]*"/g, '"<quoted>"')
      .replace(/[A-Za-z]:\\[^\s,;]+/g, '<local-path>')
      .replace(/\b(?:credential|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, '<sensitive-value>')
      .slice(0, 240))
    .filter((line, index, lines) => line.length > 0 && lines.indexOf(line) === index)
    .slice(0, 8);
  const exactLifecycleReported = diagnosticText.includes('G8.4BR7B emulator lifecycle passed: 858 exact paths, zero scans/deletes/selectors, bounded guarded transactions, post-plan heap <= 256 MiB, unchanged semantic digests, closed clients');
  const completed = child.status === 0 && child.signal === null && child.error === undefined && exactLifecycleReported;
  const receipt = {
    schemaVersion: 1,
    contract: 'g8-4br7b-emulator-test-receipt/v1',
    status: completed ? 'completed' : 'failed',
    projectId,
    config: 'scripts/firebase.g8-4br7b-emulator.json',
    exitStatus: child.status,
    signal: child.signal,
    errorCode: child.error && 'code' in child.error ? String(child.error.code) : null,
    stdout: { bytes: stdout.length, sha256: sha256(stdout) },
    stderr: { bytes: stderr.length, sha256: sha256(stderr) },
    diagnostics: { codes: diagnosticCodes, sourceLocations, summaries, lastSafePhase: safePhases.at(-1) ?? null },
    certifiedCounts: exactLifecycleReported ? { paths: 858, races: 429, metrics: 429, replaceWithCertified: 4, deterministicMerges: 854 } : null,
    semanticDigests: exactLifecycleReported ? certifiedSemanticDigests : null,
    emulatorTerminated: completed,
    environment: { credentialVariables: 0, inheritedEmulatorHosts: 0, proxyVariables: 0, inheritedNodeOptions: 0, noProxy: '127.0.0.1,localhost,::1', updateChecks: false, testChildHeapMb: G8_BR7B_INNER_TSX_HEAP_MB, explicitGc: true },
    safety: { productionOperations: 0, externalNetworkRequests: 0, selectors: 0, deletes: 0 },
  };
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (!completed) process.exitCode = 1;
} catch (error) {
  const code = error instanceof Error ? error.message.match(/\bBR7B_[A-Z0-9_]+\b/)?.[0] ?? 'BR7B_EMULATOR_RUNNER_FAILED' : 'BR7B_EMULATOR_RUNNER_FAILED';
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, contract: 'g8-4br7b-emulator-test-receipt/v1', status: 'failed', errorCode: code, safety: { productionOperations: 0, externalNetworkRequests: 0 } })}\n`);
  process.exitCode = 1;
}
