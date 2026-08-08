import { readFileSync } from 'node:fs';
import { buildG8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, type G8V2ActivationIdentity, type G8V2AuthorizationReceipts } from './g8V2Activation.js';
import { assertCommittedG8V2Implementation, assertG8V2ActivationGuards, type G8V2ActivationArguments } from './g8V2ActivationCli.js';
import { validateLocalProductBundle } from './localProductBundle.js';

export type G8V2ProductionArgumentArrays = {
  apply: string[];
  verifyOnly: string[];
  rollback: string[];
  identity: G8V2ActivationIdentity;
  planDigest: string;
  namespaceDigest: string;
  expectedCounts: ReturnType<typeof buildG8ProductShadowWritePlan>['expectedCounts'];
};

type PreflightOptions = {
  manifestPath: string;
  bundlePath: string;
  shadowSourceCommit: string;
  activationImplementationCommit: string;
  receipts: G8V2AuthorizationReceipts;
  verifyImplementation?: boolean;
};

const flag = (name: string, value: string | number) => [name, String(value)];

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function commonArguments(options: PreflightOptions, manifest: { release: { generation: string; target: { projectId: string; databaseId: string }; expectedDigests: Record<string, string> } }, plan: ReturnType<typeof buildG8V2ActivationPlan>) {
  const counts = plan.expectedCounts;
  return [
    ...flag('--bundle-in', options.bundlePath), ...flag('--manifest', options.manifestPath),
    ...flag('--project-id', manifest.release.target.projectId), ...flag('--database-id', manifest.release.target.databaseId),
    ...flag('--generation', manifest.release.generation),
    ...flag('--expected-shadow-source-commit', plan.shadowSourceCommit),
    ...flag('--expected-activation-implementation-commit', plan.activationImplementationCommit),
    ...flag('--expected-input-digest', manifest.release.expectedDigests.input),
    ...flag('--expected-evidence-digest', manifest.release.expectedDigests.evidence),
    ...flag('--expected-plan-digest', manifest.release.expectedDigests.plan),
    ...flag('--expected-bundle-digest', manifest.release.expectedDigests.bundle),
    ...flag('--expected-namespace-digest', plan.certifiedDigests.namespace),
    ...flag('--expected-races', counts.races), ...flag('--expected-measures', counts.measures),
    ...flag('--expected-candidate-research', counts.candidateResearch), ...flag('--expected-measure-research', counts.measureResearch),
    ...flag('--expected-metrics', counts.metrics), ...flag('--expected-content-documents', counts.contentDocuments),
    ...flag('--shadow-verification-receipt', options.receipts.shadowVerification), ...flag('--promotion-receipt', options.receipts.promotion),
    ...flag('--activation-receipt', options.receipts.activation), ...flag('--rollback-receipt', options.receipts.rollback),
  ];
}

function argsFor(mode: '--apply' | '--verify-only' | '--rollback', common: string[]) {
  return ['npx', 'tsx', 'scripts/activate-g8-3a-v2.ts', mode, ...common];
}

/** Builds sanitized future commands only. It never imports Firebase or executes any command. */
export function buildG8V2ProductionArgumentArrays(options: PreflightOptions): G8V2ProductionArgumentArrays {
  if (options.shadowSourceCommit !== CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT) throw new Error('preflight shadow source commit is not the certified historical identity');
  if (new Set(Object.values(options.receipts)).size !== 4) throw new Error('preflight requires four distinct operation receipts');
  const bundle = validateLocalProductBundle(readJson(options.bundlePath));
  const manifest = readJson(options.manifestPath) as { release: { generation: string; target: { projectId: string; databaseId: string }; expectedDigests: Record<string, string> } };
  const identity: G8V2ActivationIdentity = { identitySchemaVersion: 2, shadowSourceCommit: options.shadowSourceCommit, activationImplementationCommit: options.activationImplementationCommit };
  const shadowPlan = buildG8ProductShadowWritePlan(bundle, identity.shadowSourceCommit);
  const plan = buildG8V2ActivationPlan(shadowPlan, options.receipts, identity);
  const common = commonArguments(options, manifest, plan);
  const operationArguments = { dryRun: false, apply: false, verifyOnly: false, rollback: false, bundleIn: options.bundlePath, manifest: options.manifestPath, projectId: manifest.release.target.projectId, databaseId: manifest.release.target.databaseId, generation: manifest.release.generation, expectedShadowSourceCommit: identity.shadowSourceCommit, expectedActivationImplementationCommit: identity.activationImplementationCommit, expectedInputDigest: manifest.release.expectedDigests.input, expectedEvidenceDigest: manifest.release.expectedDigests.evidence, expectedPlanDigest: manifest.release.expectedDigests.plan, expectedBundleDigest: manifest.release.expectedDigests.bundle, expectedNamespaceDigest: plan.certifiedDigests.namespace, expectedRaces: String(plan.expectedCounts.races), expectedMeasures: String(plan.expectedCounts.measures), expectedCandidateResearch: String(plan.expectedCounts.candidateResearch), expectedMeasureResearch: String(plan.expectedCounts.measureResearch), expectedMetrics: String(plan.expectedCounts.metrics), expectedContentDocuments: String(plan.expectedCounts.contentDocuments), shadowVerificationReceipt: options.receipts.shadowVerification, promotionReceipt: options.receipts.promotion, activationReceipt: options.receipts.activation, rollbackReceipt: options.receipts.rollback } satisfies G8V2ActivationArguments;
  for (const mode of ['apply', 'verifyOnly', 'rollback'] as const) assertG8V2ActivationGuards({ ...operationArguments, apply: mode === 'apply', verifyOnly: mode === 'verifyOnly', rollback: mode === 'rollback' }, plan, manifest);
  if (options.verifyImplementation !== false) assertCommittedG8V2Implementation(identity);
  return { apply: argsFor('--apply', common), verifyOnly: argsFor('--verify-only', common), rollback: argsFor('--rollback', common), identity, planDigest: plan.planDigest, namespaceDigest: plan.certifiedDigests.namespace, expectedCounts: plan.expectedCounts };
}
