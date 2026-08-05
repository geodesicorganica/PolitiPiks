import { execFileSync } from 'node:child_process';
import { resolveG8ProductBundleInputPath, parseG8ProductShadowArguments, assertG8ProductShadowProductionGuards, readG8ProductBundle } from './lib/g8ProductShadowCli.js';
import {
  buildG8ProductShadowWritePlan,
  createFirestoreG8ProductShadowStore,
  executeG8ProductShadowWritePlan,
  getCommittedG8ProductShadowSource,
  verifyG8ProductShadowNamespace,
} from './lib/g8ProductShadowExecutor.js';

const arguments_ = parseG8ProductShadowArguments(process.argv.slice(2));
const bundlePath = resolveG8ProductBundleInputPath(arguments_.bundleIn);
const productionOperation = arguments_.apply || arguments_.verifyOnly;
const sourceCommit = productionOperation ? getCommittedG8ProductShadowSource() : execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const plan = buildG8ProductShadowWritePlan(readG8ProductBundle(bundlePath), sourceCommit);

if (!productionOperation) {
  console.log(JSON.stringify({
    operation: 'dry-run', applied: false, writes: 0, contentDocuments: plan.documents.length, operationsIncludingRootManifest: plan.documents.length + 1,
    batchesIncludingRootCompletion: Math.ceil(plan.documents.length / 399) + 1, generation: plan.generation, sourceCommit: plan.sourceCommit,
    target: plan.target, certifiedDigests: plan.certifiedDigests, expectedCounts: plan.expectedCounts, namespaceDigest: plan.namespaceDigest,
  }, null, 2));
} else {
  assertG8ProductShadowProductionGuards(arguments_, plan, sourceCommit);
  const store = await createFirestoreG8ProductShadowStore(plan);
  const result = arguments_.verifyOnly ? await verifyG8ProductShadowNamespace(store, plan) : await executeG8ProductShadowWritePlan(store, plan);
  console.log(JSON.stringify({ operation: arguments_.verifyOnly ? 'verify-only' : 'apply', applied: arguments_.apply, generation: plan.generation, ...result }, null, 2));
}
