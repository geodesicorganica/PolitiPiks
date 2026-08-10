import { getCurrentG8V2ActivationImplementationCommit } from './lib/g8V2ActivationCli.js';
import { getCurrentG8V2ConflictAnalysisImplementationCommit } from './lib/g8V2ConflictCli.js';
import { buildG8V2ConflictPreflightOutput } from './lib/g8V2ConflictPreflight.js';

process.env.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-invalid-g8-4br5a-credentials.json';
const output = buildG8V2ConflictPreflightOutput({
  bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json',
  snapshotOutPath: '.artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json',
  captureReceipt: 'g8-4br5b-production-conflict-capture',
  activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit(),
  conflictAnalysisImplementationCommit: getCurrentG8V2ConflictAnalysisImplementationCommit(),
});
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
