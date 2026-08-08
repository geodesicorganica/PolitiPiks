import { getCurrentG8V2ActivationImplementationCommit } from './lib/g8V2ActivationCli.js';
import { buildG8V2ProductionArgumentArrays } from './lib/g8V2ActivationPreflight.js';
import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './lib/g8V2Activation.js';

process.env.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-invalid-g8-4a-credentials.json';
const result = buildG8V2ProductionArgumentArrays({
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json',
  bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit(),
  receipts: { shadowVerification: 'g8-4a-shadow-preflight', promotion: 'g8-4a-promotion-preflight', activation: 'g8-4a-activation-preflight', rollback: 'g8-4a-rollback-preflight' },
});
console.log(JSON.stringify({
  identitySchemaVersion: result.identity.identitySchemaVersion,
  shadowSourceCommit: result.identity.shadowSourceCommit,
  activationImplementationCommit: result.identity.activationImplementationCommit,
  expectedCounts: result.expectedCounts,
  namespaceDigest: result.namespaceDigest,
  activationPlanDigest: result.planDigest,
  writes: 0,
  firebaseInitialization: false,
  apply: result.apply,
  verifyOnly: result.verifyOnly,
  rollback: result.rollback,
}, null, 2));
