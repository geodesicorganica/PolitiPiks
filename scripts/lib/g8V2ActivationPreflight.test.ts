import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './g8V2Activation.js';
import { buildG8V2ProductionArgumentArrays } from './g8V2ActivationPreflight.js';

const options = {
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json',
  bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  receipts: { shadowVerification: 'g8-4a-shadow-preflight', promotion: 'g8-4a-promotion-preflight', activation: 'g8-4a-activation-preflight', rollback: 'g8-4a-rollback-preflight' },
  verifyImplementation: false,
};
const first = buildG8V2ProductionArgumentArrays(options);
const second = buildG8V2ProductionArgumentArrays(options);
assert.deepEqual(first, second);
assert.equal(first.expectedCounts.contentDocuments, 3352);
assert.equal(first.apply.filter((value) => value === '--expected-content-documents').length, 1);
assert.equal(new Set(options.receipts ? Object.values(options.receipts) : []).size, 4);
assert.throws(() => buildG8V2ProductionArgumentArrays({ ...options, shadowSourceCommit: options.activationImplementationCommit }), /certified historical/);
assert.throws(() => buildG8V2ProductionArgumentArrays({ ...options, receipts: { ...options.receipts, rollback: options.receipts.activation } }), /distinct/);
console.log('G8.4A activation preflight builder tests passed');
