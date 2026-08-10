import assert from 'node:assert/strict';
import { beginG8V2Read, completeG8V2Read, createG8V2StructuredAuditResult, failG8V2StructuredAuditResult, stableG8V2StateAuditErrorCode } from './g8V2StateAuditResult.js';

const result = createG8V2StructuredAuditResult();
assert.equal(result.contract, 'g8-4br3a-state-audit-result/v1');
assert.deepEqual(result.reads.selector, { expected: 1, attempted: 0, succeeded: 0, failed: 0, unknown: 0, notAttempted: 1, outcome: 'not-attempted' });
assert.deepEqual(result.reads.exactPaths, { expected: 3352, attempted: 0, succeeded: 0, failed: 0, unknown: 0, notAttempted: 3352, outcome: 'not-attempted' });
beginG8V2Read(result.reads.selector);
completeG8V2Read(result.reads.selector, 'attempted-unknown');
assert.equal(result.reads.selector.outcome, 'attempted-unknown');
assert.equal(stableG8V2StateAuditErrorCode('selector-read', { code: 'PERMISSION_DENIED', message: 'private-key=SECRET token=SECRET' }), 'PERMISSION_DENIED');
assert.equal(stableG8V2StateAuditErrorCode('exact-path-reads', { code: 'RESOURCE_EXHAUSTED', message: 'quota token=SECRET' }), 'QUOTA_EXCEEDED');
assert.equal(stableG8V2StateAuditErrorCode('exact-path-reads', { code: 'DEADLINE_EXCEEDED', message: 'email@example.invalid' }), 'SERVER_COMPLETION_UNKNOWN');
const secret = 'C:\\private\\credential.json private-key=SECRET token=SECRET email@example.invalid';
const failed = failG8V2StructuredAuditResult(result, 'selector-read', new Error(secret));
assert.equal(failed.error?.code, 'READ_FAILED');
assert.doesNotMatch(JSON.stringify(failed), /credential\.json|private-key|SECRET|email@example/);
console.log('G8.4BR3A structured result tests passed');
