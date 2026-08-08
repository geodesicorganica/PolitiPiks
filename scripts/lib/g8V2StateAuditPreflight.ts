import { readFileSync } from 'node:fs';
import { buildG8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, type G8V2AuthorizationReceipts } from './g8V2Activation.js';
import { assertCommittedG8V2Implementation, assertCommittedG8V2StateAuditImplementation } from './g8V2ActivationCli.js';
import { validateLocalProductBundle } from './localProductBundle.js';

export type G8V2StateAuditPreflightOptions = {
  manifestPath: string;
  bundlePath: string;
  shadowSourceCommit: string;
  activationImplementationCommit: string;
  stateAuditImplementationCommit: string;
  activationReceipts: G8V2AuthorizationReceipts;
  auditReceipt: string;
};

export type G8V2StateAuditProductionArguments = { audit: string[]; identity: { activationImplementationCommit: string; stateAuditImplementationCommit: string }; expectedCounts: ReturnType<typeof buildG8ProductShadowWritePlan>['expectedCounts']; planDigest: string; namespaceDigest: string };
const flag = (name: string, value: string | number) => [name, String(value)];
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as any;

/** Builds the complete production audit command from certified local inputs;
 * it does not import Firebase or execute a command. */
export function buildG8V2StateAuditProductionArguments(options: G8V2StateAuditPreflightOptions): G8V2StateAuditProductionArguments {
  if (options.shadowSourceCommit !== CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT) throw new Error('state audit shadow source commit is not certified');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(options.auditReceipt)) throw new Error('invalid state audit receipt');
  const bundle = validateLocalProductBundle(readJson(options.bundlePath));
  const manifest = readJson(options.manifestPath);
  const shadowPlan = buildG8ProductShadowWritePlan(bundle, options.shadowSourceCommit);
  const plan = buildG8V2ActivationPlan(shadowPlan, options.activationReceipts, { identitySchemaVersion: 2, shadowSourceCommit: options.shadowSourceCommit, activationImplementationCommit: options.activationImplementationCommit });
  assertCommittedG8V2Implementation({ identitySchemaVersion: 2, shadowSourceCommit: options.shadowSourceCommit, activationImplementationCommit: options.activationImplementationCommit });
  assertCommittedG8V2StateAuditImplementation(options.stateAuditImplementationCommit);
  const common = [
    ...flag('--bundle-in', options.bundlePath), ...flag('--manifest', options.manifestPath),
    ...flag('--project-id', manifest.release.target.projectId), ...flag('--database-id', manifest.release.target.databaseId), ...flag('--generation', manifest.release.generation),
    ...flag('--expected-shadow-source-commit', plan.shadowSourceCommit), ...flag('--expected-activation-implementation-commit', plan.activationImplementationCommit), ...flag('--expected-state-audit-implementation-commit', options.stateAuditImplementationCommit),
    ...flag('--expected-input-digest', manifest.release.expectedDigests.input), ...flag('--expected-evidence-digest', manifest.release.expectedDigests.evidence), ...flag('--expected-plan-digest', manifest.release.expectedDigests.plan), ...flag('--expected-bundle-digest', manifest.release.expectedDigests.bundle), ...flag('--expected-namespace-digest', plan.certifiedDigests.namespace),
    ...flag('--expected-races', plan.expectedCounts.races), ...flag('--expected-measures', plan.expectedCounts.measures), ...flag('--expected-candidate-research', plan.expectedCounts.candidateResearch), ...flag('--expected-measure-research', plan.expectedCounts.measureResearch), ...flag('--expected-metrics', plan.expectedCounts.metrics), ...flag('--expected-content-documents', plan.expectedCounts.contentDocuments),
    ...flag('--shadow-verification-receipt', options.activationReceipts.shadowVerification), ...flag('--promotion-receipt', options.activationReceipts.promotion), ...flag('--activation-receipt', options.activationReceipts.activation), ...flag('--rollback-receipt', options.activationReceipts.rollback), ...flag('--audit-receipt', options.auditReceipt),
  ];
  return { audit: ['npx', 'tsx', 'scripts/audit-g8-4br0-state.ts', '--audit', ...common], identity: { activationImplementationCommit: options.activationImplementationCommit, stateAuditImplementationCommit: options.stateAuditImplementationCommit }, expectedCounts: plan.expectedCounts, planDigest: plan.planDigest, namespaceDigest: plan.certifiedDigests.namespace };
}
