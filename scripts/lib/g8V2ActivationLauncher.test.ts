import assert from 'node:assert/strict';
import { launchG8V2StructuredActivationChild } from './g8V2ActivationLauncher.js';
import { configureG8V2ActivationMode, createG8V2StructuredActivationResult } from './g8V2ActivationResult.js';
import { buildG8V2DirectNodeTsxInvocation } from './g8V2StateAuditPreflight.js';

const invocation = buildG8V2DirectNodeTsxInvocation('scripts/activate-g8-3a-v2.ts', ['--apply', '--bundle-in', 'safe-local-bundle.json']);
const completed = configureG8V2ActivationMode(createG8V2StructuredActivationResult(), 'apply');
completed.status = 'completed'; completed.phase = 'completed'; completed.failedPhase = null; completed.error = null;
let calls = 0;
const valid = launchG8V2StructuredActivationChild(invocation, { spawn: () => {
  calls += 1;
  return { pid: 7, status: 0, signal: null, error: null, stdout: JSON.stringify(completed), stderr: '' } as any;
} });
assert.equal(calls, 1);
assert.equal(valid.launcherExitStatus, 0);
assert.equal(valid.evidence.invocationAccounting.attempted, 1);
assert.equal(valid.result.status, 'completed');
assert.equal('stdout' in valid, false);
assert.equal('stderr' in valid, false);

calls = 0;
const malformed = launchG8V2StructuredActivationChild(invocation, { spawn: () => {
  calls += 1;
  return { pid: 8, status: 0, signal: null, error: null, stdout: 'not-json private_key=SECRET', stderr: 'raw stack token=SECRET' } as any;
} });
assert.equal(calls, 1, 'malformed output must never trigger a second invocation');
assert.equal(malformed.launcherExitStatus, 1);
assert.equal(malformed.evidence.outputStatus, 'malformed-json');
assert.equal(malformed.result.error?.code, 'MALFORMED_RESULT');
assert.doesNotMatch(JSON.stringify(malformed), /SECRET|private_key|token=|raw stack/);
console.log('G8.4BR4A exact-once activation launcher tests passed');
