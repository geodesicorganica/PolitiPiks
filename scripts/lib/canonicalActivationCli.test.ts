import assert from 'node:assert/strict';
import { assertCanonicalActivationProductionGuards, parseCanonicalActivationArguments } from './canonicalActivationCli.js';

const valid = [
  '--snapshot-in', '.artifacts/private/canonical-migration/approved.json',
  '--project-id', 'politipiks',
  '--database-id', 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a',
  '--generation', 'canonical-2026-shadow-v1',
  '--expected-source-commit', 'fdb824d6512d33d78eb12f5766088712aa549d2c',
  '--expected-input-digest', 'd37f86d5dfdb168a1e98b190b61b00f0def1303175cafedfa578403f07e604eb',
  '--expected-mapping-digest', '7650db763671b6951c4650b816c31e67e8cafb9594ac651c9f25cbd41dc2861a',
  '--expected-plan-digest', '79e6d71411c675f01508618cbb138551d4c9f4f7cf9508f2d66d62d780dad7b0',
  '--expected-namespace-digest', '05b9f50ab06c6242e7b2e3443443f0abe67241c48592bd49a7abcfebf30de337',
  '--expected-races', '470', '--expected-research', '537', '--expected-metrics', '35',
];

const parsed = parseCanonicalActivationArguments(['--apply', ...valid]);
assert.equal(parsed.apply, true);
assert.doesNotThrow(() => assertCanonicalActivationProductionGuards(parsed));
assert.throws(() => parseCanonicalActivationArguments(['--apply', '--verify-only', ...valid]), /either/);
const mismatched = valid.map((value) => value === '470' ? '469' : value);
assert.throws(() => assertCanonicalActivationProductionGuards(parseCanonicalActivationArguments(['--apply', ...mismatched])), /guard/);
assert.throws(() => parseCanonicalActivationArguments(['--unknown', ...valid]), /unsupported/);

console.log('canonical activation CLI tests passed');
