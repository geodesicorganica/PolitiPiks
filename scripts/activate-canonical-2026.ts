import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import type { CanonicalMigrationSnapshot } from './lib/canonicalMigration.js';
import {
  buildCertifiedCanonicalActivationBundle,
  createFirestoreCanonicalActivationStore,
  executeCanonicalActivationPlan,
  rollbackCanonicalActivation,
  verifyCanonicalActivation,
  verifyCertifiedShadowForActivation,
} from './lib/canonicalActivation.js';
import {
  assertCanonicalActivationProductionGuards,
  parseCanonicalActivationArguments,
  resolveCanonicalActivationSnapshot,
} from './lib/canonicalActivationCli.js';

function assertCommittedActivationImplementation() {
  const files = [
    'scripts/activate-canonical-2026.ts',
    'scripts/lib/canonicalActivation.ts',
    'scripts/lib/canonicalActivationCli.ts',
    'scripts/lib/canonicalActivation.test.ts',
    'scripts/lib/canonicalActivationCli.test.ts',
  ];
  const status = execFileSync('git', ['status', '--porcelain', '--', ...files], { encoding: 'utf8' }).trim();
  if (status) throw new Error('uncommitted canonical activation implementation');
}

const arguments_ = parseCanonicalActivationArguments(process.argv.slice(2));
const snapshotPath = resolveCanonicalActivationSnapshot(arguments_.snapshotIn!);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as CanonicalMigrationSnapshot;
const bundle = buildCertifiedCanonicalActivationBundle(snapshot);
const operation = arguments_.rollback ? 'rollback' : arguments_.verifyOnly ? 'verify-only' : arguments_.apply ? 'apply' : 'dry-run';

if (operation === 'dry-run') {
  console.log(JSON.stringify({
    operation, applied: false, writes: 0,
    generation: bundle.plan.certification.generation,
    sourceCommit: bundle.plan.certification.sourceCommit,
    inputDigest: bundle.plan.certification.inputDigest,
    mappingDigest: bundle.plan.certification.mappingDigest,
    planDigest: bundle.plan.certification.planDigest,
    namespaceDigest: bundle.plan.certification.namespaceDigest,
    expectedCounts: bundle.plan.certification.expectedCounts,
    manifestPath: bundle.plan.manifestPath,
    activationOrder: ['pending-manifest', 'canonical-documents', 'active-manifest'],
    rollbackScope: ['catalogActivations/canonical-2026'],
  }, null, 2));
} else {
  assertCanonicalActivationProductionGuards(arguments_);
  assertCommittedActivationImplementation();
  await verifyCertifiedShadowForActivation(bundle);
  const store = await createFirestoreCanonicalActivationStore(bundle.plan);
  const result = operation === 'apply'
    ? await executeCanonicalActivationPlan(store, bundle.plan)
    : operation === 'verify-only'
      ? await verifyCanonicalActivation(store, bundle.plan)
      : await rollbackCanonicalActivation(store, bundle.plan);
  console.log(JSON.stringify({ operation, generation: bundle.plan.certification.generation, ...result }, null, 2));
}
