import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import type { CanonicalMigrationSnapshot } from './lib/canonicalMigration.js';
import {
  buildCanonicalShadowWritePlan,
  createFirestoreCanonicalShadowStore,
  executeCanonicalShadowWritePlan,
  getCommittedExecutorSource,
  verifyCanonicalShadowNamespace,
} from './lib/canonicalShadowExecutor.js';
import {
  assertCanonicalShadowProductionGuards,
  parseCanonicalShadowArguments,
  resolvePrivateSnapshotInputPath,
} from './lib/canonicalShadowCli.js';

function currentCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

const arguments_ = parseCanonicalShadowArguments(process.argv.slice(2));
const snapshotPath = resolvePrivateSnapshotInputPath(arguments_.snapshotIn!);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as CanonicalMigrationSnapshot;
const productionOperation = arguments_.apply || arguments_.verifyOnly;
if (productionOperation) assertCanonicalShadowProductionGuards(arguments_);
const sourceCommit = productionOperation ? getCommittedExecutorSource() : currentCommit();
const plan = buildCanonicalShadowWritePlan(snapshot, sourceCommit);

if (!productionOperation) {
  console.log(JSON.stringify({
    operation: 'dry-run', applied: false, writes: 0, generation: plan.generation, sourceCommit: plan.sourceCommit,
    snapshot: plan.snapshot, mappingDigest: plan.mappingDigest, planDigest: plan.planDigest, expectedCounts: plan.expectedCounts,
  }, null, 2));
} else {
  const store = await createFirestoreCanonicalShadowStore();
  const result = arguments_.verifyOnly
    ? await verifyCanonicalShadowNamespace(store, plan)
    : await executeCanonicalShadowWritePlan(store, plan);
  console.log(JSON.stringify({ operation: arguments_.verifyOnly ? 'verify-only' : 'apply', applied: arguments_.apply, generation: plan.generation, ...result }, null, 2));
}
