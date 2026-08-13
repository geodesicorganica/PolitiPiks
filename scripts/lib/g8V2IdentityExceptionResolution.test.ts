import assert from 'node:assert/strict';
import { buildG8V2ConflictCertifiedPlan } from './g8V2ConflictCli.js';
import {
  buildG8V2FinalIdentityResolutionPlan,
  G8_V2_FINAL_IDENTITY_DEFAULT_PATHS,
  G8_V2_G2_1_MAPPING_DIGEST,
  loadG8V2IdentityExceptionBuildInputs,
  validateG8V2IdentityOverridePolicy,
  verifyG8V2FinalIdentityResolutionReplay,
} from './g8V2IdentityExceptionResolution.js';

type Json = Record<string, any>;
const paths = G8_V2_FINAL_IDENTITY_DEFAULT_PATHS;
const { plan: activationPlan } = buildG8V2ConflictCertifiedPlan(paths.currentBundle, paths.manifest);
const inputs = loadG8V2IdentityExceptionBuildInputs(paths, activationPlan);
let plan!: ReturnType<typeof buildG8V2FinalIdentityResolutionPlan>;
assert.doesNotThrow(() => {
  plan = buildG8V2FinalIdentityResolutionPlan(inputs);
}, 'validated identity exceptions produce complete certified replacement outputs');
const sourceOverrides = JSON.parse(inputs.overrideText) as Json;

assert.equal(plan.identityResolution.aggregate.resolvedRaces, 4);
assert.equal(plan.identityResolution.aggregate.correctedOneToOneRaces, 3);
assert.equal(plan.identityResolution.aggregate.consumedOverrides, 8);
assert.equal(plan.identityResolution.aggregate.approvedManyToOneMergeGroups, 1);
assert.equal(plan.identityResolution.aggregate.approvedManyToOneAliases, 2);
assert.equal(plan.identityResolution.aggregate.resolvedIdentityBlockers, 7);
assert.equal(plan.aggregate.plannedPaths, 858);
assert.equal(plan.aggregate.duplicatePaths, 0);
assert.equal(plan.aggregate.omittedPaths, 0);
assert.equal(plan.aggregate.byDisposition.unresolved, 0);
assert.equal(plan.aggregate.byDisposition['replace-with-certified'], 4);
assert.equal(plan.aggregate.byDisposition['deterministic-merge'], 854);
const conflictByPath = new Map(inputs.snapshot.conflicts.map((conflict) => [conflict.path, conflict]));
assert.equal(plan.entries.filter((entry) => entry.disposition === 'replace-with-certified').every((entry) => entry.proposedOutputDigest === conflictByPath.get(entry.path)?.expectedDigest), true, 'exception replacements must be byte-derived from the certified output');
assert.equal(plan.aggregate.byBlockerClass['identity-conflict'], 0);
assert.equal(plan.readiness.deterministicallyResolved, 858);
assert.equal(plan.readiness.unresolved, 0);
assert.equal(plan.readiness.policyConflicts, 0);
assert.equal(plan.readiness.rollbackEvidenceComplete, true);
assert.equal(plan.readiness.readyForExecutor, true);
assert.equal(plan.safety.dispositionsExecuted, 0);
assert.equal(plan.identityResolution.resolutions.flatMap((resolution) => resolution.rollbackAliases).length, 8);
assert.equal(plan.identityResolution.resolutions.filter((resolution) => resolution.resolutionKind === 'approved-many-to-one')[0]?.canonicalCandidates, 1);
assert.equal(/[HS]\d[A-Z]{2}\d{5}/.test(JSON.stringify(plan.identityResolution)), false, 'committed-safe identity evidence must retain only digests, never raw FEC IDs');
assert.equal(verifyG8V2FinalIdentityResolutionReplay({ digests: structuredClone(plan.digests) }, { digests: structuredClone(plan.digests) }), true);

const cloneOverrides = () => structuredClone(sourceOverrides);
const policy = (rawOverrides: unknown, publicationOverrides: unknown = rawOverrides, snapshot = inputs.snapshot) => validateG8V2IdentityOverridePolicy({
  basePlan: inputs.basePlan,
  snapshot,
  rawOverrides,
  publicationOverrides,
  publicationMappingDigest: G8_V2_G2_1_MAPPING_DIGEST,
});
const expectPolicyFailure = (mutate: (value: Json) => void, pattern: RegExp) => {
  const value = cloneOverrides(); mutate(value);
  assert.throws(() => policy(value), pattern);
};

expectPolicyFailure((value) => { value.candidateOverrides.pop(); }, /BR6C_OVERRIDE_COUNT_MISMATCH/);
expectPolicyFailure((value) => { value.candidateOverrides.push({
  legacyRaceId: '2026-CA-house-040', legacyCandidateId: 'ken-calvert-republican', fecCandidateId: 'H2CA37023', sourceUrl: 'https://www.fec.gov/data/candidate/H2CA37023/',
}); }, /BR6C_OVERRIDE_COUNT_MISMATCH/);
expectPolicyFailure((value) => { value.candidateOverrides.push(structuredClone(value.candidateOverrides[0])); }, /duplicate or contradictory candidate override/);
expectPolicyFailure((value) => { value.candidateOverrides[0].legacyRaceId = '2026-FL-house-011'; }, /BR6C_OVERRIDE_LEGACY_TUPLE_COVERAGE_MISMATCH/);
expectPolicyFailure((value) => {
  value.candidateOverrides[0].fecCandidateId = 'H6FL11241';
  value.candidateOverrides[0].sourceUrl = 'https://www.fec.gov/data/candidate/H6FL11241/';
}, /BR6C_OVERRIDE_TARGET_COVERAGE_MISMATCH|BR6C_OVERRIDE_WRONG_STATE_OR_SEAT/);
expectPolicyFailure((value) => { value.candidateOverrides[0].legacyCandidateId = 'ken-calvert-republican'; }, /BR6C_OVERRIDE_LEGACY_TUPLE_COVERAGE_MISMATCH/);
expectPolicyFailure((value) => { value.candidateOverrides[0].sourceUrl = 'https://example.test/not-official'; }, /invalid or unsourced candidate override/);
expectPolicyFailure((value) => {
  for (const override of value.candidateOverrides.filter((item: Json) => item.legacyRaceId === '2026-NJ-house-008')) delete override.approvedManyToOneMerge;
}, /BR6C_UNAPPROVED_MANY_TO_ONE_MERGE/);
expectPolicyFailure((value) => {
  for (const override of value.candidateOverrides.filter((item: Json) => item.legacyRaceId === '2026-CA-house-040')) override.approvedManyToOneMerge = 'unapproved-cross-target-group';
}, /BR6C_SPURIOUS_MANY_TO_ONE_APPROVAL/);

const diagnosticSnapshot = { ...inputs.snapshot, conflicts: [...inputs.snapshot.conflicts] };
const diagnosticIndex = diagnosticSnapshot.conflicts.findIndex((conflict) => conflict.path === 'races/2026-CA-house-040');
const diagnosticConflict = structuredClone(diagnosticSnapshot.conflicts[diagnosticIndex]);
const actualCandidates = diagnosticConflict.actual.candidates as Json[];
const expectedCandidates = diagnosticConflict.expected.candidates as Json[];
for (const actual of actualCandidates.filter((candidate) => ['esther-kim-varet-democrat','young-kim-republican'].includes(String(candidate.id)))) {
  const expected = expectedCandidates.find((candidate) => String(candidate.externalIds?.fecCandidateId) === String(actual.externalIds?.fecCandidateId)) ?? expectedCandidates[0];
  actual.name = expected.name; actual.party = expected.party; actual.incumbent = expected.incumbent; actual.externalIds.bioguideId = expected.externalIds?.bioguideId;
}
diagnosticSnapshot.conflicts[diagnosticIndex] = diagnosticConflict;
const missingDespiteDiagnosticMatch = cloneOverrides();
missingDespiteDiagnosticMatch.candidateOverrides.pop();
assert.throws(() => policy(missingDespiteDiagnosticMatch, missingDespiteDiagnosticMatch, diagnosticSnapshot), /BR6C_OVERRIDE_COUNT_MISMATCH/, 'name, party, order, incumbency, and Bioguide corroboration cannot replace an exact override');

assert.throws(() => buildG8V2FinalIdentityResolutionPlan({ ...inputs, overrideText: `${inputs.overrideText} ` }), /BR6C_OVERRIDE_ARTIFACT_INTEGRITY_MISMATCH/);
const publicationMismatch = cloneOverrides();
publicationMismatch.candidateOverrides[0].legacyCandidateId = 'tampered-but-valid-format';
assert.throws(() => policy(publicationMismatch, sourceOverrides), /BR6C_OVERRIDE_PUBLICATION_MAPPING_MISMATCH/);

console.log(JSON.stringify({
  operation: 'g8-4br6c-focused-tests',
  identityResolution: plan.identityResolution.aggregate,
  dispositions: plan.aggregate.byDisposition,
  policyConflicts: plan.readiness.policyConflicts,
  readyForExecutor: plan.readiness.readyForExecutor,
  planDigest: plan.digests.plan,
}));
