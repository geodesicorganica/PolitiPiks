import assert from 'node:assert/strict';
import { buildG8V2ActivationPlan, type G8V2ActivationPlan } from './g8V2Activation.js';
import { parseG8V2ActivationArguments } from './g8V2ActivationCli.js';

const argv = parseG8V2ActivationArguments([
  '--dry-run', '--bundle-in', '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', '--manifest', 'docs/g8-catalog-beta-release-manifest.json',
  '--project-id', 'politipiks', '--database-id', 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a', '--generation', 'canonical-2026-shadow-v2', '--expected-source-commit', 'a'.repeat(40),
  '--expected-input-digest', 'a'.repeat(64), '--expected-evidence-digest', 'b'.repeat(64), '--expected-plan-digest', 'c'.repeat(64), '--expected-bundle-digest', 'd'.repeat(64), '--expected-namespace-digest', 'e'.repeat(64),
  '--expected-races', '470', '--expected-measures', '14', '--expected-candidate-research', '2384', '--expected-measure-research', '14', '--expected-metrics', '470', '--expected-content-documents', '3352',
  '--shadow-verification-receipt', 'g8-3a-shadow-cli', '--promotion-receipt', 'g8-3a-promotion-cli', '--activation-receipt', 'g8-3a-activation-cli', '--rollback-receipt', 'g8-3a-rollback-cli',
]);
assert.equal(argv.dryRun, true);
assert.equal(argv.expectedContentDocuments, '3352');
assert.throws(() => parseG8V2ActivationArguments(['--apply', '--dry-run', '--bundle-in', 'x']), /exactly one/);
assert.throws(() => parseG8V2ActivationArguments(['--dry-run', '--bundle-in', 'x', '--unknown']), /unsupported/);
console.log('G8.3A v2 activation CLI tests passed');
