import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { WAVE_D_STATES, buildWaveDReport, type WaveDState } from './lib/waveDSourceResolution.js';

const privateRoot = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
const evidenceRoot = resolve(process.cwd(), 'data', '2026', 'wave-d-reviewed');
type Options = { states: WaveDState[]; input: string; snapshotIn?: string; snapshotOut?: string; reportOut?: string; replay: boolean };

function privatePath(value: string, flag: string) {
  const path = resolve(process.cwd(), value); const child = relative(privateRoot, path);
  if (!child || child.startsWith('..') || !path.endsWith('.json')) throw new Error(`${flag} must be a JSON file beneath .artifacts/private/canonical-migration`);
  return path;
}
function parseArgs(args: string[]): Options {
  const options: Options = { states: [...WAVE_D_STATES], input: evidenceRoot, replay: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--all-wave-d' || flag === '--dry-run') continue;
    if (flag === '--verify-replay') { options.replay = true; continue; }
    const value = args[++index]; if (!value) throw new Error(`missing value for ${flag}`);
    if (flag === '--state') { const state = value.toUpperCase() as WaveDState; if (!WAVE_D_STATES.includes(state)) throw new Error(`unknown Wave D state: ${value}`); options.states = [state]; continue; }
    if (flag === '--input') { options.input = resolve(process.cwd(), value); continue; }
    if (flag === '--snapshot-in') { options.snapshotIn = privatePath(value, flag); continue; }
    if (flag === '--snapshot-out') { options.snapshotOut = privatePath(value, flag); continue; }
    if (flag === '--report-out') { options.reportOut = privatePath(value, flag); continue; }
    throw new Error(`unsupported argument: ${flag}`);
  }
  if (options.snapshotIn && options.snapshotOut) throw new Error('--snapshot-in and --snapshot-out are mutually exclusive');
  for (const output of [options.snapshotOut, options.reportOut]) if (output && existsSync(output)) throw new Error(`output exists; refusing to overwrite: ${output}`);
  return options;
}
function readEvidence(root: string) { return Object.fromEntries(WAVE_D_STATES.map((state) => [state, JSON.parse(readFileSync(resolve(root, `${state}.json`), 'utf8'))])) as Record<WaveDState, unknown>; }
function readSnapshot(path: string) { const snapshot = JSON.parse(readFileSync(path, 'utf8')) as { schemaVersion?: number; evidence?: Record<WaveDState, unknown> }; if (snapshot.schemaVersion !== 1 || !snapshot.evidence) throw new Error('invalid Wave D offline snapshot'); return snapshot.evidence; }
function writeNew(path: string, value: unknown) { mkdirSync(privateRoot, { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); }

const options = parseArgs(process.argv.slice(2));
const evidence = options.snapshotIn ? readSnapshot(options.snapshotIn) : readEvidence(options.input);
if (options.snapshotOut) writeNew(options.snapshotOut, { schemaVersion: 1, capturedAt: new Date().toISOString(), evidence });
const audit = buildWaveDReport(evidence);
if (options.replay) { const replay = buildWaveDReport(evidence); if (replay.inputDigest !== audit.inputDigest || replay.evidenceDigest !== audit.evidenceDigest || replay.registryDigest !== audit.registryDigest || replay.planDigest !== audit.planDigest) throw new Error('non-deterministic Wave D offline replay'); }
const states = Object.fromEntries(options.states.map((state) => [state, audit.states[state]]));
const report = { operation: audit.operation, dryRun: true, firebaseInitialized: false, state: options.states.length === 1 ? options.states[0] : 'all-wave-d', inputDigest: audit.inputDigest, evidenceDigest: audit.evidenceDigest, registryDigest: audit.registryDigest, planDigest: audit.planDigest, counts: audit.counts, registryChanges: Object.fromEntries(options.states.map((state) => [state, audit.registryChanges[state]])), states };
if (options.reportOut) writeNew(options.reportOut, report);
console.log(JSON.stringify(report, null, 2));
