import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { buildG8ProductShadowWritePlan, CERTIFIED_G8_PRODUCT_SHADOW } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './g8V2Activation.js';
import { getCurrentG8V2ActivationImplementationCommit } from './g8V2ActivationCli.js';
import { validateG8ReleaseManifest } from './g8ReleaseReadiness.js';
import { validateLocalProductBundle } from './localProductBundle.js';

export const G8_V2_CONFLICT_PRIVATE_ROOT = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
export const G8_V2_CONFLICT_DEFAULT_BUNDLE = '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json';
export const G8_V2_CONFLICT_DEFAULT_MANIFEST = 'docs/g8-catalog-beta-release-manifest.json';

export const G8_V2_CONFLICT_FOCUSED_FILES = [
  'package.json',
  'scripts/report-g8-4br5a-conflicts.ts',
  'scripts/verify-g8-4br5a-conflict-capture-preflight.ts',
  'scripts/lib/g8V2ConflictAnalysis.ts',
  'scripts/lib/g8V2ConflictCapture.ts',
  'scripts/lib/g8V2ConflictCaptureLive.ts',
  'scripts/lib/g8V2ConflictCli.ts',
  'scripts/lib/g8V2ConflictPreflight.ts',
] as const;

export type G8V2ConflictCliArguments = {
  mode: 'snapshot-in' | 'snapshot-out';
  snapshotPath: string;
  bundlePath: string;
  manifestPath: string;
  verifyReplay: boolean;
  comparisons: Array<{ label: string; path: string }>;
  projectId?: string;
  databaseId?: string;
  generation?: string;
  expectedShadowSourceCommit?: string;
  expectedActivationImplementationCommit?: string;
  expectedConflictAnalysisImplementationCommit?: string;
  expectedNamespaceDigest?: string;
  expectedActivationPlanDigest?: string;
  expectedContentDocuments?: string;
  captureReceipt?: string;
};

const valueFlags = new Set([
  '--snapshot-in','--snapshot-out','--bundle-in','--manifest','--comparison-bundle','--project-id','--database-id','--generation',
  '--expected-shadow-source-commit','--expected-activation-implementation-commit','--expected-conflict-analysis-implementation-commit',
  '--expected-namespace-digest','--expected-activation-plan-digest','--expected-content-documents','--capture-receipt',
]);

export function resolveG8V2ConflictPrivateJsonPath(path: string, flag: string) {
  const resolved = resolve(process.cwd(), path);
  const relativePath = relative(G8_V2_CONFLICT_PRIVATE_ROOT, resolved);
  if (!relativePath || relativePath.startsWith('..') || resolve(G8_V2_CONFLICT_PRIVATE_ROOT, relativePath) !== resolved || !resolved.toLowerCase().endsWith('.json')) {
    throw new Error(`${flag} must be a .json file beneath the ignored private canonical-migration directory`);
  }
  return resolved;
}

export function isG8V2ConflictPrivateRootIgnored() {
  return readFileSync('.gitignore', 'utf8').split(/\r?\n/).includes('.artifacts/private/canonical-migration/');
}

export function parseG8V2ConflictCliArguments(argv: readonly string[]): G8V2ConflictCliArguments {
  const values = new Map<string, string>();
  const comparisons: Array<{ label: string; path: string }> = [];
  let verifyReplay = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--verify-replay') { if (verifyReplay) throw new Error('duplicate --verify-replay'); verifyReplay = true; continue; }
    if (!valueFlags.has(flag)) throw new Error(`unsupported conflict-analysis argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    if (flag === '--comparison-bundle') {
      const separator = value.indexOf('=');
      const label = separator > 0 ? value.slice(0, separator) : '';
      const path = separator > 0 ? value.slice(separator + 1) : '';
      if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(label) || !path) throw new Error('--comparison-bundle requires label=private-json-path');
      comparisons.push({ label, path: resolveG8V2ConflictPrivateJsonPath(path, '--comparison-bundle') });
    } else {
      if (values.has(flag)) throw new Error(`duplicate ${flag}`);
      values.set(flag, value);
    }
    index += 1;
  }
  const snapshotIn = values.get('--snapshot-in');
  const snapshotOut = values.get('--snapshot-out');
  if (Boolean(snapshotIn) === Boolean(snapshotOut)) throw new Error('provide exactly one of --snapshot-in or --snapshot-out');
  const mode = snapshotIn ? 'snapshot-in' as const : 'snapshot-out' as const;
  if (mode === 'snapshot-out' && verifyReplay) throw new Error('--verify-replay is offline-only');
  if (mode === 'snapshot-out' && comparisons.length) throw new Error('comparison bundles are offline-only');
  return {
    mode,
    snapshotPath: resolveG8V2ConflictPrivateJsonPath((snapshotIn ?? snapshotOut)!, `--${mode}`),
    bundlePath: values.get('--bundle-in') ?? G8_V2_CONFLICT_DEFAULT_BUNDLE,
    manifestPath: values.get('--manifest') ?? G8_V2_CONFLICT_DEFAULT_MANIFEST,
    verifyReplay,
    comparisons,
    projectId: values.get('--project-id'), databaseId: values.get('--database-id'), generation: values.get('--generation'),
    expectedShadowSourceCommit: values.get('--expected-shadow-source-commit'), expectedActivationImplementationCommit: values.get('--expected-activation-implementation-commit'),
    expectedConflictAnalysisImplementationCommit: values.get('--expected-conflict-analysis-implementation-commit'), expectedNamespaceDigest: values.get('--expected-namespace-digest'),
    expectedActivationPlanDigest: values.get('--expected-activation-plan-digest'), expectedContentDocuments: values.get('--expected-content-documents'), captureReceipt: values.get('--capture-receipt'),
  };
}

export function buildG8V2ConflictCertifiedPlan(bundlePath = G8_V2_CONFLICT_DEFAULT_BUNDLE, manifestPath = G8_V2_CONFLICT_DEFAULT_MANIFEST) {
  const bundle = validateLocalProductBundle(JSON.parse(readFileSync(bundlePath, 'utf8')));
  validateG8ReleaseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), bundle);
  const activationImplementationCommit = getCurrentG8V2ActivationImplementationCommit();
  const shadow = buildG8ProductShadowWritePlan(bundle, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT);
  const plan = buildG8V2ActivationPlan(shadow, {
    shadowVerification: 'g8-4br5b-conflict-capture-shadow-reference',
    promotion: 'g8-4br5b-conflict-capture-promotion-not-authorized',
    activation: 'g8-4br5b-conflict-capture-activation-not-authorized',
    rollback: 'g8-4br5b-conflict-capture-rollback-not-authorized',
  }, { identitySchemaVersion: 2, shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, activationImplementationCommit });
  return { bundle, plan, activationImplementationCommit };
}

export function getCurrentG8V2ConflictAnalysisImplementationCommit() {
  return execFileSync('git', ['log','-1','--format=%H','--', ...G8_V2_CONFLICT_FOCUSED_FILES], { encoding: 'utf8' }).trim();
}

export function assertCommittedG8V2ConflictAnalysisImplementation(expected: string) {
  if (!/^[a-f0-9]{40}$/.test(expected)) throw new Error('invalid conflict-analysis implementation identity');
  const status = execFileSync('git', ['status','--porcelain','--', ...G8_V2_CONFLICT_FOCUSED_FILES], { encoding: 'utf8' }).trim();
  const current = getCurrentG8V2ConflictAnalysisImplementationCommit();
  if (status || current !== expected) throw new Error('stale or dirty conflict-analysis implementation identity');
  return expected;
}

export function assertG8V2ConflictLiveGuards(args: G8V2ConflictCliArguments, plan: ReturnType<typeof buildG8V2ConflictCertifiedPlan>['plan'], options: { verifyImplementation?: boolean } = {}) {
  if (args.mode !== 'snapshot-out') throw new Error('live conflict guards require --snapshot-out');
  if (existsSync(args.snapshotPath)) throw new Error('conflict snapshot output already exists; refusing overwrite');
  if (!isG8V2ConflictPrivateRootIgnored()) throw new Error('private canonical-migration directory is not ignored');
  if (args.projectId !== CERTIFIED_G8_PRODUCT_SHADOW.projectId || args.databaseId !== CERTIFIED_G8_PRODUCT_SHADOW.databaseId || args.generation !== CERTIFIED_G8_PRODUCT_SHADOW.generation
    || args.expectedShadowSourceCommit !== plan.shadowSourceCommit || args.expectedActivationImplementationCommit !== plan.activationImplementationCommit
    || args.expectedConflictAnalysisImplementationCommit === undefined || args.expectedNamespaceDigest !== plan.certifiedDigests.namespace
    || args.expectedActivationPlanDigest !== plan.planDigest || args.expectedContentDocuments !== '3352'
    || !args.captureReceipt || !/^g8-4br5b-[a-z0-9._:-]+$/.test(args.captureReceipt)) throw new Error('missing or mismatched G8.4BR5 future capture guard');
  if (options.verifyImplementation !== false) assertCommittedG8V2ConflictAnalysisImplementation(args.expectedConflictAnalysisImplementationCommit);
  return { conflictAnalysisImplementationCommit: args.expectedConflictAnalysisImplementationCommit, captureReceipt: args.captureReceipt };
}
