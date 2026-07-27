import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { buildCanonicalMeasurePlan, buildCanonicalMeasureSnapshot, normalizeStatewideMeasureRegistry, validateCanonicalMeasureSnapshot } from './lib/canonicalBallotMeasures.js';

const privateRoot = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
function privatePath(value: string) { const path = resolve(process.cwd(), value); const child = relative(privateRoot, path); if (!child || child.startsWith('..') || !path.endsWith('.json')) throw new Error('snapshot output must be a JSON file beneath .artifacts/private/canonical-migration'); return path; }
const args = process.argv.slice(2); let input = resolve(process.cwd(), 'data/2026/statewide-ballot-measures.json'); let snapshotIn: string | undefined; let snapshotOut: string | undefined; let state: string | undefined; let replay = false;
for (let i = 0; i < args.length; i += 1) { const flag = args[i]; if (flag === '--dry-run') continue; if (flag === '--verify-replay') { replay = true; continue; } if (!['--year', '--state', '--input', '--snapshot-in', '--snapshot-out'].includes(flag)) throw new Error(`unsupported argument: ${flag}`); const value = args[++i]; if (!value) throw new Error(`missing value for ${flag}`); if (flag === '--year' && value !== '2026') throw new Error('only 2026 is supported'); if (flag === '--state') state = value.toUpperCase(); if (flag === '--input') input = resolve(process.cwd(), value); if (flag === '--snapshot-in') snapshotIn = privatePath(value); if (flag === '--snapshot-out') snapshotOut = privatePath(value); }
if (snapshotIn && snapshotOut) throw new Error('snapshot input and output are mutually exclusive'); if (snapshotOut && existsSync(snapshotOut)) throw new Error('snapshot output exists; refusing to overwrite');
const source = snapshotIn ? validateCanonicalMeasureSnapshot(JSON.parse(readFileSync(snapshotIn, 'utf8'))).input : normalizeStatewideMeasureRegistry(JSON.parse(readFileSync(input, 'utf8')));
const filtered = state ? { ...source, states: source.states.filter((item) => item.state === state) } : source;
if (state && filtered.states.length !== 1) throw new Error(`unknown state: ${state}`);
const plan = state ? buildCanonicalMeasurePlan({ ...source, states: source.states.map((item) => item.state === state ? item : { ...item, sourceStatus: 'not_yet_published' as const, measures: [] }) }) : buildCanonicalMeasurePlan(source);
if (snapshotOut) { mkdirSync(privateRoot, { recursive: true }); writeFileSync(snapshotOut, `${JSON.stringify(buildCanonicalMeasureSnapshot(source), null, 2)}\n`, { flag: 'wx' }); }
const report = { operation: 'offline-statewide-measure-report', dryRun: true, state: state ?? 'all', inputDigest: plan.inputDigest, planDigest: plan.planDigest, lockPolicyDigest: plan.lockPolicyDigest, coverage: plan.coverage, audit: plan.audit };
if (replay && buildCanonicalMeasurePlan(source).planDigest !== plan.planDigest) throw new Error('non-deterministic statewide-measure replay');
console.log(JSON.stringify(report, null, 2));
