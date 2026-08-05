import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { CERTIFIED_G8_PRODUCT_SHADOW, G8_PRODUCT_SHADOW_GENERATION, type G8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';

export type G8ProductShadowArguments = {
  apply: boolean;
  verifyOnly: boolean;
  projectId?: string;
  databaseId?: string;
  generation?: string;
  expectedInputDigest?: string;
  expectedEvidenceDigest?: string;
  expectedPlanDigest?: string;
  expectedBundleDigest?: string;
  expectedRaces?: string;
  expectedMeasures?: string;
  expectedCandidateResearch?: string;
  expectedMeasureResearch?: string;
  expectedMetrics?: string;
  expectedContentDocuments?: string;
  authorizationReceiptId?: string;
  bundleIn?: string;
};

type ValueArgument = Exclude<keyof G8ProductShadowArguments, 'apply' | 'verifyOnly'>;
const values: Record<string, ValueArgument> = {
  '--project-id': 'projectId', '--database-id': 'databaseId', '--generation': 'generation',
  '--expected-input-digest': 'expectedInputDigest', '--expected-evidence-digest': 'expectedEvidenceDigest',
  '--expected-plan-digest': 'expectedPlanDigest', '--expected-bundle-digest': 'expectedBundleDigest',
  '--expected-races': 'expectedRaces', '--expected-measures': 'expectedMeasures', '--expected-candidate-research': 'expectedCandidateResearch',
  '--expected-measure-research': 'expectedMeasureResearch', '--expected-metrics': 'expectedMetrics', '--expected-content-documents': 'expectedContentDocuments',
  '--authorization-receipt-id': 'authorizationReceiptId', '--bundle-in': 'bundleIn', '--snapshot-in': 'bundleIn',
};

export function parseG8ProductShadowArguments(argv: string[], environment: NodeJS.ProcessEnv = process.env): G8ProductShadowArguments {
  const arguments_: G8ProductShadowArguments = { apply: false, verifyOnly: false };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') { arguments_.apply = true; continue; }
    if (argument === '--verify-only') { arguments_.verifyOnly = true; continue; }
    const target = values[argument];
    if (!target) {
      if (!argument.startsWith('--')) { positional.push(argument); continue; }
      throw new Error(`unsupported argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${argument}`);
    arguments_[target] = value;
    index += 1;
  }
  const npmConfig = (name: string) => environment[`npm_config_${name.replace(/-/g, '_')}`];
  arguments_.apply ||= npmConfig('apply') === 'true';
  arguments_.verifyOnly ||= npmConfig('verify-only') === 'true';
  if (!arguments_.bundleIn && positional.length === 1) arguments_.bundleIn = positional[0];
  if (positional.length > 1) throw new Error('unexpected positional arguments');
  for (const [flag, target] of Object.entries(values)) if (!arguments_[target]) {
    const value = npmConfig(flag.replace(/^--/, ''));
    if (value) arguments_[target] = value;
  }
  if (arguments_.apply && arguments_.verifyOnly) throw new Error('use either --apply or --verify-only, not both');
  return arguments_;
}

export function resolveG8ProductBundleInputPath(path = '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', cwd = process.cwd()) {
  const privateRoot = resolve(cwd, '.artifacts', 'private', 'canonical-migration');
  const resolved = resolve(cwd, path);
  const relativePath = relative(privateRoot, resolved);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
    || !resolved.toLowerCase().endsWith('.json') || !resolved.toLowerCase().endsWith('g7-1-local-product-bundle.json')) {
    throw new Error(`--bundle-in must be the certified bundle beneath ${privateRoot}`);
  }
  if (!existsSync(resolved)) throw new Error(`bundle file does not exist: ${resolved}`);
  return resolved;
}

function expectedCounts() {
  return CERTIFIED_G8_PRODUCT_SHADOW.expectedCounts;
}

/** Production apply/verify requires every release identity, digest, count, and an explicit receipt. */
export function assertG8ProductShadowProductionGuards(arguments_: G8ProductShadowArguments, plan: G8ProductShadowWritePlan, committedSource?: string) {
  const expected = CERTIFIED_G8_PRODUCT_SHADOW;
  const counts = expectedCounts();
  if ((!arguments_.apply && !arguments_.verifyOnly) || arguments_.projectId !== expected.projectId || arguments_.databaseId !== expected.databaseId
    || arguments_.generation !== G8_PRODUCT_SHADOW_GENERATION || arguments_.expectedInputDigest !== expected.inputDigest
    || arguments_.expectedEvidenceDigest !== expected.evidenceDigest || arguments_.expectedPlanDigest !== expected.planDigest
    || arguments_.expectedBundleDigest !== expected.bundleDigest || arguments_.expectedRaces !== String(counts.races)
    || arguments_.expectedMeasures !== String(counts.measures) || arguments_.expectedCandidateResearch !== String(counts.candidateResearch)
    || arguments_.expectedMeasureResearch !== String(counts.measureResearch) || arguments_.expectedMetrics !== String(counts.metrics)
    || arguments_.expectedContentDocuments !== String(counts.contentDocuments)
    || !arguments_.authorizationReceiptId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(arguments_.authorizationReceiptId)
    || (committedSource !== undefined && committedSource !== plan.sourceCommit)) throw new Error('missing or mismatched v2 production guard');
}

export function readG8ProductBundle(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
