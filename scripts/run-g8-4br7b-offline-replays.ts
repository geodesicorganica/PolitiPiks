import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertG8V2ConflictReconciliationManifest,
  assertG8V2ConflictReconciliationResult,
  verifyG8V2ConflictReconciliationReplay,
} from './lib/g8V2ConflictReconciliation.js';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const privateRoot = resolve('.artifacts/private/canonical-migration');
const reporter = resolve('scripts/report-g8-4br7b-reconciliation.ts');
const resultPaths = [resolve(privateRoot, 'g8-4br7b-offline-replay-v2-run-1-result.json'), resolve(privateRoot, 'g8-4br7b-offline-replay-v2-run-2-result.json')] as const;
const manifestPaths = [resolve(privateRoot, 'g8-4br7b-offline-replay-v2-run-1-manifest.json'), resolve(privateRoot, 'g8-4br7b-offline-replay-v2-run-2-manifest.json')] as const;
const finalReceiptPath = resolve(privateRoot, 'g8-4br7b-offline-replay-v2-receipt.json');
const preservedV1ReceiptPath = resolve(privateRoot, 'g8-4br7b-offline-replay-v1-receipt.json');
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const identity = (path: string) => { const value = readFileSync(path); return { bytes: value.length, sha256: sha256(value) }; };
const expectedPreservedV1Receipt = { bytes: 2_396, sha256: '1e79773034cf7c379469ba5d44debfe5851fd4ed52956b57426eaafa936fb790' } as const;
const expect: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new Error(`BR7B_${code}`); };
const safety = { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, productionOperations: 0, writes: 0, scans: 0, deletes: 0, selectorOperations: 0 } as const;

function offlineEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (['FIREBASE_SERVICE_ACCOUNT','GOOGLE_APPLICATION_CREDENTIALS','FIRESTORE_EMULATOR_HOST'].includes(key.toUpperCase())) delete environment[key];
  environment.FIREBASE_SERVICE_ACCOUNT = 'C:\\definitely-missing-g8-4br7b.json';
  environment.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-missing-g8-4br7b.json';
  environment.HTTP_PROXY = 'http://127.0.0.1:9';
  environment.HTTPS_PROXY = 'http://127.0.0.1:9';
  environment.ALL_PROXY = 'http://127.0.0.1:9';
  environment.NO_PROXY = '';
  environment.no_proxy = '';
  return environment;
}

try {
  expect(process.argv.length === 2, 'OFFLINE_RUNNER_ACCEPTS_NO_ARGUMENTS');
  for (const path of [...resultPaths, ...manifestPaths, finalReceiptPath]) expect(!existsSync(path), 'OFFLINE_RUNNER_OUTPUT_COLLISION');
  const preservedV1Before = identity(preservedV1ReceiptPath);
  expect(JSON.stringify(preservedV1Before) === JSON.stringify(expectedPreservedV1Receipt), 'OFFLINE_RUNNER_PRESERVED_V1_RECEIPT_MISMATCH_BEFORE');
  const runs: Array<Record<string, unknown>> = [];
  const stdoutValues: Buffer[] = [];
  for (let index = 0; index < 2; index += 1) {
    const arguments_ = [tsxCli, reporter, '--report-out', resultPaths[index], '--manifest-out', manifestPaths[index], ...(index === 1 ? ['--verify-replay', resultPaths[0]] : [])];
    const child = spawnSync(process.execPath, arguments_, { cwd: process.cwd(), env: offlineEnvironment(), shell: false, windowsHide: true, encoding: null, timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
    const stdout = Buffer.isBuffer(child.stdout) ? child.stdout : Buffer.from(child.stdout ?? '');
    const stderr = Buffer.isBuffer(child.stderr) ? child.stderr : Buffer.from(child.stderr ?? '');
    runs.push({ label: index === 0 ? 'isolated-dry-run-1' : 'isolated-dry-run-2-verify-replay', exitStatus: child.status, signal: child.signal, stdoutBytes: stdout.length, stdoutSha256: sha256(stdout), stderrBytes: stderr.length, stderrSha256: sha256(stderr) });
    if (child.status !== 0 || stderr.length !== 0) {
      writeFileSync(finalReceiptPath, `${JSON.stringify({ schemaVersion: 2, contract: 'g8-4br7b-offline-replay-receipt/v2', status: 'failed', failedStep: runs.at(-1)?.label, runs, preservedV1: { before: preservedV1Before }, safety, safeNextAction: 'stop without retry; inspect sanitized hashes only' }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      process.exitCode = 1;
      break;
    }
    stdoutValues.push(stdout);
  }
  if (process.exitCode !== 1) {
    const first = JSON.parse(readFileSync(resultPaths[0], 'utf8')) as unknown;
    const second = JSON.parse(readFileSync(resultPaths[1], 'utf8')) as unknown;
    const firstManifest = JSON.parse(readFileSync(manifestPaths[0], 'utf8')) as unknown;
    const secondManifest = JSON.parse(readFileSync(manifestPaths[1], 'utf8')) as unknown;
    assertG8V2ConflictReconciliationResult(first);
    assertG8V2ConflictReconciliationResult(second);
    assertG8V2ConflictReconciliationManifest(firstManifest);
    assertG8V2ConflictReconciliationManifest(secondManifest);
    verifyG8V2ConflictReconciliationReplay(first, second);
    expect(stdoutValues[0].equals(stdoutValues[1]) && readFileSync(resultPaths[0]).equals(readFileSync(resultPaths[1])) && readFileSync(manifestPaths[0]).equals(readFileSync(manifestPaths[1])), 'OFFLINE_REPLAY_BYTES_DRIFT');
    const preservedV1After = identity(preservedV1ReceiptPath);
    expect(JSON.stringify(preservedV1After) === JSON.stringify(preservedV1Before), 'OFFLINE_RUNNER_PRESERVED_V1_RECEIPT_DRIFT');
    const receipt = {
      schemaVersion: 2,
      contract: 'g8-4br7b-offline-replay-receipt/v2',
      status: 'completed',
      runs,
      results: { byteIdentical: true, ...identity(resultPaths[0]), receiptDigest: first.receiptDigest },
      manifests: { byteIdentical: true, ...identity(manifestPaths[0]), manifestDigest: first.manifest.manifestDigest },
      counts: first.manifest.counts,
      classification: first.classification,
      semanticDigests: first.manifest.digests,
      preservedV1: { before: preservedV1Before, after: preservedV1After, byteIdentical: true },
      safety,
    };
    writeFileSync(finalReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  }
} catch (error) {
  const code = error instanceof Error ? error.message.match(/\bBR7B_[A-Z0-9_]+\b/)?.[0] ?? 'BR7B_OFFLINE_RUNNER_FAILED' : 'BR7B_OFFLINE_RUNNER_FAILED';
  const failure = { schemaVersion: 2, contract: 'g8-4br7b-offline-replay-receipt/v2', status: 'failed', errorCode: code, safety, safeNextAction: 'stop without retry; preserve local evidence' };
  if (!existsSync(finalReceiptPath)) writeFileSync(finalReceiptPath, `${JSON.stringify(failure, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}
