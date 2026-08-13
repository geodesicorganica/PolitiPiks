import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const privateRoot = resolve(root, '.artifacts/private/canonical-migration');
const cli = resolve(root, 'node_modules/tsx/dist/cli.mjs');
const reporter = resolve(root, 'scripts/report-g8-4br7a-executor-readiness.ts');
const outputs = [
  resolve(privateRoot, 'g8-4br7a-independent-pass-1-receipt.json'),
  resolve(privateRoot, 'g8-4br7a-independent-pass-2-receipt.json'),
  resolve(privateRoot, 'g8-4br7a-isolated-replay-receipt.json'),
] as const;
const finalReceipt = resolve(privateRoot, 'g8-4br7a-final-certification-receipt.json');
const safety = { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, productionOperations: 0, dispositionsExecuted: 0 } as const;
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
function expect(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }

expect(process.argv.length === 2, 'BR7A_RUNNER_ACCEPTS_NO_ARGUMENTS');
expect(existsSync(cli) && existsSync(reporter), 'BR7A_RUNNER_INPUT_MISSING');
for (const path of [...outputs, finalReceipt]) expect(!existsSync(path), 'BR7A_FINAL_OUTPUT_COLLISION');
mkdirSync(privateRoot, { recursive: true });

const environment = { ...process.env };
for (const key of ['FIREBASE_SERVICE_ACCOUNT','GOOGLE_APPLICATION_CREDENTIALS','FIRESTORE_EMULATOR_HOST','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']) delete environment[key];
environment.NO_PROXY = '127.0.0.1,localhost,::1'; environment.no_proxy = environment.NO_PROXY; environment.FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true';

const runs: Array<{ label: string; exitStatus: number | null; stdoutBytes: number; stdoutSha256: string; stderrBytes: number; stderrSha256: string }> = [];
for (let index = 0; index < outputs.length; index += 1) {
  const args = [cli, reporter, ...(index === 2 ? ['--verify-replay', outputs[0]] : [])];
  const child = spawnSync(process.execPath, args, { cwd: root, env: environment, encoding: null, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const stdout = Buffer.isBuffer(child.stdout) ? child.stdout : Buffer.from(child.stdout ?? '');
  const stderr = Buffer.isBuffer(child.stderr) ? child.stderr : Buffer.from(child.stderr ?? '');
  runs.push({ label: index === 0 ? 'independent-pass-1' : index === 1 ? 'independent-pass-2' : 'isolated-replay', exitStatus: child.status, stdoutBytes: stdout.length, stdoutSha256: sha256(stdout), stderrBytes: stderr.length, stderrSha256: sha256(stderr) });
  if (child.status !== 0 || stderr.length !== 0) {
    writeFileSync(finalReceipt, `${JSON.stringify({ schemaVersion: 1, contract: 'g8-4br7a-final-certification-receipt/v1', status: 'failed', failedStep: runs.at(-1)?.label, runs, safety, safeNextAction: 'stop without retry; inspect only sanitized exit and digest evidence' }, null, 2)}\n`, { flag: 'wx' });
    process.exitCode = 1; break;
  }
  writeFileSync(outputs[index], stdout, { flag: 'wx' });
}

if (process.exitCode !== 1) {
  const receipts = outputs.map((path) => readFileSync(path));
  expect(receipts[0].equals(receipts[1]) && receipts[1].equals(receipts[2]), 'BR7A_RECEIPT_BYTES_DRIFT');
  const parsed = JSON.parse(receipts[0].toString('utf8')) as { verdict?: unknown; safety?: unknown };
  expect(parsed.verdict === 'PASS' && JSON.stringify(parsed.safety) === JSON.stringify(safety), 'BR7A_RECEIPT_VERDICT_OR_SAFETY_MISMATCH');
  const receipt = { schemaVersion: 1, contract: 'g8-4br7a-final-certification-receipt/v1', status: 'completed', sequence: runs.map((run) => run.label), runs, receipts: { byteIdentical: true, bytes: receipts[0].length, sha256: sha256(receipts[0]) }, safety };
  writeFileSync(finalReceipt, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
