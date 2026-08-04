import { localProductDigest, type LocalProductBundle } from './localProductBundle.js';

type Json = Record<string, unknown>;
type Stage = { id: string; operation: string; authorizationBoundary: string; authorizationRequired: boolean };
type RollbackPath = { id: string; action: string; dataDeletionAllowed: boolean; selectorChangeAllowed: boolean };

const EXPECTED_STAGES = ['preflight', 'fresh-bounded-capture', 'offline-certification', 'shadow-write', 'namespace-verification', 'rules-deployment', 'app-deployment', 'selector-activation', 'smoke-verification', 'observation-window'];
const EXPECTED_STOPS = ['digest-count-drift', 'unresolved-references', 'incompatible-predictions', 'publication-readiness-regression', 'dirty-release-scope', 'wrong-project-database', 'wrong-branch-commit', 'unsafe-environment-flags', 'partial-writes', 'failed-smoke-tests', 'missing-rollback-evidence'];
const EXPECTED_ROLLBACKS = ['before-selector-activation', 'selector-rollback-after-activation', 'rules-rollback', 'application-rollback', 'partial-or-failed-shadow-write'];
const EXPECTED_COUNTS = { races: 470, measures: 14, candidateResearch: 2384, measureResearch: 14, metrics: 470, selectors: 1, total: 3353 };
const EXPECTED_READINESS = { catalogReady: true, researchReady: true, metricsReady: true, predictionReadyRaces: 0, predictionReadyMeasures: 14 };
const EXPECTED_AUDIT = { duplicatePaths: 0, orphanDocuments: 0, unresolvedReferences: 0, leakage: 0 };
const EXPECTED_TARGET = { projectId: 'politipiks', databaseId: 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a' };

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };

function arrayOfRecords(value: unknown, name: string): Json[] {
  assert(Array.isArray(value), `${name} must be an array`);
  return value.map((item, index) => {
    assert(isRecord(item), `${name}[${index}] must be an object`);
    return item;
  });
}

function validateStages(value: unknown): Stage[] {
  const stages = arrayOfRecords(value, 'stages').map((stage, index) => {
    const result = stage as unknown as Stage;
    assert(text(result.id) && text(result.operation) && text(result.authorizationBoundary), `stage ${index} is missing an authorization boundary`);
    assert(result.authorizationRequired === true, `stage ${result.id} requires explicit authorization`);
    return result;
  });
  assert(same(stages.map((stage) => stage.id), EXPECTED_STAGES), 'release stages are missing, duplicated, or out of order');
  assert(new Set(stages.map((stage) => stage.authorizationBoundary)).size === stages.length, 'authorization boundaries must be separate for every stage');
  return stages;
}

function validateRollbacks(value: unknown): RollbackPath[] {
  const rollbacks = arrayOfRecords(value, 'rollbackPaths').map((path, index) => {
    const result = path as unknown as RollbackPath;
    assert(text(result.id) && text(result.action), `rollback path ${index} is malformed`);
    assert(result.dataDeletionAllowed === false, `destructive rollback is forbidden for ${result.id}`);
    return result;
  });
  assert(same(rollbacks.map((path) => path.id), EXPECTED_ROLLBACKS), 'rollback paths are incomplete or out of order');
  const required = rollbacks.map((path) => path.id);
  assert(required.includes('before-selector-activation') && required.includes('selector-rollback-after-activation'), 'selector rollback paths are incomplete');
  return rollbacks;
}

export function validateG8ReleaseManifest(manifest: unknown, bundle: LocalProductBundle) {
  assert(isRecord(manifest) && manifest.schemaVersion === 1, 'malformed G8 release manifest');
  assert(bundle.generation === 'canonical-2026-shadow-v2', 'v1 or unknown bundle generation is not publishable');
  const release = manifest.release;
  assert(isRecord(release), 'release section is missing');
  assert(release.id === 'g8-catalog-beta' && release.kind === 'catalog-beta', 'manifest is not the G8 catalog-beta release');
  assert(release.artifactName === 'g7-1-local-product-bundle.json', 'manifest accepts only the certified G7.1 artifact');
  assert(release.generation === bundle.generation && release.immutableLegacyGeneration === 'canonical-2026-shadow-v1', 'legacy/v2 generation policy is invalid');
  assert(same(release.target, EXPECTED_TARGET), 'wrong project/database in release manifest');
  assert(same(release.expectedCounts, EXPECTED_COUNTS) && same(bundle.counts, EXPECTED_COUNTS), 'stale or mismatched certified counts');
  assert(same(release.expectedReadiness, EXPECTED_READINESS) && same(bundle.readiness, EXPECTED_READINESS), 'publication-readiness regression or mismatch');
  assert(same(release.expectedAudit, EXPECTED_AUDIT) && same(bundle.audit, EXPECTED_AUDIT), 'certified audit is not clean');
  const expectedDigests = release.expectedDigests;
  assert(isRecord(expectedDigests), 'expected digests are missing');
  assert(expectedDigests.input === bundle.inputDigest && expectedDigests.evidence === bundle.evidenceDigest && expectedDigests.plan === bundle.planDigest && expectedDigests.bundle === bundle.bundleDigest, 'stale or mismatched certified digests');

  const synchronization = manifest.synchronization;
  assert(isRecord(synchronization), 'synchronization section is missing');
  const parentCommits = synchronization.parentCommits;
  const nestedCommits = synchronization.nestedCommits;
  assert(Array.isArray(parentCommits) && parentCommits.length === 3 && parentCommits.every((commit) => /^[0-9a-f]{40}$/.test(text(commit))), 'parent synchronization commits are invalid');
  assert(Array.isArray(nestedCommits) && nestedCommits.length === 2 && nestedCommits.every((commit) => /^[0-9a-f]{40}$/.test(text(commit))), 'nested synchronization commits are invalid');
  assert(synchronization.wrongBranchOrCommit === 'stop', 'wrong branch or commit must stop the run');

  const policy = manifest.productionPolicy;
  assert(isRecord(policy) && policy.productionAccess === false && policy.networkCalls === 0 && policy.credentialsAccepted === false && policy.mutationExecuted === false, 'local validator must be Firebase-free and non-mutating');
  assert(same(policy.forbiddenEnvironmentFlags, ['VITE_USE_FIREBASE_EMULATORS', 'VITE_ENABLE_TEST_AUTH', 'VITE_USE_MOCK_CONTESTS', 'VITE_ALLOW_ADMIN_SEED']), 'unsafe environment flag policy is incomplete');
  const scope = manifest.releaseScope;
  assert(isRecord(scope) && scope.cleanRequired === true && scope.unrelatedDirtyFilesMustBePreserved === true, 'dirty release scope must stop and unrelated changes must be preserved');

  const stages = validateStages(manifest.stages);
  assert(Array.isArray(manifest.stopConditions) && same([...manifest.stopConditions].sort(), [...EXPECTED_STOPS].sort()), 'fail-closed stop conditions are incomplete');
  const rollbacks = validateRollbacks(manifest.rollbackPaths);
  const deletionPolicy = manifest.deletionPolicy;
  assert(isRecord(deletionPolicy) && deletionPolicy.authorizationBoundary === 'delete:legacy-or-canonical' && deletionPolicy.allowed === false && deletionPolicy.canonicalRetention === 'required' && deletionPolicy.legacyRetention === 'required', 'deletion policy is unsafe or incomplete');

  const core = {
    schemaVersion: 1,
    operation: 'g8-catalog-beta-readiness',
    status: 'ready-for-separately-authorized-execution',
    productionAccess: false,
    networkCalls: 0,
    writes: 0,
    deletions: 0,
    artifact: { name: text(release.artifactName), generation: bundle.generation, bundleDigest: bundle.bundleDigest },
    counts: bundle.counts,
    readiness: bundle.readiness,
    audit: bundle.audit,
    synchronization: { parentCommits, nestedCommits },
    stages: stages.map((stage) => ({ id: stage.id, operation: stage.operation, authorizationBoundary: stage.authorizationBoundary })),
    stopConditions: [...EXPECTED_STOPS],
    rollbackPaths: rollbacks.map((path) => path.id),
    retainedNamespaces: ['canonical-2026-shadow-v2', 'legacy-2026'],
    warnings: ['Production authorization is absent.', 'No capture, write, deployment, selector change, rollback, deletion, or external call was executed.'],
  };
  return { ...core, receiptDigest: localProductDigest(core) };
}
