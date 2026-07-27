import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import { buildCanonicalPublicationSnapshot } from './canonicalPublication.js';

const root = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration'); mkdirSync(root, { recursive: true });
const suffix = `ballot-eligibility-cli-${process.pid}`; const snapshotPath = resolve(root, `${suffix}.json`); const reportPath = resolve(root, `${suffix}-report.json`);
const snapshot = buildCanonicalPublicationSnapshot({ projectId: 'politipiks', databaseId: 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a', capturedAt: '2026-07-27T00:00:00.000Z',
  races: CANONICAL_2026_FEDERAL_CONTESTS.map((seat) => ({ ...seat, candidates: [] })), deadlines: [], predictions: [], candidateResearch: [], contestMetrics: [], overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] } });
writeFileSync(snapshotPath, JSON.stringify(snapshot), { flag: 'wx' });
const run = (args: string[]) => spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/report-2026-ballot-eligibility.ts', ...args], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: 'C:\missing.json' } });
const offline = run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}.json`, '--dry-run', '--report-out', `.artifacts/private/canonical-migration/${suffix}-report.json`]);
assert.equal(offline.status, 0, offline.stderr); assert.match(offline.stdout, /not_yet_published/); assert.ok(existsSync(reportPath));
assert.notEqual(run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}.json`, '--input', 'data/2026/jurisdiction-deadlines.json']).status, 0, 'wrong local input is rejected');
assert.notEqual(run(['--year', '2024', '--snapshot-in', `.artifacts/private/canonical-migration/${suffix}.json`]).status, 0, 'only 2026 is accepted');
console.log('ballot eligibility CLI tests passed');
