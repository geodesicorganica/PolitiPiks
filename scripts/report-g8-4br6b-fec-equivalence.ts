import { closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildG8V2RevisedDispositionAggregateReport, loadG8V2RevisedDispositionPlan, type G8V2RevisedDispositionPlan } from './lib/g8V2FecCandidateEquivalence.js';
import { G8_V2_DISPOSITION_DEFAULT_PATHS, type G8V2DispositionPaths } from './lib/g8V2ConflictDisposition.js';
import { buildG8V2ConflictCertifiedPlan, isG8V2ConflictPrivateRootIgnored, resolveG8V2ConflictPrivateJsonPath } from './lib/g8V2ConflictCli.js';

const valueFlags = new Set(['--snapshot-in','--plan-out','--bundle-in','--historical-bundle','--manifest','--publication-snapshot','--finance-snapshot','--congress-snapshot','--historical-cvap-snapshot','--measure-registry']);
const values = new Map<string, string>();
let verifyReplay = false;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if (flag === '--verify-replay') { if (verifyReplay) throw new Error('duplicate --verify-replay'); verifyReplay = true; continue; }
  if (!valueFlags.has(flag)) throw new Error(`unsupported BR6B equivalence argument: ${flag}`);
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
  if (values.has(flag)) throw new Error(`duplicate ${flag}`);
  values.set(flag, value); index += 1;
}

const privateInput = (flag: string, fallback: string) => resolveG8V2ConflictPrivateJsonPath(values.get(flag) ?? fallback, flag);
const exactPath = (flag: string, fallback: string) => {
  const requested = resolve(values.get(flag) ?? fallback);
  if (requested !== resolve(fallback)) throw new Error(`${flag} must use the certified local path`);
  return requested;
};
const outputValue = values.get('--plan-out');
if (!outputValue) throw new Error('--plan-out is required');
const planOutput = resolveG8V2ConflictPrivateJsonPath(outputValue, '--plan-out');
if (!isG8V2ConflictPrivateRootIgnored()) throw new Error('private canonical-migration directory is not ignored');
if (existsSync(planOutput)) throw new Error('BR6B plan output already exists; refusing overwrite');

function filesByteIdentical(leftPath: string, rightPath: string) {
  if (statSync(leftPath).size !== statSync(rightPath).size) return false;
  const left = openSync(leftPath, 'r'); const right = openSync(rightPath, 'r');
  const leftBuffer = Buffer.allocUnsafe(64 * 1024); const rightBuffer = Buffer.allocUnsafe(64 * 1024);
  try {
    for (;;) {
      const leftBytes = readSync(left, leftBuffer, 0, leftBuffer.length, null);
      const rightBytes = readSync(right, rightBuffer, 0, rightBuffer.length, null);
      if (leftBytes !== rightBytes || !leftBuffer.subarray(0, leftBytes).equals(rightBuffer.subarray(0, rightBytes))) return false;
      if (leftBytes === 0) return true;
    }
  } finally { closeSync(left); closeSync(right); }
}

const paths: G8V2DispositionPaths = {
  snapshot: privateInput('--snapshot-in', G8_V2_DISPOSITION_DEFAULT_PATHS.snapshot),
  currentBundle: privateInput('--bundle-in', G8_V2_DISPOSITION_DEFAULT_PATHS.currentBundle),
  historicalBundle: privateInput('--historical-bundle', G8_V2_DISPOSITION_DEFAULT_PATHS.historicalBundle),
  manifest: exactPath('--manifest', G8_V2_DISPOSITION_DEFAULT_PATHS.manifest),
  publication: privateInput('--publication-snapshot', G8_V2_DISPOSITION_DEFAULT_PATHS.publication),
  finance: privateInput('--finance-snapshot', G8_V2_DISPOSITION_DEFAULT_PATHS.finance),
  congress: privateInput('--congress-snapshot', G8_V2_DISPOSITION_DEFAULT_PATHS.congress),
  historicalCvap: privateInput('--historical-cvap-snapshot', G8_V2_DISPOSITION_DEFAULT_PATHS.historicalCvap),
  measures: exactPath('--measure-registry', G8_V2_DISPOSITION_DEFAULT_PATHS.measures),
};
const { plan: certifiedPlan } = buildG8V2ConflictCertifiedPlan(paths.currentBundle, paths.manifest);
let outputPlan: G8V2RevisedDispositionPlan | null = loadG8V2RevisedDispositionPlan(paths, certifiedPlan);
const reportText = `${JSON.stringify(buildG8V2RevisedDispositionAggregateReport(outputPlan), null, 2)}\n`;
writeFileSync(planOutput, `${JSON.stringify(outputPlan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
outputPlan = null;
if (verifyReplay) {
  const replayOutput = planOutput.replace(/\.json$/i, '.verify-replay.json');
  if (replayOutput === planOutput || existsSync(replayOutput)) throw new Error('BR6B verify-replay output collision');
  const childArguments = args.filter((argument) => argument !== '--verify-replay');
  const outputIndex = childArguments.indexOf('--plan-out');
  if (outputIndex < 0) throw new Error('BR6B verify-replay output argument missing');
  childArguments[outputIndex + 1] = replayOutput;
  const require = createRequire(import.meta.url);
  const child = spawnSync(process.execPath, [require.resolve('tsx/cli'), fileURLToPath(import.meta.url), ...childArguments], {
    cwd: process.cwd(), env: { ...process.env }, shell: false, windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024,
  });
  if (child.status !== 0 || Buffer.byteLength(child.stderr ?? '') !== 0 || !existsSync(replayOutput)) throw new Error('BR6B verify-replay child failed');
  if (!filesByteIdentical(planOutput, replayOutput)) throw new Error('BR6B_NONDETERMINISTIC_REPLAY');
}
process.stdout.write(reportText);
