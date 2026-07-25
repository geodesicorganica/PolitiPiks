import { CERTIFIED_CANONICAL_ACTIVATION } from './canonicalActivation.js';
import { resolvePrivateSnapshotInputPath } from './canonicalShadowCli.js';

export type CanonicalActivationArguments = {
  apply: boolean;
  verifyOnly: boolean;
  rollback: boolean;
  snapshotIn?: string;
  projectId?: string;
  databaseId?: string;
  generation?: string;
  expectedSourceCommit?: string;
  expectedInputDigest?: string;
  expectedMappingDigest?: string;
  expectedPlanDigest?: string;
  expectedNamespaceDigest?: string;
  expectedRaces?: string;
  expectedResearch?: string;
  expectedMetrics?: string;
};

type ValueKey = Exclude<keyof CanonicalActivationArguments, 'apply' | 'verifyOnly' | 'rollback'>;
const values: Record<string, ValueKey> = {
  '--snapshot-in': 'snapshotIn', '--project-id': 'projectId', '--database-id': 'databaseId', '--generation': 'generation',
  '--expected-source-commit': 'expectedSourceCommit', '--expected-input-digest': 'expectedInputDigest',
  '--expected-mapping-digest': 'expectedMappingDigest', '--expected-plan-digest': 'expectedPlanDigest',
  '--expected-namespace-digest': 'expectedNamespaceDigest', '--expected-races': 'expectedRaces',
  '--expected-research': 'expectedResearch', '--expected-metrics': 'expectedMetrics',
};

/** Direct-launch-only parser: npm config/positional fallbacks are deliberately unsupported. */
export function parseCanonicalActivationArguments(argv: string[]): CanonicalActivationArguments {
  const arguments_: CanonicalActivationArguments = { apply: false, verifyOnly: false, rollback: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') { arguments_.apply = true; continue; }
    if (argument === '--verify-only') { arguments_.verifyOnly = true; continue; }
    if (argument === '--rollback') { arguments_.rollback = true; continue; }
    const key = values[argument];
    if (!key) throw new Error(`unsupported argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${argument}`);
    if (arguments_[key]) throw new Error(`duplicate argument: ${argument}`);
    arguments_[key] = value;
    index += 1;
  }
  if (Number(arguments_.apply) + Number(arguments_.verifyOnly) + Number(arguments_.rollback) > 1) throw new Error('use either --apply, --verify-only, or --rollback');
  if (!arguments_.snapshotIn) throw new Error('supply --snapshot-in <private ignored file>');
  return arguments_;
}

export function resolveCanonicalActivationSnapshot(path: string) {
  return resolvePrivateSnapshotInputPath(path);
}

export function assertCanonicalActivationProductionGuards(arguments_: CanonicalActivationArguments) {
  const expected = CERTIFIED_CANONICAL_ACTIVATION;
  if (arguments_.projectId !== expected.projectId || arguments_.databaseId !== expected.databaseId || arguments_.generation !== expected.generation
    || arguments_.expectedSourceCommit !== expected.shadowSourceCommit || arguments_.expectedInputDigest !== expected.inputDigest
    || arguments_.expectedMappingDigest !== expected.mappingDigest || arguments_.expectedPlanDigest !== expected.planDigest
    || arguments_.expectedNamespaceDigest !== expected.namespaceDigest || arguments_.expectedRaces !== String(expected.expectedRaces)
    || arguments_.expectedResearch !== String(expected.expectedResearch) || arguments_.expectedMetrics !== String(expected.expectedMetrics)) {
    throw new Error('missing or mismatched activation production guard');
  }
}
