import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import { buildCanonicalPublicationPlan, type CanonicalPublicationSnapshot } from './canonicalPublication.js';
import { parseCanonicalIdentityOverrides, type CandidateIdentityOverride } from './canonicalMigration.js';
import { type G8V2ConflictDocument, type G8V2ConflictSnapshot } from './g8V2ConflictAnalysis.js';
import { G8_V2_DISPOSITION_DEFAULT_PATHS, type G8V2DispositionPaths, type G8V2DispositionPointerRule } from './g8V2ConflictDisposition.js';
import {
  aggregateG8V2RevisedDispositionEntries,
  draftG8V2RevisedDisposition,
  G8_V2_REVISED_DISPOSITION_CONTRACT,
  loadG8V2RevisedDispositionPlan,
  type G8V2FecPairEvidence,
  type G8V2RevisedDispositionEntry,
  type G8V2RevisedDispositionPlan,
} from './g8V2FecCandidateEquivalence.js';
import type { G8V2ActivationPlan } from './g8V2Activation.js';
import { localProductDigest } from './localProductBundle.js';

type Json = Record<string, unknown>;

export const G8_V2_FINAL_IDENTITY_CONTRACT = 'g8-4br6c-final-candidate-identity-resolution-plan/v1' as const;
export const G8_V2_FINAL_IDENTITY_POLICY_CONTRACT = 'g8-4br6c-certified-override-resolution/v1' as const;
export const G8_V2_FINAL_IDENTITY_POINTER_CONTRACT = 'g8-4br6c-override-resolved-pointer-rules/v1' as const;
export const G8_V2_FINAL_IDENTITY_REPORT_CONTRACT = 'g8-4br6c-final-candidate-identity-resolution-report/v1' as const;
export const G8_V2_BR6B_CERTIFIED_PLAN_DIGEST = '7b5da128cad3ee688949209643ab63626e2a70a18b6765f8a57b9956f162ab48' as const;
export const G8_V2_BR6B_CERTIFIED_PRIVATE_SHA256 = '1f0b71444b2958ab012a03fde3b74f8603df4035f843a2363361d584a7b6752e' as const;
export const G8_V2_OVERRIDE_BYTES = 2_137 as const;
export const G8_V2_OVERRIDE_SHA256 = 'dae9946a70fb23d935a86f9affdcab97459d07a4024a84e4e0b6c3a5559a5b77' as const;
export const G8_V2_G2_1_MAPPING_DIGEST = '7650db763671b6951c4650b816c31e67e8cafb9594ac651c9f25cbd41dc2861a' as const;
export const G8_V2_G2_1_STATUS_SHA256 = '281f0525ac101103ac623c6be5a432507787e6c47f5283fd1fe9c86cb8873077' as const;

const expectedRaceIds = ['2026-CA-house-040','2026-FL-house-011','2026-NJ-house-008','2026-TX-house-022'] as const;
const resolvedRaceLabels = ['CA-40','FL-11','NJ-08','TX-22'] as const;
const allowedRejectClasses = new Set(['duplicate-actual-fec-id','missing-actual-candidate']);
const certifiedReplacementRuntimePointers = new Set(['/updatedAt/__firestoreType','/updatedAt/nanoseconds','/updatedAt/seconds']);
const digest = (value: unknown) => localProductDigest(value);
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const candidateIdentity = (value: unknown) => isRecord(value) ? text(value.id) || text(value.candidateId) : '';
const candidateFecId = (value: unknown) => isRecord(value) && isRecord(value.externalIds) ? text(value.externalIds.fecCandidateId) : '';
const candidateArray = (value: unknown) => isRecord(value) && Array.isArray(value.candidates) ? value.candidates : [];
const sortedUnique = (values: string[]) => [...new Set(values)].sort();
const sameStrings = (left: string[], right: string[]) => left.length === right.length && left.every((value, index) => value === right[index]);
const raceIdFromPath = (path: string) => path.replace(/^races\//, '');

function expect(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function fileIdentity(path: string) {
  const handle = openSync(path, 'r');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const hash = createHash('sha256');
  try {
    for (;;) {
      const bytes = readSync(handle, buffer, 0, buffer.length, null);
      if (bytes === 0) return { bytes: statSync(path).size, sha256: hash.digest('hex') };
      hash.update(buffer.subarray(0, bytes));
    }
  } finally { closeSync(handle); }
}

export type G8V2IdentityExceptionPaths = G8V2DispositionPaths & {
  overrides: string;
  g2Status: string;
  br6bPrivatePlan: string;
};

export const G8_V2_FINAL_IDENTITY_DEFAULT_PATHS: G8V2IdentityExceptionPaths = {
  ...G8_V2_DISPOSITION_DEFAULT_PATHS,
  overrides: 'data/2026/canonical-identity-overrides.json',
  g2Status: 'docs/status/g2-1-identity-resolution.md',
  br6bPrivatePlan: '.artifacts/private/canonical-migration/g8-4br6b-revised-disposition-plan-build-1.json',
};

export type G8V2IdentityExceptionResolution = {
  racePathDigest: string;
  resolutionKind: 'corrected-one-to-one' | 'approved-many-to-one';
  sourceAliases: number;
  canonicalCandidates: number;
  resolvedIdentityBlockers: number;
  consumedOverrideDigests: string[];
  targetFecIdDigests: string[];
  mergeGroups: Array<{ mergeGroupDigest: string; sourceAliases: number; canonicalCandidates: 1 }>;
  rollbackAliases: Array<{ legacyCandidateIdDigest: string; actualCandidateDigest: string }>;
  sourceEvidenceDigests: string[];
  resolutionDigest: string;
};

export type G8V2IdentityOverridePolicyEvidence = {
  schemaVersion: 1;
  contract: typeof G8_V2_FINAL_IDENTITY_POLICY_CONTRACT;
  policy: {
    exactLegacyTupleRequired: true;
    officialFecUrlAndIdRequired: true;
    canonicalRaceSeatCandidateAndSourceEvidenceRequired: true;
    certifiedCurrentBundleAuthoritative: true;
    approvedManyToOneGroupRequired: true;
    completeAliasRollbackEvidenceRequired: true;
    diagnosticFieldsCannotEstablishIdentity: readonly ['candidate-order','normalized-name','party','incumbent-flag','bioguide-id'];
  };
  resolutions: G8V2IdentityExceptionResolution[];
  aggregate: {
    resolvedRaces: number;
    correctedOneToOneRaces: number;
    consumedOverrides: number;
    correctedOneToOneOverrides: number;
    approvedManyToOneMergeGroups: number;
    approvedManyToOneAliases: number;
    resolvedIdentityBlockers: number;
    remainingConflicts: number;
  };
  digests: { overrides: string; resolutions: string; rollbackAliases: string; policy: string };
};

export type G8V2IdentityExceptionBuildInputs = {
  basePlan: G8V2RevisedDispositionPlan;
  snapshot: G8V2ConflictSnapshot;
  overrideText: string;
  g2StatusText: string;
  publication: CanonicalPublicationSnapshot;
  br6bPrivatePlan: { bytes: number; sha256: string };
};

type PolicyValidation = {
  evidence: G8V2IdentityOverridePolicyEvidence;
  bindings: Map<string, { resolution: G8V2IdentityExceptionResolution; targetFecIds: string[] }>;
};

function canonicalEvidence(pair: G8V2FecPairEvidence) {
  return pair.checks.fecFormat
    && pair.checks.uniqueOnCertifiedSide
    && pair.checks.notReusedAcrossRaces
    && pair.checks.office
    && pair.checks.state
    && pair.checks.districtSeat
    && pair.checks.cycle
    && pair.checks.canonicalContest
    && pair.checks.certifiedCurrentCandidate
    && pair.checks.officialFecBaseline
    && pair.checks.financeEvidence !== 'contradictory'
    && pair.evidenceDigests.length > 0
    && pair.evidenceDigests.every((value) => /^[a-f0-9]{64}$/.test(value));
}

/** Policy-only seam used by production assembly and synthetic safeguard tests. */
export function validateG8V2IdentityOverridePolicy(options: {
  basePlan: G8V2RevisedDispositionPlan;
  snapshot: G8V2ConflictSnapshot;
  rawOverrides: unknown;
  publicationOverrides: unknown;
  publicationMappingDigest: string;
}): PolicyValidation {
  expect(options.basePlan.contract === G8_V2_REVISED_DISPOSITION_CONTRACT && options.basePlan.digests.plan === G8_V2_BR6B_CERTIFIED_PLAN_DIGEST, 'BR6C_BR6B_PLAN_IDENTITY_MISMATCH');
  expect(options.basePlan.readiness.unresolved === 4 && options.basePlan.readiness.policyConflicts === 7 && options.basePlan.readiness.readyForExecutor === false, 'BR6C_BR6B_STARTING_READINESS_MISMATCH');
  expect(options.basePlan.equivalence.aggregate.remainingRaces === 4 && options.basePlan.equivalence.aggregate.rejectedFecPairs === 7, 'BR6C_BR6B_EQUIVALENCE_MISMATCH');
  expect(options.snapshot.conflicts.length === 858, 'BR6C_SNAPSHOT_PATH_COUNT_MISMATCH');
  expect(options.publicationMappingDigest === G8_V2_G2_1_MAPPING_DIGEST, 'BR6C_G2_1_MAPPING_DIGEST_MISMATCH');
  expect(CANONICAL_2026_FEDERAL_CONTESTS.length === 470, 'BR6C_CANONICAL_REGISTRY_COUNT_MISMATCH');

  const overrides = parseCanonicalIdentityOverrides(options.rawOverrides);
  const publicationOverrides = parseCanonicalIdentityOverrides(options.publicationOverrides);
  expect(digest(overrides) === digest(publicationOverrides), 'BR6C_OVERRIDE_PUBLICATION_MAPPING_MISMATCH');
  expect(overrides.candidateOverrides.length === 8, 'BR6C_OVERRIDE_COUNT_MISMATCH');

  const entryByPath = new Map(options.basePlan.entries.map((entry) => [entry.path, entry]));
  const unresolvedEntries = options.basePlan.entries.filter((entry) => entry.disposition === 'unresolved');
  const unresolvedPaths = unresolvedEntries.map((entry) => entry.path).sort();
  const expectedPaths = expectedRaceIds.map((raceId) => `races/${raceId}`).sort();
  expect(sameStrings(unresolvedPaths, expectedPaths), 'BR6C_UNEXPECTED_UNRESOLVED_RACES');
  const conflictByPath = new Map(options.snapshot.conflicts.map((conflict) => [conflict.path, conflict]));
  const overridesByRace = new Map<string, CandidateIdentityOverride[]>();
  for (const override of overrides.candidateOverrides) overridesByRace.set(override.legacyRaceId, [...(overridesByRace.get(override.legacyRaceId) ?? []), override]);
  expect(sameStrings([...overridesByRace.keys()].sort(), [...expectedRaceIds].sort()), 'BR6C_OVERRIDE_RACE_COVERAGE_MISMATCH');

  const resolutions: G8V2IdentityExceptionResolution[] = [];
  const bindings = new Map<string, { resolution: G8V2IdentityExceptionResolution; targetFecIds: string[] }>();
  const mergeGroupUses = new Map<string, Array<{ raceId: string; fecCandidateId: string; aliases: number }>>();

  for (const path of expectedPaths) {
    const raceId = raceIdFromPath(path);
    const conflict = conflictByPath.get(path);
    const entry = entryByPath.get(path);
    expect(conflict?.family === 'races' && entry?.disposition === 'unresolved', 'BR6C_EXCEPTION_CONFLICT_MISSING');
    const actualCandidates = candidateArray(conflict.actual);
    const expectedCandidates = candidateArray(conflict.expected);
    const actualIds = actualCandidates.map(candidateIdentity);
    expect(actualIds.every(Boolean) && new Set(actualIds).size === actualIds.length, 'BR6C_DUPLICATE_OR_MISSING_ACTUAL_CANDIDATE_ID');
    const fecCounts = new Map<string, number>();
    for (const candidate of actualCandidates) fecCounts.set(candidateFecId(candidate), (fecCounts.get(candidateFecId(candidate)) ?? 0) + 1);
    const exceptionCandidates = actualCandidates.filter((candidate) => (fecCounts.get(candidateFecId(candidate)) ?? 0) > 1);
    const raceOverrides = [...(overridesByRace.get(raceId) ?? [])].sort((left, right) => left.legacyCandidateId.localeCompare(right.legacyCandidateId));
    expect(sameStrings(raceOverrides.map((item) => item.legacyCandidateId).sort(), exceptionCandidates.map(candidateIdentity).sort()), 'BR6C_OVERRIDE_LEGACY_TUPLE_COVERAGE_MISMATCH');

    const registry = CANONICAL_2026_FEDERAL_CONTESTS.find((seat) => seat.id === raceId);
    expect(registry?.office === 'House' && text(conflict.actual.id) === raceId && text(conflict.expected.id) === raceId, 'BR6C_OVERRIDE_RACE_OR_SEAT_MISMATCH');
    expect(text(conflict.actual.state) === registry.state && text(conflict.expected.state) === registry.state && text(conflict.actual.office) === registry.office && text(conflict.expected.office) === registry.office, 'BR6C_OVERRIDE_RACE_OR_SEAT_MISMATCH');
    expect(text(conflict.actual.district) === registry.district && text(conflict.expected.district) === registry.district, 'BR6C_OVERRIDE_RACE_OR_SEAT_MISMATCH');

    const racePathDigest = digest(path);
    const rejectedPairs = options.basePlan.equivalence.pairs.filter((pair) => pair.racePathDigest === racePathDigest && pair.status === 'rejected');
    const rejectedTargetDigests = sortedUnique(rejectedPairs.map((pair) => pair.fecCandidateIdDigest ?? ''));
    expect(rejectedTargetDigests.every((value) => /^[a-f0-9]{64}$/.test(value)), 'BR6C_REJECTED_TARGET_DIGEST_MISSING');
    expect(sameStrings(sortedUnique(raceOverrides.map((item) => digest(item.fecCandidateId))), rejectedTargetDigests), 'BR6C_OVERRIDE_TARGET_COVERAGE_MISMATCH');

    const overridesByTarget = new Map<string, CandidateIdentityOverride[]>();
    for (const override of raceOverrides) overridesByTarget.set(override.fecCandidateId, [...(overridesByTarget.get(override.fecCandidateId) ?? []), override]);
    const mergeGroups: G8V2IdentityExceptionResolution['mergeGroups'] = [];
    const rollbackAliases: G8V2IdentityExceptionResolution['rollbackAliases'] = [];
    const sourceEvidenceDigests: string[] = [];
    let resolutionKind: G8V2IdentityExceptionResolution['resolutionKind'] = 'corrected-one-to-one';

    for (const [fecCandidateId, targetOverrides] of [...overridesByTarget].sort(([left], [right]) => left.localeCompare(right))) {
      expect(fecCandidateId.slice(2, 4) === registry.state, 'BR6C_OVERRIDE_WRONG_STATE_OR_SEAT');
      const expectedMatches = expectedCandidates.filter((candidate) => candidateFecId(candidate) === fecCandidateId && candidateIdentity(candidate) === `fec-${fecCandidateId}`);
      expect(expectedMatches.length === 1, 'BR6C_OVERRIDE_WRONG_CANONICAL_CANDIDATE');
      const pair = rejectedPairs.find((candidate) => candidate.fecCandidateIdDigest === digest(fecCandidateId));
      expect(pair !== undefined && canonicalEvidence(pair), 'BR6C_OVERRIDE_SOURCE_EVIDENCE_INVALID');
      expect(pair.rejectClasses.length > 0 && pair.rejectClasses.every((reason) => allowedRejectClasses.has(reason)), 'BR6C_OVERRIDE_UNAPPROVED_REJECT_CLASS');
      sourceEvidenceDigests.push(pair.pairDigest, ...pair.evidenceDigests);

      if (targetOverrides.length === 1) {
        expect(!targetOverrides[0].approvedManyToOneMerge, 'BR6C_SPURIOUS_MANY_TO_ONE_APPROVAL');
      } else {
        const groups = sortedUnique(targetOverrides.map((item) => item.approvedManyToOneMerge ?? ''));
        expect(groups.length === 1 && groups[0].length > 0, 'BR6C_UNAPPROVED_MANY_TO_ONE_MERGE');
        const mergeGroup = groups[0];
        mergeGroups.push({ mergeGroupDigest: digest(mergeGroup), sourceAliases: targetOverrides.length, canonicalCandidates: 1 });
        mergeGroupUses.set(mergeGroup, [...(mergeGroupUses.get(mergeGroup) ?? []), { raceId, fecCandidateId, aliases: targetOverrides.length }]);
        resolutionKind = 'approved-many-to-one';
      }

      for (const override of targetOverrides) {
        const actualMatches = actualCandidates.filter((candidate) => candidateIdentity(candidate) === override.legacyCandidateId);
        expect(actualMatches.length === 1 && exceptionCandidates.includes(actualMatches[0]), 'BR6C_OVERRIDE_WRONG_LEGACY_CANDIDATE');
        rollbackAliases.push({ legacyCandidateIdDigest: digest(override.legacyCandidateId), actualCandidateDigest: digest(actualMatches[0]) });
      }
    }

    const blockers = entry.pointerRules.filter((rule) => rule.blockerClass !== 'none');
    expect(blockers.every((rule) => rule.kind === 'identity' && rule.blockerClass === 'identity-conflict'), 'BR6C_NON_IDENTITY_BLOCKER_PRESENT');
    const blockerTargets = blockers.map((rule) => /\/@fec-sha256:([a-f0-9]{64})$/.exec(rule.pointer)?.[1] ?? '').sort();
    expect(sameStrings(blockerTargets, rejectedTargetDigests), 'BR6C_BLOCKER_TARGET_COVERAGE_MISMATCH');
    expect(resolutionKind === 'approved-many-to-one' ? mergeGroups.length === 1 : mergeGroups.length === 0, 'BR6C_MERGE_GROUP_ACCOUNTING_MISMATCH');

    const base = {
      racePathDigest,
      resolutionKind,
      sourceAliases: raceOverrides.length,
      canonicalCandidates: overridesByTarget.size,
      resolvedIdentityBlockers: blockers.length,
      consumedOverrideDigests: raceOverrides.map((item) => digest(item)).sort(),
      targetFecIdDigests: [...overridesByTarget.keys()].map(digest).sort(),
      mergeGroups: mergeGroups.sort((left, right) => left.mergeGroupDigest.localeCompare(right.mergeGroupDigest)),
      rollbackAliases: rollbackAliases.sort((left, right) => left.legacyCandidateIdDigest.localeCompare(right.legacyCandidateIdDigest)),
      sourceEvidenceDigests: sortedUnique(sourceEvidenceDigests),
    };
    const resolution: G8V2IdentityExceptionResolution = { ...base, resolutionDigest: digest(base) };
    resolutions.push(resolution);
    bindings.set(path, { resolution, targetFecIds: [...overridesByTarget.keys()].sort() });
  }

  for (const [mergeGroup, uses] of mergeGroupUses) {
    const artifactMembers = overrides.candidateOverrides.filter((item) => item.approvedManyToOneMerge === mergeGroup);
    expect(uses.length === 1 && uses[0].aliases === artifactMembers.length, 'BR6C_CROSS_RACE_OR_TARGET_MERGE_GROUP');
  }
  resolutions.sort((left, right) => left.racePathDigest.localeCompare(right.racePathDigest));
  const rollbackAliases = resolutions.flatMap((resolution) => resolution.rollbackAliases);
  const aggregate = {
    resolvedRaces: resolutions.length,
    correctedOneToOneRaces: resolutions.filter((resolution) => resolution.resolutionKind === 'corrected-one-to-one').length,
    consumedOverrides: resolutions.reduce((sum, resolution) => sum + resolution.sourceAliases, 0),
    correctedOneToOneOverrides: resolutions.filter((resolution) => resolution.resolutionKind === 'corrected-one-to-one').reduce((sum, resolution) => sum + resolution.sourceAliases, 0),
    approvedManyToOneMergeGroups: resolutions.reduce((sum, resolution) => sum + resolution.mergeGroups.length, 0),
    approvedManyToOneAliases: resolutions.filter((resolution) => resolution.resolutionKind === 'approved-many-to-one').reduce((sum, resolution) => sum + resolution.sourceAliases, 0),
    resolvedIdentityBlockers: resolutions.reduce((sum, resolution) => sum + resolution.resolvedIdentityBlockers, 0),
    remainingConflicts: 0,
  };
  expect(aggregate.resolvedRaces === 4 && aggregate.correctedOneToOneRaces === 3 && aggregate.consumedOverrides === 8 && aggregate.correctedOneToOneOverrides === 6, 'BR6C_OVERRIDE_RESOLUTION_COUNT_MISMATCH');
  expect(aggregate.approvedManyToOneMergeGroups === 1 && aggregate.approvedManyToOneAliases === 2 && aggregate.resolvedIdentityBlockers === 7, 'BR6C_MERGE_OR_BLOCKER_COUNT_MISMATCH');
  expect(rollbackAliases.length === 8 && rollbackAliases.every((item) => /^[a-f0-9]{64}$/.test(item.actualCandidateDigest)), 'BR6C_ALIAS_ROLLBACK_EVIDENCE_INCOMPLETE');
  const digestsBase = { overrides: digest(overrides.candidateOverrides), resolutions: digest(resolutions), rollbackAliases: digest(rollbackAliases) };
  const base = {
    schemaVersion: 1 as const,
    contract: G8_V2_FINAL_IDENTITY_POLICY_CONTRACT,
    policy: {
      exactLegacyTupleRequired: true as const,
      officialFecUrlAndIdRequired: true as const,
      canonicalRaceSeatCandidateAndSourceEvidenceRequired: true as const,
      certifiedCurrentBundleAuthoritative: true as const,
      approvedManyToOneGroupRequired: true as const,
      completeAliasRollbackEvidenceRequired: true as const,
      diagnosticFieldsCannotEstablishIdentity: ['candidate-order','normalized-name','party','incumbent-flag','bioguide-id'] as const,
    },
    resolutions,
    aggregate,
  };
  const evidence: G8V2IdentityOverridePolicyEvidence = { ...base, digests: { ...digestsBase, policy: digest({ ...base, digests: digestsBase }) } };
  return { evidence, bindings };
}

function pointerSignature(rules: G8V2DispositionPointerRule[]) {
  return digest(rules.map((rule) => ({
    pointer: rule.pointer.replace(/@(?:id|fec)-sha256:[a-f0-9]{64}/g, '@candidate-id'),
    kind: rule.kind,
    provenanceClass: rule.provenanceClass,
    blockerClass: rule.blockerClass,
  })));
}

export type G8V2FinalIdentityResolutionPlan = {
  schemaVersion: 1;
  contract: typeof G8_V2_FINAL_IDENTITY_CONTRACT;
  pointerContract: typeof G8_V2_FINAL_IDENTITY_POINTER_CONTRACT;
  basePlan: { contract: typeof G8_V2_REVISED_DISPOSITION_CONTRACT; planDigest: typeof G8_V2_BR6B_CERTIFIED_PLAN_DIGEST; privatePlanSha256: typeof G8_V2_BR6B_CERTIFIED_PRIVATE_SHA256 };
  certifiedOverrides: {
    path: 'data/2026/canonical-identity-overrides.json';
    bytes: typeof G8_V2_OVERRIDE_BYTES;
    sha256: typeof G8_V2_OVERRIDE_SHA256;
    g2StatusSha256: typeof G8_V2_G2_1_STATUS_SHA256;
    mappingDigest: typeof G8_V2_G2_1_MAPPING_DIGEST;
  };
  identityResolution: G8V2IdentityOverridePolicyEvidence;
  entries: G8V2RevisedDispositionEntry[];
  aggregate: ReturnType<typeof aggregateG8V2RevisedDispositionEntries>;
  readiness: {
    readyForExecutor: boolean;
    deterministicallyResolved: number;
    unresolved: number;
    reproducibleOutputs: boolean;
    rollbackEvidenceComplete: boolean;
    policyConflicts: number;
    remainingIdentityConflicts: number;
  };
  safety: { firebaseImported: false; credentialsLoaded: false; networkRequests: 0; productionOperations: 0; dispositionsExecuted: 0 };
  digests: { entries: string; aggregate: string; outputs: string; rollback: string; plan: string };
};

export function buildG8V2FinalIdentityResolutionPlan(inputs: G8V2IdentityExceptionBuildInputs): G8V2FinalIdentityResolutionPlan {
  const overrideBytes = Buffer.byteLength(inputs.overrideText, 'utf8');
  expect(overrideBytes === G8_V2_OVERRIDE_BYTES && sha256(inputs.overrideText) === G8_V2_OVERRIDE_SHA256, 'BR6C_OVERRIDE_ARTIFACT_INTEGRITY_MISMATCH');
  expect(sha256(inputs.g2StatusText) === G8_V2_G2_1_STATUS_SHA256, 'BR6C_G2_1_STATUS_INTEGRITY_MISMATCH');
  expect(inputs.g2StatusText.includes(G8_V2_G2_1_MAPPING_DIGEST) && inputs.g2StatusText.includes('data/2026/canonical-identity-overrides.json'), 'BR6C_G2_1_STATUS_CONTRACT_MISMATCH');
  expect(inputs.br6bPrivatePlan.sha256 === G8_V2_BR6B_CERTIFIED_PRIVATE_SHA256 && inputs.br6bPrivatePlan.bytes === 81_061_814, 'BR6C_BR6B_PRIVATE_PLAN_INTEGRITY_MISMATCH');
  const publicationPlan = buildCanonicalPublicationPlan(inputs.publication.inputs);
  const rawOverrides = JSON.parse(inputs.overrideText) as unknown;
  const validated = validateG8V2IdentityOverridePolicy({
    basePlan: inputs.basePlan,
    snapshot: inputs.snapshot,
    rawOverrides,
    publicationOverrides: inputs.publication.inputs.overrides,
    publicationMappingDigest: publicationPlan.mappingDigest,
  });
  const conflictByPath = new Map(inputs.snapshot.conflicts.map((conflict) => [conflict.path, conflict]));
  const entries = [...inputs.basePlan.entries].sort((left, right) => left.path.localeCompare(right.path)).map((baseEntry) => {
    const binding = validated.bindings.get(baseEntry.path);
    if (!binding) {
      expect(baseEntry.disposition !== 'unresolved' && baseEntry.pointerRules.every((rule) => rule.blockerClass === 'none'), 'BR6C_UNRESOLVED_NONEXCEPTION_PATH');
      return structuredClone(baseEntry);
    }
    const conflict = conflictByPath.get(baseEntry.path);
    expect(conflict !== undefined, 'BR6C_EXCEPTION_CONFLICT_BODY_MISSING');
    let converted = 0;
    const convertedRuntimePointers = new Set<string>();
    const targetDigests = new Set(binding.resolution.targetFecIdDigests);
    const pointerRules = baseEntry.pointerRules.map((rule) => {
      if (rule.blockerClass === 'none') {
        if (rule.kind !== 'production-only' || rule.provenanceClass !== 'runtime-metadata') return structuredClone(rule);
        expect(certifiedReplacementRuntimePointers.has(rule.pointer) && !convertedRuntimePointers.has(rule.pointer), 'BR6CR_UNEXPECTED_EXCEPTION_RUNTIME_METADATA_POINTER');
        convertedRuntimePointers.add(rule.pointer);
        return {
          ...structuredClone(rule),
          provenanceClass: 'current-certified-authoritative' as const,
          evidenceDigests: sortedUnique([...rule.evidenceDigests, validated.evidence.digests.policy, binding.resolution.resolutionDigest, G8_V2_OVERRIDE_SHA256]),
          rationale: 'The validated identity exception requires a complete certified candidate replacement, so stale production capture-time metadata is not merged into the proposed output.',
        };
      }
      const targetDigest = /\/@fec-sha256:([a-f0-9]{64})$/.exec(rule.pointer)?.[1] ?? '';
      expect(rule.kind === 'identity' && rule.blockerClass === 'identity-conflict' && targetDigests.has(targetDigest), 'BR6C_UNBOUND_IDENTITY_BLOCKER');
      converted += 1;
      return {
        ...structuredClone(rule),
        provenanceClass: 'current-certified-authoritative' as const,
        blockerClass: 'none' as const,
        evidenceDigests: sortedUnique([...rule.evidenceDigests, validated.evidence.digests.policy, binding.resolution.resolutionDigest, G8_V2_OVERRIDE_SHA256]),
        rationale: 'An exact validated G2.1 override binds this legacy candidate tuple to the certified canonical FEC identity; certified candidate, eligibility, publication, deadline, lock, and registry fields remain authoritative.',
      };
    });
    expect(converted === binding.resolution.resolvedIdentityBlockers, 'BR6C_RESOLVED_BLOCKER_COUNT_MISMATCH');
    expect(sameStrings([...convertedRuntimePointers].sort(), [...certifiedReplacementRuntimePointers].sort()), 'BR6CR_EXCEPTION_RUNTIME_METADATA_COVERAGE_MISMATCH');
    const drafted = draftG8V2RevisedDisposition(conflict, pointerRules);
    expect(drafted.disposition === 'replace-with-certified' && digest(drafted.output) === conflict.expectedDigest, 'BR6C_EXCEPTION_OUTPUT_NOT_CERTIFIED');
    const outputCandidates = candidateArray(drafted.output);
    for (const fecCandidateId of binding.targetFecIds) expect(outputCandidates.filter((candidate) => candidateFecId(candidate) === fecCandidateId && candidateIdentity(candidate) === `fec-${fecCandidateId}`).length === 1, 'BR6C_CANONICAL_OUTPUT_CANDIDATE_COUNT_MISMATCH');
    return {
      path: baseEntry.path,
      family: baseEntry.family,
      disposition: drafted.disposition,
      safeToReplace: true,
      pointerSignature: pointerSignature(pointerRules),
      pointerRules,
      evidenceDigests: sortedUnique([...baseEntry.evidenceDigests, validated.evidence.digests.policy, binding.resolution.resolutionDigest, G8_V2_OVERRIDE_SHA256]),
      proposedOutputDigest: digest(drafted.output),
      proposedOutputBasis: drafted.basis,
      rollbackDigest: conflict.actualDigest,
      rollbackEvidence: 'complete-actual-document-in-immutable-br5b-snapshot' as const,
      rationale: binding.resolution.resolutionKind === 'approved-many-to-one'
        ? 'the approved G2.1 merge group resolves both exact legacy aliases to one certified canonical candidate with complete private rollback evidence'
        : 'exact G2.1 overrides correct the duplicated legacy FEC identities to one-to-one certified canonical candidates',
    };
  });
  expect(entries.length === 858 && new Set(entries.map((entry) => entry.path)).size === 858, 'BR6C_DUPLICATE_OR_OMITTED_PATH');
  const aggregate = aggregateG8V2RevisedDispositionEntries(entries);
  expect(aggregate.plannedPaths === 858 && aggregate.duplicatePaths === 0 && aggregate.omittedPaths === 0, 'BR6C_PATH_COVERAGE_MISMATCH');
  const unresolved = entries.filter((entry) => entry.disposition === 'unresolved').length;
  const policyConflicts = entries.flatMap((entry) => entry.pointerRules).filter((rule) => rule.blockerClass !== 'none').length;
  const outputsDigest = digest(entries.map((entry) => ({ path: digest(entry.path), output: entry.proposedOutputDigest })));
  const rollbackDigest = digest({ entries: entries.map((entry) => ({ path: digest(entry.path), rollback: entry.rollbackDigest })), aliases: validated.evidence.digests.rollbackAliases });
  const readinessBase = {
    readyForExecutor: false,
    deterministicallyResolved: 858 - unresolved,
    unresolved,
    reproducibleOutputs: entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.proposedOutputDigest)) && /^[a-f0-9]{64}$/.test(outputsDigest),
    rollbackEvidenceComplete: entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.rollbackDigest) && entry.rollbackEvidence === 'complete-actual-document-in-immutable-br5b-snapshot') && validated.evidence.aggregate.consumedOverrides === 8,
    policyConflicts,
    remainingIdentityConflicts: validated.evidence.aggregate.remainingConflicts,
  };
  const readiness = { ...readinessBase, readyForExecutor: readinessBase.deterministicallyResolved === 858 && unresolved === 0 && readinessBase.reproducibleOutputs && readinessBase.rollbackEvidenceComplete && policyConflicts === 0 && readinessBase.remainingIdentityConflicts === 0 };
  expect(readiness.readyForExecutor, 'BR6C_EXECUTOR_READINESS_BLOCKED');
  const certifiedOverrides = {
    path: 'data/2026/canonical-identity-overrides.json' as const,
    bytes: G8_V2_OVERRIDE_BYTES,
    sha256: G8_V2_OVERRIDE_SHA256,
    g2StatusSha256: G8_V2_G2_1_STATUS_SHA256,
    mappingDigest: G8_V2_G2_1_MAPPING_DIGEST,
  };
  const base = {
    schemaVersion: 1 as const,
    contract: G8_V2_FINAL_IDENTITY_CONTRACT,
    pointerContract: G8_V2_FINAL_IDENTITY_POINTER_CONTRACT,
    basePlan: { contract: G8_V2_REVISED_DISPOSITION_CONTRACT, planDigest: G8_V2_BR6B_CERTIFIED_PLAN_DIGEST, privatePlanSha256: G8_V2_BR6B_CERTIFIED_PRIVATE_SHA256 },
    certifiedOverrides,
    identityResolution: validated.evidence,
    entries,
    aggregate,
    readiness,
    safety: { firebaseImported: false as const, credentialsLoaded: false as const, networkRequests: 0 as const, productionOperations: 0 as const, dispositionsExecuted: 0 as const },
  };
  const entriesDigest = digest(entries);
  const aggregateDigest = digest({ aggregate, readiness, identityResolution: validated.evidence.digests });
  return { ...base, digests: { entries: entriesDigest, aggregate: aggregateDigest, outputs: outputsDigest, rollback: rollbackDigest, plan: digest({ ...base, digests: { entries: entriesDigest, aggregate: aggregateDigest, outputs: outputsDigest, rollback: rollbackDigest } }) } };
}

export function loadG8V2IdentityExceptionBuildInputs(paths: G8V2IdentityExceptionPaths, activationPlan: G8V2ActivationPlan): G8V2IdentityExceptionBuildInputs {
  return {
    basePlan: loadG8V2RevisedDispositionPlan(paths, activationPlan),
    snapshot: JSON.parse(readFileSync(paths.snapshot, 'utf8')) as G8V2ConflictSnapshot,
    overrideText: readFileSync(paths.overrides, 'utf8'),
    g2StatusText: readFileSync(paths.g2Status, 'utf8'),
    publication: JSON.parse(readFileSync(paths.publication, 'utf8')) as CanonicalPublicationSnapshot,
    br6bPrivatePlan: fileIdentity(paths.br6bPrivatePlan),
  };
}

export function loadG8V2FinalIdentityResolutionPlan(paths: G8V2IdentityExceptionPaths, activationPlan: G8V2ActivationPlan) {
  return buildG8V2FinalIdentityResolutionPlan(loadG8V2IdentityExceptionBuildInputs(paths, activationPlan));
}

export function buildG8V2FinalIdentityAggregateReport(plan: G8V2FinalIdentityResolutionPlan) {
  return {
    schemaVersion: 1,
    contract: G8_V2_FINAL_IDENTITY_REPORT_CONTRACT,
    operation: 'g8-4br6c-offline-final-candidate-identity-resolution',
    basePlan: plan.basePlan,
    certifiedOverrides: plan.certifiedOverrides,
    resolvedRaces: resolvedRaceLabels,
    identityResolution: { contract: plan.identityResolution.contract, aggregate: plan.identityResolution.aggregate, digests: plan.identityResolution.digests },
    aggregate: plan.aggregate,
    readiness: plan.readiness,
    safety: plan.safety,
    digests: plan.digests,
  };
}

export function verifyG8V2FinalIdentityResolutionReplay(first: Pick<G8V2FinalIdentityResolutionPlan, 'digests'>, second: Pick<G8V2FinalIdentityResolutionPlan, 'digests'>) {
  expect(first.digests.entries === second.digests.entries && first.digests.aggregate === second.digests.aggregate && first.digests.outputs === second.digests.outputs && first.digests.rollback === second.digests.rollback && first.digests.plan === second.digests.plan, 'BR6C_NONDETERMINISTIC_REPLAY');
  return true;
}
