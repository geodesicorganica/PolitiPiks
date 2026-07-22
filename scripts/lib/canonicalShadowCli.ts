import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { CANONICAL_SHADOW_GENERATION, CERTIFIED_CANONICAL_SHADOW } from './canonicalShadowExecutor.js';

export type CanonicalShadowArguments = {
  apply: boolean;
  verifyOnly: boolean;
  projectId?: string;
  databaseId?: string;
  generation?: string;
  expectedInputDigest?: string;
  expectedMappingDigest?: string;
  expectedPlanDigest?: string;
  expectedRaces?: string;
  expectedResearch?: string;
  expectedMetrics?: string;
  snapshotIn?: string;
};
type ValueArgument = Exclude<keyof CanonicalShadowArguments, 'apply' | 'verifyOnly'>;

const values: Record<string, ValueArgument> = {
  '--project-id': 'projectId', '--database-id': 'databaseId', '--generation': 'generation',
  '--expected-input-digest': 'expectedInputDigest', '--expected-mapping-digest': 'expectedMappingDigest', '--expected-plan-digest': 'expectedPlanDigest',
  '--expected-races': 'expectedRaces', '--expected-research': 'expectedResearch', '--expected-metrics': 'expectedMetrics', '--snapshot-in': 'snapshotIn',
};

export function parseCanonicalShadowArguments(argv: string[], environment: NodeJS.ProcessEnv = process.env): CanonicalShadowArguments {
  const arguments_: CanonicalShadowArguments = { apply: false, verifyOnly: false };
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
  if (!arguments_.snapshotIn && positional.length === 1) arguments_.snapshotIn = positional[0];
  if (positional.length > 1) throw new Error('unexpected positional arguments');
  for (const [flag, target] of Object.entries(values)) {
    if (!arguments_[target]) {
      const value = npmConfig(flag.slice(2));
      if (value) arguments_[target] = value;
    }
  }
  if (arguments_.apply && arguments_.verifyOnly) throw new Error('use either --apply or --verify-only, not both');
  if (!arguments_.snapshotIn) throw new Error('supply --snapshot-in <private ignored file>');
  return arguments_;
}

export function resolvePrivateSnapshotInputPath(path: string, cwd = process.cwd()) {
  const snapshotRoot = resolve(cwd, '.artifacts', 'private', 'canonical-migration');
  const resolved = resolve(cwd, path);
  const relativePath = relative(snapshotRoot, resolved);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath) || !resolved.toLowerCase().endsWith('.json')) {
    throw new Error(`--snapshot-in must be a .json file beneath ${snapshotRoot}`);
  }
  if (!existsSync(resolved)) throw new Error(`snapshot file does not exist: ${resolved}`);
  return resolved;
}

export function assertCanonicalShadowProductionGuards(arguments_: CanonicalShadowArguments) {
  const expected = CERTIFIED_CANONICAL_SHADOW;
  if (arguments_.projectId !== expected.projectId || arguments_.databaseId !== expected.databaseId || arguments_.generation !== CANONICAL_SHADOW_GENERATION
    || arguments_.expectedInputDigest !== expected.inputDigest || arguments_.expectedMappingDigest !== expected.mappingDigest || arguments_.expectedPlanDigest !== expected.planDigest
    || arguments_.expectedRaces !== String(expected.expectedRaces) || arguments_.expectedResearch !== String(expected.expectedResearch)
    || arguments_.expectedMetrics !== String(expected.expectedMetrics)) throw new Error('missing or mismatched production guard');
}
