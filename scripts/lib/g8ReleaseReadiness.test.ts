import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLocalProductBundle } from './localProductBundle.js';
import { validateG8ReleaseManifest } from './g8ReleaseReadiness.js';

const manifestPath = 'docs/g8-catalog-beta-release-manifest.json';
const bundlePath = '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, any>;
const bundle = validateLocalProductBundle(JSON.parse(readFileSync(bundlePath, 'utf8')));
const clone = <T>(value: T): T => structuredClone(value);

const first = validateG8ReleaseManifest(manifest, bundle);
const second = validateG8ReleaseManifest(manifest, bundle);
assert.deepEqual(first, second);
assert.equal(first.receiptDigest, '0a370499fc7366ef5adcd87068b941aff40f73e3de3ebebf53fbfd9ab470173c');

const staleCounts = clone(manifest);
staleCounts.release.expectedCounts.races = 469;
assert.throws(() => validateG8ReleaseManifest(staleCounts, bundle), /counts/);

const staleDigests = clone(manifest);
staleDigests.release.expectedDigests.bundle = '0'.repeat(64);
assert.throws(() => validateG8ReleaseManifest(staleDigests, bundle), /digests/);

const v1 = clone(bundle) as any;
v1.generation = 'canonical-2026-shadow-v1';
assert.throws(() => validateG8ReleaseManifest(manifest, v1), /v1/);

const unsafeOrdering = clone(manifest);
[unsafeOrdering.stages[0], unsafeOrdering.stages[1]] = [unsafeOrdering.stages[1], unsafeOrdering.stages[0]];
assert.throws(() => validateG8ReleaseManifest(unsafeOrdering, bundle), /order/);

const missingBoundary = clone(manifest);
missingBoundary.stages[4].authorizationBoundary = '';
assert.throws(() => validateG8ReleaseManifest(missingBoundary, bundle), /authorization/);

const destructiveRollback = clone(manifest);
destructiveRollback.rollbackPaths[0].dataDeletionAllowed = true;
assert.throws(() => validateG8ReleaseManifest(destructiveRollback, bundle), /destructive/);

const mismatchedTarget = clone(manifest);
mismatchedTarget.release.target.databaseId = 'wrong-database';
assert.throws(() => validateG8ReleaseManifest(mismatchedTarget, bundle), /project\/database/);

const dirtyScope = clone(manifest);
dirtyScope.releaseScope.cleanRequired = false;
assert.throws(() => validateG8ReleaseManifest(dirtyScope, bundle), /dirty/);

console.log('G8 release/rollback readiness validator tests passed');
