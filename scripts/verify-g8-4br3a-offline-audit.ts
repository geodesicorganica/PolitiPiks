import { buildG8V2StateAuditProductionArguments, parseG8V2StateAuditPreflightOutput } from './lib/g8V2StateAuditPreflight.js';
import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './lib/g8V2Activation.js';
import { getCurrentG8V2ActivationImplementationCommit, getCurrentG8V2StateAuditImplementationCommit } from './lib/g8V2ActivationCli.js';
import { runG8V2StructuredAudit } from './lib/g8V2StructuredAuditRunner.js';

const generated = buildG8V2StateAuditProductionArguments({
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json', bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit(), stateAuditImplementationCommit: getCurrentG8V2StateAuditImplementationCommit(),
  activationReceipts: { shadowVerification: 'g8-4b-shadow-verification-2026-08-08', promotion: 'g8-4b-promotion-2026-08-08', activation: 'g8-4b-selector-activation-2026-08-08', rollback: 'g8-4b-conditional-rollback-2026-08-08' }, auditReceipt: 'g8-4br0-state-audit-2026-08-08',
});
const result = await runG8V2StructuredAudit(generated.audit.arguments.slice(2), {
  loadDotenv: () => {},
  validateEnvironment: () => ({ credentialPathConfigured: false, credentialPathExists: null, credentialJsonParseable: null, requiredCredentialFieldsValid: null, configuredProjectMatches: true, configuredDatabaseMatches: true, unsafeFlagsPresent: false }),
  offlineBootstrap: true,
  bootstrap: async () => ({ get: async () => null }),
});
if (result.status !== 'completed' || result.selector.state !== 'absent' || result.firebase.initialization !== 'not-attempted' || result.firebase.bootstrap !== 'not-attempted' || result.reads.exactPaths.notAttempted !== 3352) throw new Error('offline structured audit replay failed its zero-Firebase boundary');
const preflight = parseG8V2StateAuditPreflightOutput(JSON.stringify({ phase: 'g8-4br3a-firebase-free-preflight', firebaseInitialization: false, reads: 0, writes: 0, identity: generated.identity, expectedCounts: generated.expectedCounts, planDigest: generated.planDigest, namespaceDigest: generated.namespaceDigest, audit: generated.audit }));
console.log(JSON.stringify({ phase: 'g8-4br3a-offline-audit-replay', firebaseInitialization: false, replayedArguments: generated.audit.arguments.length, structuredResult: result, canonicalReceipt: preflight.receipt, canonicalDigest: preflight.digest }, null, 2));
