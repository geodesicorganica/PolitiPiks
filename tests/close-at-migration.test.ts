import assert from 'node:assert/strict';
import {
  CANONICAL_DATABASE_ID,
  CANONICAL_PROJECT_ID,
  buildMigrationPlan,
  parseMigrationRequest,
} from '../scripts/close-at-migration-lib.ts';

const validArgs = [
  '--apply',
  '--project-id', CANONICAL_PROJECT_ID,
  '--database-id', CANONICAL_DATABASE_ID,
  '--expected-count', '2',
  '--deadline', '2026-11-03T23:59:59.000Z',
];

const request = parseMigrationRequest(validArgs);
assert.equal(request.apply, true);
assert.equal(request.expectedCount, 2);
assert.equal(request.deadline.toISOString(), '2026-11-03T23:59:59.000Z');
const configuredRequest = { ...request, expectedCount: request.expectedCount!, deadline: request.deadline! };

const plan = buildMigrationPlan([
  { collection: 'races', id: 'race-missing', closeAt: null },
  { collection: 'ballotMeasures', id: 'measure-missing', closeAt: undefined },
  { collection: 'races', id: 'race-matched', closeAt: { toMillis: () => request.deadline.getTime() } },
], configuredRequest);
assert.equal(plan.ok, true);
assert.equal(plan.pending.length, 2);
assert.equal(plan.alreadyAtDeadline.length, 1);
assert.deepEqual(plan.batches.map((batch) => batch.length), [2]);

const batchPlan = buildMigrationPlan(Array.from({ length: 401 }, (_, index) => ({
  collection: 'races' as const,
  id: `race-${index}`,
  closeAt: null,
})), { ...configuredRequest, expectedCount: 401 });
assert.equal(batchPlan.ok, true);
assert.deepEqual(batchPlan.batches.map((batch) => batch.length), [400, 1]);

const conflictingPlan = buildMigrationPlan([
  { collection: 'races', id: 'race-conflict', closeAt: { toMillis: () => request.deadline.getTime() + 1 } },
], { ...configuredRequest, expectedCount: 0 });
assert.equal(conflictingPlan.ok, false);
assert.match(conflictingPlan.errors.join(' '), /conflicting closeAt/);

assert.throws(() => parseMigrationRequest([
  '--apply', '--project-id', 'other-project', '--database-id', CANONICAL_DATABASE_ID,
  '--expected-count', '1', '--deadline', '2026-11-03T23:59:59.000Z',
]), /project id/i);
assert.throws(() => parseMigrationRequest([
  '--apply', '--project-id', CANONICAL_PROJECT_ID, '--database-id', CANONICAL_DATABASE_ID,
  '--expected-count', '1', '--deadline', '2026-11-03T23:59:59-04:00',
]), /UTC ISO/i);
assert.throws(() => parseMigrationRequest([
  '--apply', '--project-id', CANONICAL_PROJECT_ID, '--database-id', CANONICAL_DATABASE_ID,
  '--expected-count', 'not-a-number', '--deadline', '2026-11-03T23:59:59.000Z',
]), /expected count/i);
assert.throws(() => parseMigrationRequest(['--apply']), /requires/i);

const dryRun = parseMigrationRequest([]);
assert.equal(dryRun.apply, false);
assert.equal(dryRun.configured, false);

console.log('PASS: closeAt migration guards and offline planning are verified without Firestore writes.');
