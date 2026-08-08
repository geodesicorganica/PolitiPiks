import { buildG8V2StateAuditProductionArguments } from './lib/g8V2StateAuditPreflight.js';
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
console.log(JSON.stringify({ phase: 'g8-4br0-firebase-free-preflight', firebaseInitialization: false, reads: 0, writes: 0, identity: generated.identity, expectedCounts: generated.expectedCounts, planDigest: generated.planDigest, namespaceDigest: generated.namespaceDigest, audit: generated.audit }, null, 2));
