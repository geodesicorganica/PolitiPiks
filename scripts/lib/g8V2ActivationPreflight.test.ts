import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './g8V2Activation.js';
import {
  buildG8V2ActivationPreflightOutput,
  buildG8V2ActivationPreflightReceipt,
  buildG8V2ProductionArgumentArrays,
  G8_V2_ACTIVATION_PREFLIGHT_CONTRACT,
  parseG8V2ActivationPreflightOutput,
} from './g8V2ActivationPreflight.js';

const require = createRequire(import.meta.url);
const options = {
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json',
  bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: 'a'.repeat(40),
  receipts: {
    shadowVerification: 'g8-4br4b-shadow-verification-test',
    promotion: 'g8-4br4b-content-promotion-test',
    activation: 'g8-4br4b-selector-activation-test',
    rollback: 'g8-4br4b-selector-rollback-test',
  },
  verifyImplementation: false,
};

const first = buildG8V2ProductionArgumentArrays(options);
const second = buildG8V2ProductionArgumentArrays(options);
assert.deepEqual(first, second);
assert.equal(first.expectedCounts.contentDocuments, 3352);
for (const [key, invocation] of Object.entries({ apply: first.apply, verifyOnly: first.verifyOnly, rollback: first.rollback })) {
  assert.equal(invocation.executable, process.execPath, `${key} must use process.execPath`);
  assert.equal(invocation.arguments[0], require.resolve('tsx/cli'));
  assert.equal(invocation.arguments[1], 'scripts/activate-g8-3a-v2.ts');
  assert.equal(invocation.arguments.length, 47);
  assert.equal(invocation.cwd, process.cwd());
  assert.equal(invocation.arguments.some((value) => /^(?:npm|npx(?:\.cmd)?)$/i.test(value)), false);
  assert.equal('shell' in invocation, false);
}
assert.equal(first.apply.arguments[2], '--apply');
assert.equal(first.verifyOnly.arguments[2], '--verify-only');
assert.equal(first.rollback.arguments[2], '--rollback');
assert.equal(first.apply.arguments.filter((value) => value === '--expected-content-documents').length, 1);
assert.equal(new Set(Object.values(options.receipts)).size, 4);

const output = buildG8V2ActivationPreflightOutput(options);
const canonical = buildG8V2ActivationPreflightReceipt(output);
assert.equal(canonical.receipt.contract, G8_V2_ACTIVATION_PREFLIGHT_CONTRACT);
assert.equal(canonical.receipt.resultContract, 'g8-4br4a-activation-result/v1');
assert.equal(canonical.receipt.receipts.futureOperation, 'G8.4BR4B');
assert.equal(canonical.receipt.receipts.uniqueCount, 4);
assert.equal(canonical.receipt.safety.firebaseInitialization, false);
assert.equal(canonical.receipt.safety.commandsExecuted, 0);
assert.equal(canonical.receipt.safety.shell, false);
assert.equal(output.canonicalDigest, canonical.digest);
assert.deepEqual(output.canonicalReceipt, canonical.receipt);

const pretty = `${JSON.stringify(output, null, 2)}\n`;
for (const raw of [pretty, JSON.stringify(output), pretty.replace(/\n/g, '\r\n'), `\uFEFF${pretty}`, `\n> presentation wrapper\r\n\r\n${pretty}`]) {
  const parsed = parseG8V2ActivationPreflightOutput(Buffer.from(raw, 'utf8'));
  assert.deepEqual(parsed.receipt, canonical.receipt);
  assert.equal(parsed.digest, canonical.digest);
}

const tampered = structuredClone(output);
const projectIndex = tampered.apply.arguments.indexOf('--project-id');
tampered.apply.arguments[projectIndex + 1] = 'other-project';
assert.throws(() => buildG8V2ActivationPreflightReceipt(tampered), /operation arguments differ/);
const wrongMode = structuredClone(output);
wrongMode.apply.arguments[2] = '--verify-only';
assert.throws(() => buildG8V2ActivationPreflightReceipt(wrongMode), /mode or script/);
const shellLike = structuredClone(output);
shellLike.apply.executable = 'npx.cmd';
assert.throws(() => buildG8V2ActivationPreflightReceipt(shellLike), /process\.execPath/);
assert.throws(() => buildG8V2ProductionArgumentArrays({ ...options, shadowSourceCommit: options.activationImplementationCommit }), /certified historical/);
assert.throws(() => buildG8V2ProductionArgumentArrays({ ...options, receipts: { ...options.receipts, rollback: options.receipts.activation } }), /distinct/);
assert.throws(() => buildG8V2ProductionArgumentArrays({ ...options, receipts: { shadowVerification: 'g8-4b-shadow', promotion: 'g8-4b-promotion', activation: 'g8-4b-activation', rollback: 'g8-4b-rollback' } }), /future G8\.4BR4B/);
console.log(`G8.4BR4A canonical activation preflight tests passed: ${canonical.digest}`);
