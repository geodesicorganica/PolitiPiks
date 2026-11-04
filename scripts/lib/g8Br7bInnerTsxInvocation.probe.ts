import assert from 'node:assert/strict';
import { getHeapStatistics } from 'node:v8';
import { buildCertifiedG8V2ConflictReconciliationPlan } from './g8V2ConflictReconciliation.js';

assert.deepEqual(
  process.execArgv.filter((argument) => argument.startsWith('--max-old-space-size=')),
  ['--max-old-space-size=4096'],
  'the TSX-executed BR7B test process must receive the exact heap argument',
);
assert.equal(typeof globalThis.gc, 'function', 'the TSX-executed BR7B test process must receive the explicit-GC argument');
assert.ok(
  getHeapStatistics().heap_size_limit >= 4096 * 1024 * 1024
    && getHeapStatistics().heap_size_limit <= 4160 * 1024 * 1024,
  'the TSX-executed BR7B test process must observe the bounded heap policy',
);
await import('@google-cloud/firestore');
const plan = buildCertifiedG8V2ConflictReconciliationPlan();
assert.deepEqual(plan.counts, { paths: 858, races: 429, metrics: 429, replaceWithCertified: 4, deterministicMerges: 854 });
globalThis.gc();
assert.ok(process.memoryUsage().heapUsed <= 256 * 1024 * 1024, 'the effective TSX probe must retain at most 256 MiB after plan compaction');

console.log('G8.4BR7BR2AR effective inner TSX heap probe passed');
