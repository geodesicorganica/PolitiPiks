import { readFileSync } from 'node:fs';
import { buildG8ProductShadowWritePlan } from './lib/g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './lib/g8V2Activation.js';
import { getCurrentG8V2ActivationImplementationCommit, parseG8V2ActivationArguments, resolveG8V2Bundle } from './lib/g8V2ActivationCli.js';
import { createG8V2StructuredActivationResult, failG8V2StructuredActivationResult } from './lib/g8V2ActivationResult.js';
import { runG8V2StructuredActivation } from './lib/g8V2StructuredActivationRunner.js';
import { validateLocalProductBundle } from './lib/localProductBundle.js';

const argv = process.argv.slice(2);
const emit = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

if (!argv.includes('--dry-run')) {
  try {
    const result = await runG8V2StructuredActivation(argv);
    emit(result);
    process.exitCode = result.status === 'completed' ? 0 : 1;
  } catch {
    emit(failG8V2StructuredActivationResult(createG8V2StructuredActivationResult(), 'result-validation', { activationCode: 'MALFORMED_RESULT' }));
    process.exitCode = 1;
  }
} else {
  try {
    const arguments_ = parseG8V2ActivationArguments(argv);
    const bundlePath = resolveG8V2Bundle(arguments_.bundleIn!);
    const bundle = validateLocalProductBundle(JSON.parse(readFileSync(bundlePath, 'utf8')));
    const shadowSourceCommit = arguments_.expectedShadowSourceCommit ?? CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT;
    const activationImplementationCommit = arguments_.expectedActivationImplementationCommit ?? getCurrentG8V2ActivationImplementationCommit();
    const shadowPlan = buildG8ProductShadowWritePlan(bundle, shadowSourceCommit);
    const plan = buildG8V2ActivationPlan(shadowPlan, {
      shadowVerification: arguments_.shadowVerificationReceipt ?? 'g8-3a-shadow-offline',
      promotion: arguments_.promotionReceipt ?? 'g8-3a-promotion-offline',
      activation: arguments_.activationReceipt ?? 'g8-3a-activation-offline',
      rollback: arguments_.rollbackReceipt ?? 'g8-3a-rollback-offline',
    }, { identitySchemaVersion: 2, shadowSourceCommit, activationImplementationCommit });
    emit({
      contract: plan.contract,
      writes: 0,
      promotedContentDocuments: plan.documents.length,
      selectorManifestOperations: ['create-pending-selector', 'set-active-selector'],
      totalFutureOperations: plan.documents.length + 2,
      identitySchemaVersion: plan.identitySchemaVersion,
      shadowSourceCommit: plan.shadowSourceCommit,
      activationImplementationCommit: plan.activationImplementationCommit,
      shadowNamespaceDigest: plan.certifiedDigests.namespace,
      activationPlanDigest: plan.planDigest,
      expectedCounts: plan.expectedCounts,
      stateMachine: ['validate-shadow', 'pending-selector-manifest', 'bounded-active-document-promotion', 'exact-content-verification', 'final-active-selector'],
    });
  } catch (error) {
    emit(failG8V2StructuredActivationResult(createG8V2StructuredActivationResult(), 'argument-parsing', error));
    process.exitCode = 1;
  }
}
