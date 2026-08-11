import assert from 'node:assert/strict';
import { runG8V2ConflictOfflineSteps, type G8V2ConflictOfflineStep } from './g8V2ConflictOfflineRunner.js';

const steps: G8V2ConflictOfflineStep[] = [
  { label: 'analysis', verifyReplay: false },
  { label: 'verified-1', verifyReplay: true },
  { label: 'verified-2', verifyReplay: true },
];

const nonzeroCalls: string[] = [];
const nonzero = runG8V2ConflictOfflineSteps(steps, (step) => {
  nonzeroCalls.push(step.label);
  return { status: 1, signal: null, errorCode: null, stdout: Buffer.alloc(0), stderr: Buffer.from('redacted failure') };
}, () => assert.fail('nonzero child must not be validated'));
assert.equal(nonzero.status, 'failed');
assert.deepEqual(nonzeroCalls, ['analysis']);
assert.equal(nonzero.results.length, 1);

const invalidCalls: string[] = [];
assert.throws(() => runG8V2ConflictOfflineSteps(steps, (step) => {
  invalidCalls.push(step.label);
  return { status: 0, signal: null, errorCode: null, stdout: Buffer.from('{}'), stderr: Buffer.alloc(0) };
}, () => { throw new Error('invalid structured receipt'); }), /invalid structured receipt/);
assert.deepEqual(invalidCalls, ['analysis']);

const successCalls: string[] = [];
const validated: string[] = [];
const success = runG8V2ConflictOfflineSteps(steps, (step) => {
  successCalls.push(step.label);
  return { status: 0, signal: null, errorCode: null, stdout: Buffer.from(`{"label":"${step.label}"}`), stderr: Buffer.alloc(0) };
}, (step) => validated.push(step.label));
assert.equal(success.status, 'completed');
assert.deepEqual(successCalls, ['analysis', 'verified-1', 'verified-2']);
assert.deepEqual(validated, successCalls);
assert.equal(success.results.length, 3);

console.log('G8.4BR5C offline runner sequencing tests passed');
