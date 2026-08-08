import assert from 'node:assert/strict';
import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './g8V2Activation.js';
import { assertG8V2ActivationIdentity, parseG8V2ActivationArguments } from './g8V2ActivationCli.js';

const argv = parseG8V2ActivationArguments([
  '--dry-run', '--bundle-in', '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', '--manifest', 'docs/g8-catalog-beta-release-manifest.json',
  '--project-id', 'politipiks', '--database-id', 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a', '--generation', 'canonical-2026-shadow-v2', '--expected-shadow-source-commit', CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, '--expected-activation-implementation-commit', 'a'.repeat(40),
  '--expected-input-digest', 'a'.repeat(64), '--expected-evidence-digest', 'b'.repeat(64), '--expected-plan-digest', 'c'.repeat(64), '--expected-bundle-digest', 'd'.repeat(64), '--expected-namespace-digest', 'e'.repeat(64),
  '--expected-races', '470', '--expected-measures', '14', '--expected-candidate-research', '2384', '--expected-measure-research', '14', '--expected-metrics', '470', '--expected-content-documents', '3352',
  '--shadow-verification-receipt', 'g8-3a-shadow-cli', '--promotion-receipt', 'g8-3a-promotion-cli', '--activation-receipt', 'g8-3a-activation-cli', '--rollback-receipt', 'g8-3a-rollback-cli',
]);
assert.equal(argv.dryRun, true);
assert.equal(argv.expectedContentDocuments, '3352');
assert.equal(argv.expectedShadowSourceCommit, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT);
assert.equal(argv.expectedActivationImplementationCommit, 'a'.repeat(40));
assert.throws(() => parseG8V2ActivationArguments(['--apply', '--dry-run', '--bundle-in', 'x']), /exactly one/);
assert.throws(() => parseG8V2ActivationArguments(['--dry-run', '--bundle-in', 'x', '--unknown']), /unsupported/);
assert.throws(() => parseG8V2ActivationArguments(['--dry-run', '--bundle-in', 'x', '--expected-source-commit', 'a'.repeat(40)]), /unsupported/);
const validIdentity = { identitySchemaVersion: 2 as const, shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, activationImplementationCommit: 'a'.repeat(40) };
assert.doesNotThrow(() => assertG8V2ActivationIdentity(validIdentity, { head: 'a'.repeat(40), focusedStatus: '' }));
assert.throws(() => assertG8V2ActivationIdentity({ ...validIdentity, shadowSourceCommit: 'a'.repeat(40) }, { head: 'a'.repeat(40), focusedStatus: '' }), /shadow/);
assert.throws(() => assertG8V2ActivationIdentity({ ...validIdentity, activationImplementationCommit: 'b'.repeat(40) }, { head: 'a'.repeat(40), focusedStatus: '' }), /stale/);
assert.throws(() => assertG8V2ActivationIdentity(validIdentity, { head: 'a'.repeat(40), focusedStatus: ' M scripts/activate-g8-3a-v2.ts' }), /dirty/);
assert.throws(() => assertG8V2ActivationIdentity({ ...validIdentity, activationImplementationCommit: '' }, { head: 'a'.repeat(40), focusedStatus: '' }), /malformed/);
console.log('G8.3A v2 activation CLI tests passed');
