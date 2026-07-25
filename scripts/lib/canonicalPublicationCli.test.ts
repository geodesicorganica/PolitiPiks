import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import { buildCanonicalPublicationSnapshot } from './canonicalPublication.js';

const root = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
mkdirSync(root, { recursive: true });
const suffix = `capture-cli-test-${process.pid}`;
const snapshotPath = resolve(root, `${suffix}.json`);
const approvedPath = resolve(root, `${suffix}-approved.json`);
const existingOutput = resolve(root, `${suffix}-existing.json`);
const zoneByState: Record<string, string> = { AK: 'America/Anchorage', AZ: 'America/Phoenix', CA: 'America/Los_Angeles', CO: 'America/Denver', HI: 'Pacific/Honolulu', ID: 'America/Boise', MT: 'America/Denver', NM: 'America/Denver', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', UT: 'America/Denver', WA: 'America/Los_Angeles', WY: 'America/Denver' };
const cache = new Map<string, { __firestoreType: 'timestamp/v1'; seconds: number; nanoseconds: number }>();
function closeAt(timeZone: string) {
  if (cache.has(timeZone)) return cache.get(timeZone)!;
  for (let seconds = Date.parse('2026-11-03T00:00:00.000Z') / 1000; seconds < Date.parse('2026-11-04T12:00:00.000Z') / 1000; seconds += 60) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(seconds * 1000)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` === '2026-11-03 19:00') { const value = { __firestoreType: 'timestamp/v1' as const, seconds, nanoseconds: 0 }; cache.set(timeZone, value); return value; }
  }
  throw new Error('missing fixture instant');
}
const deadlines = CANONICAL_2026_FEDERAL_CONTESTS.map((seat) => {
  const timeZone = zoneByState[seat.state] ?? 'America/New_York';
  return { electionId: seat.id, jurisdiction: seat.state, electionDate: '2026-11-03', localPollClosingTime: '19:00', timeZone, closeAt: closeAt(timeZone), sourceRuleIds: [`fixture-${seat.state}`], sourceName: 'Test-only government authority fixture', sourceUrl: 'https://elections.example.gov/fixture', citation: 'Fixture citation.', retrievedAt: '2026-07-24T00:00:00.000Z', reviewedAt: '2026-07-24T00:00:00.000Z', reviewerStatus: 'reviewed' as const, notes: 'Test-only fixture; not publication evidence.', ...( ['FL', 'ID', 'IN', 'KS', 'KY', 'MI', 'NE', 'ND', 'OR', 'SD', 'TN', 'TX'].includes(seat.state) ? { multiTimeZone: { treatment: 'district-specific-earliest-close' as const, basis: 'Test fixture.' } } : {}) };
});
const snapshot = buildCanonicalPublicationSnapshot({ projectId: 'politipiks', databaseId: 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a', capturedAt: '2026-07-24T00:00:00.000Z',
  races: CANONICAL_2026_FEDERAL_CONTESTS.map((seat) => ({ ...seat, candidates: [] })), deadlines, predictions: [{ id: 'fixture-prediction', targetId: 'fixture-target', pick: 'fixture-pick', userId: 'must-not-survive', leagueId: 'must-not-survive' } as never], candidateResearch: [], contestMetrics: [], overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
assert.deepEqual(snapshot.inputs.predictions[0], { id: 'fixture-prediction', targetId: 'fixture-target', pick: 'fixture-pick' }, 'privacy projection excludes user and league fields');
writeFileSync(snapshotPath, `${JSON.stringify(snapshot)}\n`, { flag: 'wx' });
writeFileSync(existingOutput, 'sentinel\n', { flag: 'wx' });
const run = (args: string[]) => spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/report-canonical-2026-publication.ts', ...args], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: 'C:\\definitely-missing.json', FIREBASE_CONFIG: '{invalid}' } });
const offline = run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}.json`, '--verify-replay']);
assert.equal(offline.status, 0, offline.stderr);
assert.match(offline.stdout, /offline-publication-replay/);
assert.doesNotMatch(`${offline.stdout}${offline.stderr}`, /bootstrapFirestore|credential|FirebaseApp/, 'offline replay did not initialize Firebase');
for (const version of [1, 2]) { const malformed = { ...snapshot, schemaVersion: version }; writeFileSync(resolve(root, `${suffix}-v${version}.json`), JSON.stringify(malformed), { flag: 'wx' }); assert.notEqual(run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}-v${version}.json`]).status, 0, `v${version} is rejected`); }
const tampered = { ...snapshot, inputDigest: '0'.repeat(64) }; writeFileSync(resolve(root, `${suffix}-tampered.json`), JSON.stringify(tampered), { flag: 'wx' }); assert.notEqual(run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}-tampered.json`]).status, 0, 'digest tampering is rejected');
const wrongProject = { ...snapshot, projectId: 'wrong-project' }; writeFileSync(resolve(root, `${suffix}-wrong-project.json`), JSON.stringify(wrongProject), { flag: 'wx' }); assert.notEqual(run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}-wrong-project.json`]).status, 0, 'wrong snapshot project is rejected');
const duplicate = { ...snapshot, inputs: { ...snapshot.inputs, races: [...snapshot.inputs.races, snapshot.inputs.races[0]] } }; writeFileSync(resolve(root, `${suffix}-duplicate.json`), JSON.stringify(duplicate), { flag: 'wx' }); assert.notEqual(run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}-duplicate.json`]).status, 0, 'duplicate race identity is rejected');
const duplicateDeadline = { ...snapshot, inputs: { ...snapshot.inputs, deadlines: [...snapshot.inputs.deadlines, snapshot.inputs.deadlines[0]] } }; writeFileSync(resolve(root, `${suffix}-duplicate-deadline.json`), JSON.stringify(duplicateDeadline), { flag: 'wx' }); assert.notEqual(run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}-duplicate-deadline.json`]).status, 0, 'duplicate deadline identity is rejected');
const badTimestamp = { ...snapshot, inputs: { ...snapshot.inputs, deadlines: snapshot.inputs.deadlines.map((item, index) => index === 0 ? { ...item, closeAt: { __firestoreType: 'timestamp/v1', seconds: 0, nanoseconds: 1000000000 } } : item) } }; writeFileSync(resolve(root, `${suffix}-bad-timestamp.json`), JSON.stringify(badTimestamp), { flag: 'wx' }); assert.notEqual(run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}-bad-timestamp.json`]).status, 0, 'unsupported timestamp values are rejected');
assert.notEqual(run(['--snapshot-in', '..\\unsafe.json']).status, 0, 'unsafe paths are rejected');
assert.notEqual(run(['--snapshot-out', `.artifacts/private/canonical-migration/${suffix}-out.json`]).status, 0, 'live capture identity is mandatory before bootstrap');
assert.notEqual(run(['--snapshot-out', `.artifacts/private/canonical-migration/${suffix}-out.json`, '--project-id', 'wrong', '--database-id', 'wrong']).status, 0, 'wrong identity is rejected before bootstrap');
assert.notEqual(run(['--snapshot-out', `.artifacts/private/canonical-migration/${suffix}-existing.json`, '--project-id', 'politipiks', '--database-id', 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a']).status, 0, 'existing output is not overwritten');
const approval = run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}.json`, '--verify-replay', '--approve-snapshot', `.artifacts/private/canonical-migration/${suffix}-approved.json`]);
assert.equal(approval.status, 0, approval.stderr); assert.ok(existsSync(approvedPath));
assert.notEqual(run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}.json`, '--verify-replay', '--approve-snapshot', `.artifacts/private/canonical-migration/${suffix}-approved.json`]).status, 0, 'approval copy cannot overwrite existing evidence');
const mismatch = buildCanonicalPublicationSnapshot({ projectId: 'politipiks', databaseId: 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a', capturedAt: '2026-07-25T00:00:00.000Z',
  races: snapshot.inputs.races, deadlines: snapshot.inputs.deadlines.map((item, index) => index === 0 ? { ...item, notes: `${item.notes} reviewed revision` } : item), predictions: snapshot.inputs.predictions, candidateResearch: snapshot.inputs.candidateResearch, contestMetrics: snapshot.inputs.contestMetrics, overrides: snapshot.inputs.overrides,
}); writeFileSync(resolve(root, `${suffix}-different.json`), JSON.stringify(mismatch), { flag: 'wx' });
assert.notEqual(run(['--snapshot-in', `.artifacts/private/canonical-migration/${suffix}-different.json`, '--approved-snapshot', `.artifacts/private/canonical-migration/${suffix}-approved.json`]).status, 0, 'approved snapshot mismatch is rejected');
console.log('canonical publication capture CLI boundary test passed');
