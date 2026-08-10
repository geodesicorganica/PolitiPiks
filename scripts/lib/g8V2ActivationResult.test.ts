import assert from 'node:assert/strict';
import {
  assertG8V2StructuredActivationResult,
  beginG8V2Operations,
  completeG8V2Operations,
  configureG8V2ActivationMode,
  createG8V2StructuredActivationResult,
  failG8V2StructuredActivationResult,
  malformedG8V2StructuredActivationResult,
  parseG8V2StructuredActivationResult,
  stableG8V2ActivationErrorCode,
} from './g8V2ActivationResult.js';

const result = configureG8V2ActivationMode(createG8V2StructuredActivationResult(), 'apply');
assert.equal(result.operations.reads.selector.planned, 1);
assert.equal(result.operations.reads.content.planned, 6704);
assert.equal(result.operations.writes.selector.planned, 2);
assert.equal(result.operations.writes.content.planned, 3352);
beginG8V2Operations(result.operations.writes.content, 399);
completeG8V2Operations(result.operations.writes.content, 'succeeded', 399);
assert.deepEqual(result.operations.writes.content, { planned: 3352, attempted: 399, succeeded: 399, failed: 0, unknown: 0, notAttempted: 2953, outcome: 'succeeded' });

assert.equal(stableG8V2ActivationErrorCode('content-promotion', { code: 'RESOURCE_EXHAUSTED' }), 'QUOTA_EXCEEDED');
assert.equal(stableG8V2ActivationErrorCode('content-promotion', { code: 'DEADLINE_EXCEEDED' }), 'SERVER_COMPLETION_UNKNOWN');
assert.equal(stableG8V2ActivationErrorCode('pending-selector-write', { code: 'ALREADY_EXISTS' }), 'SELECTOR_CONFLICT');
const secret = 'C:\\private\\credential.json private_key=SECRET token=SECRET email@example.invalid';
const failed = failG8V2StructuredActivationResult(result, 'content-promotion', Object.assign(new Error(secret), { code: 'RESOURCE_EXHAUSTED' }));
assert.equal(failed.error?.code, 'QUOTA_EXCEEDED');
assert.equal(failed.error?.classification, 'content-write');
assert.doesNotMatch(JSON.stringify(failed), /credential\.json|private_key|SECRET|email@example|token=/);
assert.doesNotThrow(() => assertG8V2StructuredActivationResult(failed));
assert.deepEqual(parseG8V2StructuredActivationResult(JSON.stringify(failed)), failed);

assert.throws(() => parseG8V2StructuredActivationResult('not-json'), (error: any) => error.activationCode === 'MALFORMED_RESULT');
assert.throws(() => parseG8V2StructuredActivationResult(`${JSON.stringify(failed)}\n${JSON.stringify(failed)}`), (error: any) => error.activationCode === 'MALFORMED_RESULT');
assert.throws(() => parseG8V2StructuredActivationResult(JSON.stringify({ ...failed, rawError: secret })), (error: any) => error.activationCode === 'MALFORMED_RESULT');
const malformed = malformedG8V2StructuredActivationResult();
assert.equal(malformed.error?.code, 'MALFORMED_RESULT');
assert.equal(malformed.failedPhase, 'result-validation');
assert.doesNotMatch(JSON.stringify(malformed), /credential|private_key|token=/i);
console.log('G8.4BR4A structured activation result tests passed');
