import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { WAVE_B_STATES, buildWaveBReport, fetchWaveBProvider, normalizeWaveBFixture, type WaveBState } from './lib/waveBStateProviders.js';

const privateRoot = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
const fixtureRoot = resolve(process.cwd(), 'data', '2026', 'wave-b-html');
type Options = { states: WaveBState[]; fetch: boolean; fixtureDir: string; snapshotIn?: string; snapshotOut?: string; reportOut?: string; replay: boolean };

function privatePath(value: string, flag: string) {
  const path = resolve(process.cwd(), value); const child = relative(privateRoot, path);
  if (!child || child.startsWith('..') || !path.endsWith('.json')) throw new Error(`${flag} must be a JSON file beneath .artifacts/private/canonical-migration`);
  return path;
}
function parseArgs(args: string[]): Options {
  const options: Options = { states: [...WAVE_B_STATES], fetch: false, fixtureDir: fixtureRoot, replay: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--all-wave-b' || flag === '--dry-run') continue;
    if (flag === '--fetch') { options.fetch = true; continue; }
    if (flag === '--verify-replay') { options.replay = true; continue; }
    const value = args[++index]; if (!value) throw new Error(`missing value for ${flag}`);
    if (flag === '--state') { const state = value.toUpperCase() as WaveBState; if (!WAVE_B_STATES.includes(state)) throw new Error(`unknown Wave B state: ${value}`); options.states = [state]; continue; }
    if (flag === '--fixture-dir') { options.fixtureDir = resolve(process.cwd(), value); continue; }
    if (flag === '--snapshot-in') { options.snapshotIn = privatePath(value, flag); continue; }
    if (flag === '--snapshot-out') { options.snapshotOut = privatePath(value, flag); continue; }
    if (flag === '--report-out') { options.reportOut = privatePath(value, flag); continue; }
    throw new Error(`unsupported argument: ${flag}`);
  }
  if (options.snapshotIn && options.snapshotOut) throw new Error('--snapshot-in and --snapshot-out are mutually exclusive');
  for (const output of [options.snapshotOut, options.reportOut]) if (output && existsSync(output)) throw new Error(`output exists; refusing to overwrite: ${output}`);
  return options;
}
function readFixtures(root: string) { return Object.fromEntries(WAVE_B_STATES.map((state) => [state, JSON.parse(readFileSync(resolve(root, `${state}.json`), 'utf8'))])) as Record<WaveBState, unknown>; }
function readSnapshot(path: string) {
  const snapshot = JSON.parse(readFileSync(path, 'utf8')) as { schemaVersion?: number; fixtures?: Record<WaveBState, unknown> };
  if (snapshot.schemaVersion !== 1 || !snapshot.fixtures) throw new Error('invalid Wave B offline snapshot');
  return snapshot.fixtures;
}
function writeNew(path: string, value: unknown) { mkdirSync(privateRoot, { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); }

const options = parseArgs(process.argv.slice(2));
const fixtures = options.snapshotIn ? readSnapshot(options.snapshotIn) : readFixtures(options.fixtureDir);
for (const state of WAVE_B_STATES) normalizeWaveBFixture(fixtures[state]);
if (options.snapshotOut) writeNew(options.snapshotOut, { schemaVersion: 1, capturedAt: new Date().toISOString(), fixtures });

const audit = buildWaveBReport(fixtures);
const selected = Object.fromEntries(options.states.map((state) => [state, audit.states[state]]));
const fetchDiagnostics: Record<string, string> = {};
if (options.fetch) {
  await Promise.all(options.states.map(async (state) => {
    try { await fetchWaveBProvider(state, fixtures[state]); }
    catch (error) { fetchDiagnostics[state] = error instanceof Error ? error.message : String(error); }
  }));
}
if (options.replay) {
  const replay = buildWaveBReport(fixtures);
  if (replay.inputDigest !== audit.inputDigest || replay.evidenceDigest !== audit.evidenceDigest || replay.planDigest !== audit.planDigest) throw new Error('non-deterministic Wave B offline replay');
}
const report = { operation: audit.operation, dryRun: !options.fetch, networkFetchRequested: options.fetch, state: options.states.length === 1 ? options.states[0] : 'all-wave-b', inputDigest: audit.inputDigest, evidenceDigest: audit.evidenceDigest, planDigest: audit.planDigest, counts: audit.counts, states: selected, fetchDiagnostics };
if (options.reportOut) writeNew(options.reportOut, report);
console.log(JSON.stringify(report, null, 2));
