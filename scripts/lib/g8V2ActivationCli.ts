import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CERTIFIED_G8_PRODUCT_SHADOW } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, type G8V2AuthorizationReceipts } from './g8V2Activation.js';
import { validateLocalProductBundle } from './localProductBundle.js';
import { buildG8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { validateG8ReleaseManifest } from './g8ReleaseReadiness.js';

export type G8V2ActivationArguments = {
  dryRun: boolean;
  apply: boolean;
  verifyOnly: boolean;
  rollback: boolean;
  bundleIn?: string;
  manifest?: string;
  projectId?: string;
  databaseId?: string;
  generation?: string;
  expectedSourceCommit?: string;
  expectedInputDigest?: string;
  expectedEvidenceDigest?: string;
  expectedPlanDigest?: string;
  expectedBundleDigest?: string;
  expectedNamespaceDigest?: string;
  expectedRaces?: string;
  expectedMeasures?: string;
  expectedCandidateResearch?: string;
  expectedMeasureResearch?: string;
  expectedMetrics?: string;
  expectedContentDocuments?: string;
  shadowVerificationReceipt?: string;
  promotionReceipt?: string;
  activationReceipt?: string;
  rollbackReceipt?: string;
};

type ValueKey = Exclude<keyof G8V2ActivationArguments, 'dryRun' | 'apply' | 'verifyOnly' | 'rollback'>;
const values: Record<string, ValueKey> = {
  '--bundle-in': 'bundleIn', '--manifest': 'manifest', '--project-id': 'projectId', '--database-id': 'databaseId', '--generation': 'generation', '--expected-source-commit': 'expectedSourceCommit',
  '--expected-input-digest': 'expectedInputDigest', '--expected-evidence-digest': 'expectedEvidenceDigest', '--expected-plan-digest': 'expectedPlanDigest', '--expected-bundle-digest': 'expectedBundleDigest', '--expected-namespace-digest': 'expectedNamespaceDigest',
  '--expected-races': 'expectedRaces', '--expected-measures': 'expectedMeasures', '--expected-candidate-research': 'expectedCandidateResearch', '--expected-measure-research': 'expectedMeasureResearch', '--expected-metrics': 'expectedMetrics', '--expected-content-documents': 'expectedContentDocuments',
  '--shadow-verification-receipt': 'shadowVerificationReceipt', '--promotion-receipt': 'promotionReceipt', '--activation-receipt': 'activationReceipt', '--rollback-receipt': 'rollbackReceipt',
};

export function parseG8V2ActivationArguments(argv: string[]): G8V2ActivationArguments {
  const result: G8V2ActivationArguments = { dryRun: false, apply: false, verifyOnly: false, rollback: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') { result.dryRun = true; continue; }
    if (argument === '--apply') { result.apply = true; continue; }
    if (argument === '--verify-only') { result.verifyOnly = true; continue; }
    if (argument === '--rollback') { result.rollback = true; continue; }
    const key = values[argument];
    if (!key) throw new Error(`unsupported argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${argument}`);
    if (result[key]) throw new Error(`duplicate argument: ${argument}`);
    result[key] = value;
    index += 1;
  }
  if (Number(result.dryRun) + Number(result.apply) + Number(result.verifyOnly) + Number(result.rollback) !== 1) throw new Error('use exactly one of --dry-run, --apply, --verify-only, or --rollback');
  if (!result.bundleIn) throw new Error('supply --bundle-in <certified local product bundle>');
  return result;
}

export function resolveG8V2Bundle(path: string) {
  const resolved = resolve(path);
  const privateRoot = resolve('.artifacts/private/canonical-migration');
  if (!resolved.startsWith(`${privateRoot}\\`) || !resolved.endsWith('g7-1-local-product-bundle.json')) throw new Error('bundle must be the certified private G7.1 local product artifact');
  return resolved;
}

export function buildG8V2Receipts(arguments_: G8V2ActivationArguments): G8V2AuthorizationReceipts {
  const receipts = { shadowVerification: arguments_.shadowVerificationReceipt, promotion: arguments_.promotionReceipt, activation: arguments_.activationReceipt, rollback: arguments_.rollbackReceipt };
  if (!Object.values(receipts).every((value) => value && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value))) throw new Error('missing operation-specific g8.3a authorization receipt');
  return receipts as G8V2AuthorizationReceipts;
}

export function loadG8V2ActivationPlan(arguments_: G8V2ActivationArguments) {
  const bundle = validateLocalProductBundle(JSON.parse(readFileSync(resolveG8V2Bundle(arguments_.bundleIn!), 'utf8')));
  const shadowPlan = buildG8ProductShadowWritePlan(bundle, arguments_.expectedSourceCommit ?? '0000000000000000000000000000000000000000');
  return buildG8V2ActivationPlan(shadowPlan, buildG8V2Receipts(arguments_), arguments_.expectedSourceCommit ?? shadowPlan.sourceCommit);
}

export function assertG8V2ActivationGuards(arguments_: G8V2ActivationArguments, plan: ReturnType<typeof loadG8V2ActivationPlan>, manifestValue: unknown) {
  validateG8ReleaseManifest(manifestValue, validateLocalProductBundle(JSON.parse(readFileSync(resolveG8V2Bundle(arguments_.bundleIn!), 'utf8'))));
  const release = (manifestValue as { release: { generation: string; target: { projectId: string; databaseId: string }; expectedDigests: { input: string; evidence: string; plan: string; bundle: string } } }).release;
  const expected = {
    projectId: release.target.projectId, databaseId: release.target.databaseId, generation: release.generation,
    input: release.expectedDigests.input, evidence: release.expectedDigests.evidence, plan: release.expectedDigests.plan, bundle: release.expectedDigests.bundle,
    namespace: CERTIFIED_G8_PRODUCT_SHADOW.bundleDigest,
  };
  if (arguments_.projectId !== expected.projectId || arguments_.databaseId !== expected.databaseId || arguments_.generation !== expected.generation
    || arguments_.expectedInputDigest !== expected.input || arguments_.expectedEvidenceDigest !== expected.evidence || arguments_.expectedPlanDigest !== expected.plan || arguments_.expectedBundleDigest !== expected.bundle
    || arguments_.expectedNamespaceDigest !== plan.certifiedDigests.namespace || arguments_.expectedRaces !== '470' || arguments_.expectedMeasures !== '14' || arguments_.expectedCandidateResearch !== '2384' || arguments_.expectedMeasureResearch !== '14' || arguments_.expectedMetrics !== '470' || arguments_.expectedContentDocuments !== '3352') throw new Error('missing or mismatched g8.3a activation guard');
  if (plan.target.projectId !== expected.projectId || plan.target.databaseId !== expected.databaseId || plan.generation !== expected.generation) throw new Error('offline activation plan does not match release manifest');
  return release;
}

export function assertCommittedG8V2Implementation(expectedSourceCommit: string) {
  if (!/^[a-f0-9]{7,64}$/i.test(expectedSourceCommit)) throw new Error('committed implementation source commit is required');
  const files = ['package.json', 'scripts/activate-g8-3a-v2.ts', 'scripts/lib/g8V2Activation.ts', 'scripts/lib/g8V2ActivationCli.ts'];
  const status = execFileSync('git', ['status', '--porcelain', '--', ...files], { encoding: 'utf8' });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (status.trim() || head !== expectedSourceCommit) throw new Error('uncommitted or mismatched g8.3a activation implementation');
  return head;
}
