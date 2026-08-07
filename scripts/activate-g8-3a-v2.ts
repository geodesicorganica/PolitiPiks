import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildG8ProductShadowWritePlan, createFirestoreG8ProductShadowStore, verifyG8ProductShadowNamespace } from './lib/g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, createFirestoreG8V2ActivationStore, executeG8V2Activation, rollbackG8V2Activation, verifyG8V2Activation } from './lib/g8V2Activation.js';
import { assertCommittedG8V2Implementation, assertG8V2ActivationGuards, loadG8V2ActivationPlan, parseG8V2ActivationArguments, resolveG8V2Bundle } from './lib/g8V2ActivationCli.js';
import { validateLocalProductBundle } from './lib/localProductBundle.js';

const arguments_ = parseG8V2ActivationArguments(process.argv.slice(2));
const bundlePath = resolveG8V2Bundle(arguments_.bundleIn!);
const bundle = validateLocalProductBundle(JSON.parse(readFileSync(bundlePath, 'utf8')));
const sourceCommit = arguments_.expectedSourceCommit ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const shadowPlan = buildG8ProductShadowWritePlan(bundle, sourceCommit);
const plan = buildG8V2ActivationPlan(shadowPlan, {
  shadowVerification: arguments_.shadowVerificationReceipt ?? 'g8-3a-shadow-offline',
  promotion: arguments_.promotionReceipt ?? 'g8-3a-promotion-offline',
  activation: arguments_.activationReceipt ?? 'g8-3a-activation-offline',
  rollback: arguments_.rollbackReceipt ?? 'g8-3a-rollback-offline',
}, sourceCommit);

if (arguments_.dryRun) {
  const manifest = JSON.parse(readFileSync(arguments_.manifest ?? 'docs/g8-catalog-beta-release-manifest.json', 'utf8')) as unknown;
  if (arguments_.projectId) assertG8V2ActivationGuards(arguments_, plan, manifest);
  console.log(JSON.stringify({
    contract: plan.contract,
    writes: 0,
    promotedContentDocuments: plan.documents.length,
    selectorManifestOperations: ['create-pending-selector', 'set-active-selector'],
    totalFutureOperations: plan.documents.length + 2,
    sourceCommit: plan.sourceCommit,
    shadowNamespaceDigest: plan.certifiedDigests.namespace,
    activationPlanDigest: plan.planDigest,
    expectedCounts: plan.expectedCounts,
    stateMachine: ['validate-shadow', 'pending-selector-manifest', 'bounded-active-document-promotion', 'exact-content-verification', 'final-active-selector'],
  }, null, 2));
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(arguments_.manifest ?? 'docs/g8-catalog-beta-release-manifest.json', 'utf8')) as unknown;
assertG8V2ActivationGuards(arguments_, plan, manifest);
assertCommittedG8V2Implementation(arguments_.expectedSourceCommit!);

const store = await createFirestoreG8V2ActivationStore(plan);
if (arguments_.apply || arguments_.verifyOnly) {
  const shadowStore = await createFirestoreG8ProductShadowStore(shadowPlan);
  const shadowVerification = await verifyG8ProductShadowNamespace(shadowStore, shadowPlan);
  if (shadowVerification.contentDigest !== plan.certifiedDigests.namespace) throw new Error('verified shadow namespace digest differs from activation plan');
}
if (arguments_.apply) console.log(JSON.stringify(await executeG8V2Activation(store, plan), null, 2));
else if (arguments_.verifyOnly) console.log(JSON.stringify(await verifyG8V2Activation(store, plan), null, 2));
else console.log(JSON.stringify(await rollbackG8V2Activation(store, plan), null, 2));
