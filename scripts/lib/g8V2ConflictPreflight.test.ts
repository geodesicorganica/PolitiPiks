import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { getCurrentG8V2ActivationImplementationCommit } from './g8V2ActivationCli.js';
import { buildG8V2ConflictPreflightOutput, buildG8V2ConflictPreflightReceipt, G8_V2_CONFLICT_PREFLIGHT_CONTRACT, parseG8V2ConflictPreflightOutput } from './g8V2ConflictPreflight.js';

const require = createRequire(import.meta.url);
const options = {
  bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json',
  snapshotOutPath: '.artifacts/private/canonical-migration/g8-4br5b-preflight-test-output.json',
  captureReceipt: 'g8-4br5b-conflict-capture-test',
  activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit(),
  conflictAnalysisImplementationCommit: 'a'.repeat(40),
  verifyImplementation: false,
};
const first = buildG8V2ConflictPreflightOutput(options);
const second = buildG8V2ConflictPreflightOutput(options);
assert.deepEqual(first, second);
assert.equal(first.canonicalReceipt?.contract, G8_V2_CONFLICT_PREFLIGHT_CONTRACT);
assert.equal(first.canonicalDigest, second.canonicalDigest);
assert.equal(first.firebaseInitialization, false);
assert.equal(first.credentialsLoaded, false);
assert.equal(first.reads, 0);
assert.equal(first.writes, 0);
assert.equal(first.commandsExecuted, 0);
assert.deepEqual(first.inventory, { ...first.inventory, selectorReads: 1, exactPathReads: 3352, totalReads: 3353, writes: 0, collectionScans: 0 });
assert.equal(first.capture.executable, process.execPath);
assert.equal(first.capture.arguments[0], require.resolve('tsx/cli'));
assert.equal(first.capture.arguments[1], 'scripts/report-g8-4br5a-conflicts.ts');
assert.equal(first.capture.arguments.length, 28);
assert.equal(first.canonicalReceipt?.launcher.shell, false);
assert.equal(first.canonicalReceipt?.safety.authorizationCreated, false);
assert.equal(first.canonicalReceipt?.snapshot.losslessActualConflicts, true);

const pretty = `${JSON.stringify(first, null, 2)}\n`;
for (const raw of [pretty, JSON.stringify(first), pretty.replace(/\n/g, '\r\n'), `\uFEFF${pretty}`, `wrapper\n${pretty}`]) {
  const parsed = parseG8V2ConflictPreflightOutput(raw);
  assert.equal(parsed.digest, first.canonicalDigest);
  assert.deepEqual(parsed.receipt, first.canonicalReceipt);
}
const tampered = structuredClone(first);
const targetIndex = tampered.capture.arguments.indexOf('--project-id');
tampered.capture.arguments[targetIndex + 1] = 'other-project';
assert.throws(() => buildG8V2ConflictPreflightReceipt(tampered), /differs/);
const wrongCount = structuredClone(first);
wrongCount.inventory.exactPathReads = 3351 as 3352;
assert.throws(() => buildG8V2ConflictPreflightReceipt(wrongCount), /bounds/);
const unexpected = { ...structuredClone(first), unsafeExtension: true };
assert.throws(() => buildG8V2ConflictPreflightReceipt(unexpected), /unexpected/);
assert.throws(() => buildG8V2ConflictPreflightOutput({ ...options, snapshotOutPath: '../outside.json' }), /private/);
assert.throws(() => buildG8V2ConflictPreflightOutput({ ...options, captureReceipt: 'wrong-receipt' }), /guard/);
assert.throws(() => buildG8V2ConflictPreflightOutput({ ...options, snapshotOutPath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json' }), /exists/);
console.log(`G8.4BR5A conflict preflight tests passed; two identical future-capture preflights: ${first.canonicalDigest}`);
