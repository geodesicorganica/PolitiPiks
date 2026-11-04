import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  assertG8V2ConflictReconciliationResult,
  buildCertifiedG8V2ConflictReconciliationPlan,
  createOfflineG8V2ConflictReconciliationStore,
  executeG8V2ConflictReconciliation,
  verifyG8V2ConflictReconciliationReplay,
} from './lib/g8V2ConflictReconciliation.js';

type Options = { reportOut?: string; manifestOut?: string; verifyReplay?: string };
const privateRoot = resolve('.artifacts/private/canonical-migration');
const expect: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new Error(`BR7B_${code}`); };

function privateJsonPath(value: string, flag: string) {
  const path = resolve(value);
  const rel = relative(privateRoot, path);
  expect(rel.length > 0 && !rel.startsWith('..') && !resolve(rel).startsWith('..') && path.toLowerCase().endsWith('.json'), `${flag}_PATH_OUTSIDE_PRIVATE_ROOT`);
  return path;
}

function parseArguments(args: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[++index];
    expect(Boolean(value), 'OFFLINE_ARGUMENT_VALUE_MISSING');
    if (flag === '--report-out') options.reportOut = privateJsonPath(value, 'REPORT_OUT');
    else if (flag === '--manifest-out') options.manifestOut = privateJsonPath(value, 'MANIFEST_OUT');
    else if (flag === '--verify-replay') options.verifyReplay = privateJsonPath(value, 'VERIFY_REPLAY');
    else throw new Error('BR7B_OFFLINE_ARGUMENT_UNSUPPORTED');
  }
  for (const output of [options.reportOut, options.manifestOut]) expect(!output || !existsSync(output), 'OFFLINE_OUTPUT_COLLISION');
  expect(!options.verifyReplay || existsSync(options.verifyReplay), 'VERIFY_REPLAY_INPUT_MISSING');
  return options;
}

const failureCode = (error: unknown) => error instanceof Error ? error.message.match(/\bBR7B_[A-Z0-9_]+\b/)?.[0] ?? 'BR7B_OFFLINE_REPORT_FAILED' : 'BR7B_OFFLINE_REPORT_FAILED';

try {
  const options = parseArguments(process.argv.slice(2));
  const plan = buildCertifiedG8V2ConflictReconciliationPlan();
  let persistedManifest: unknown = null;
  const result = await executeG8V2ConflictReconciliation({
    mode: 'dry-run',
    plan,
    store: createOfflineG8V2ConflictReconciliationStore(plan, 'rollback'),
    persistManifest: (manifest) => { persistedManifest = structuredClone(manifest); },
  });
  assertG8V2ConflictReconciliationResult(result);
  expect(result.status === 'completed', 'OFFLINE_DRY_RUN_FAILED');
  if (options.verifyReplay) verifyG8V2ConflictReconciliationReplay(JSON.parse(readFileSync(options.verifyReplay, 'utf8')) as unknown, result);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.reportOut) writeFileSync(options.reportOut, serialized, { encoding: 'utf8', flag: 'wx' });
  if (options.manifestOut) writeFileSync(options.manifestOut, `${JSON.stringify(persistedManifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(serialized);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, contract: 'g8-4br7b-offline-sanitized-failure/v1', status: 'failed', errorCode: failureCode(error), safety: { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, productionOperations: 0 } })}\n`);
  process.exitCode = 1;
}
