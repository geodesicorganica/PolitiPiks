import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './lib/g8V2Activation.js';
import { getCurrentG8V2ActivationImplementationCommit } from './lib/g8V2ActivationCli.js';
import { buildG8V2ActivationPreflightOutput } from './lib/g8V2ActivationPreflight.js';

process.env.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-invalid-g8-4br4a-credentials.json';
const output = buildG8V2ActivationPreflightOutput({
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json',
  bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit(),
  receipts: {
    shadowVerification: 'g8-4br4b-shadow-verification',
    promotion: 'g8-4br4b-content-promotion',
    activation: 'g8-4br4b-selector-activation',
    rollback: 'g8-4br4b-selector-rollback',
  },
});
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
