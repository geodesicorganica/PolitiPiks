import { buildG8V2StateAuditProductionArguments, launchG8V2JsonChild } from './lib/g8V2StateAuditPreflight.js';
import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './lib/g8V2Activation.js';
import { getCurrentG8V2ActivationImplementationCommit, getCurrentG8V2StateAuditImplementationCommit } from './lib/g8V2ActivationCli.js';

const generated = buildG8V2StateAuditProductionArguments({
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json',
  bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit(),
  stateAuditImplementationCommit: getCurrentG8V2StateAuditImplementationCommit(),
  activationReceipts: { shadowVerification: 'g8-4b-shadow-verification-2026-08-08', promotion: 'g8-4b-promotion-2026-08-08', activation: 'g8-4b-selector-activation-2026-08-08', rollback: 'g8-4b-conditional-rollback-2026-08-08' },
  auditReceipt: 'g8-4br0-state-audit-2026-08-08',
});
const startedAt = new Date().toISOString();
const launch = launchG8V2JsonChild(generated.audit);
const childResult = launch.result && typeof launch.result === 'object' && !Array.isArray(launch.result) ? launch.result as Record<string, unknown> : null;
const safeResultSummary = childResult && childResult.contract === 'g8-4br3a-state-audit-result/v1' && (childResult.status === 'completed' || childResult.status === 'failed') && typeof childResult.phase === 'string'
  ? { schemaVersion: childResult.schemaVersion, contract: childResult.contract, status: childResult.status, phase: childResult.phase, failedPhase: childResult.failedPhase ?? null }
  : null;
console.log(JSON.stringify({ phase: 'g8-4br3a-state-audit-launch', startedAt, finishedAt: new Date().toISOString(), launch: launch.evidence, result: safeResultSummary }, null, 2));
process.exit(launch.launcherExitStatus);
