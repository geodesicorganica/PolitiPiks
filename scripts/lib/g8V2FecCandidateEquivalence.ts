import { readFileSync } from 'node:fs';
import { buildCanonicalPublicationPlan, type CanonicalPublicationSnapshot } from './canonicalPublication.js';
import { validateFecBulkFinanceSnapshot, type FecBulkFinanceSnapshot } from './fecBulkFinance.js';
import { CANONICAL_2026_FEDERAL_CONTESTS, isValidFecHouseDistrict } from '../../ingest/src/federalRegistry.js';
import { localProductDigest, type LocalProductBundle } from './localProductBundle.js';
import { type G8V2ConflictDocument, type G8V2ConflictFamily, type G8V2ConflictSnapshot } from './g8V2ConflictAnalysis.js';
import {
  buildG8V2LineageCatalog,
  classifyG8V2DispositionDifference,
  diffG8V2DispositionValues,
  loadG8V2DispositionPlan,
  G8_V2_DISPOSITION_CONTRACT,
  type G8V2DispositionDifference,
  type G8V2DispositionPaths,
  type G8V2DispositionPlan,
  type G8V2DispositionPointerRule,
  type G8V2DraftDisposition,
} from './g8V2ConflictDisposition.js';
import type { G8V2ActivationPlan } from './g8V2Activation.js';

type Json = Record<string, unknown>;

export const G8_V2_FEC_EQUIVALENCE_CONTRACT = 'g8-4br6b-fec-candidate-equivalence/v1' as const;
export const G8_V2_REVISED_DISPOSITION_CONTRACT = 'g8-4br6b-revised-disposition-plan/v1' as const;
export const G8_V2_REVISED_DISPOSITION_REPORT_CONTRACT = 'g8-4br6b-revised-disposition-report/v1' as const;
export const G8_V2_FEC_POINTER_CONTRACT = 'g8-4br6b-fec-equivalent-pointer-rules/v1' as const;
export const G8_V2_BR6A_CERTIFIED_PLAN_DIGEST = '15f456e459c18fd0db51275b0c22de7b1fe5f9fb6b3dca841f111b9469c28cd9' as const;

export type G8V2FecRejectClass =
  | 'invalid-fec-id'
  | 'missing-actual-candidate'
  | 'missing-certified-candidate'
  | 'duplicate-actual-fec-id'
  | 'duplicate-certified-fec-id'
  | 'cross-race-reused-fec-id'
  | 'office-mismatch'
  | 'state-mismatch'
  | 'seat-mismatch'
  | 'cycle-mismatch'
  | 'canonical-contest-mismatch'
  | 'certified-candidate-mismatch'
  | 'official-fec-baseline-mismatch'
  | 'contradictory-finance-evidence';

export type G8V2FecPairEvidence = {
  racePathDigest: string;
  fecCandidateIdDigest: string | null;
  status: 'accepted' | 'rejected';
  rejectClasses: G8V2FecRejectClass[];
  actualMultiplicity: number;
  certifiedMultiplicity: number;
  actualCandidateIdDigest: string | null;
  certifiedCandidateIdDigest: string | null;
  checks: {
    fecFormat: boolean;
    uniqueOnActualSide: boolean;
    uniqueOnCertifiedSide: boolean;
    notReusedAcrossRaces: boolean;
    office: boolean;
    state: boolean;
    districtSeat: boolean;
    cycle: boolean;
    canonicalContest: boolean;
    certifiedCurrentCandidate: boolean;
    officialFecBaseline: boolean;
    financeEvidence: 'matched' | 'not-present' | 'contradictory';
  };
  evidenceDigests: string[];
  pairDigest: string;
};

export type G8V2FecRaceEvidence = {
  racePathDigest: string;
  acceptedPairs: number;
  rejectedPairs: number;
  fullyResolved: boolean;
  actualCandidates: number;
  certifiedCandidates: number;
  rejectClasses: G8V2FecRejectClass[];
  pairEvidenceDigest: string;
};

export type G8V2FecEquivalenceEvidence = {
  schemaVersion: 1;
  contract: typeof G8_V2_FEC_EQUIVALENCE_CONTRACT;
  lineageCatalogDigest: string;
  policy: {
    sameNonemptyFecIdRequired: true;
    uniqueWithinCanonicalRaceRequired: true;
    crossRaceReuseRejected: true;
    canonicalSeatCycleAndContestRequired: true;
    certifiedCurrentIdentityAndEligibilityAuthoritative: true;
    br6aLineageRequiredForPreservation: true;
    diagnosticFieldsCannotEstablishIdentity: readonly ['candidate-order','normalized-name','party','incumbent-flag','bioguide-id'];
  };
  pairs: G8V2FecPairEvidence[];
  races: G8V2FecRaceEvidence[];
  aggregate: {
    raceConflicts: number;
    actualCandidates: number;
    certifiedCandidates: number;
    acceptedFecPairs: number;
    rejectedFecPairs: number;
    fullyResolvedRaces: number;
    remainingRaces: number;
    invalidFecCandidates: number;
    duplicateFecIds: number;
    duplicateActualFecIds: number;
    duplicateCertifiedFecIds: number;
    reusedFecIds: number;
    seatMismatches: number;
    contradictoryEvidence: number;
    financeMatchedPairs: number;
    financeNotPresentPairs: number;
    byRejectClass: Record<G8V2FecRejectClass, number>;
  };
  safety: { firebaseImported: false; credentialsLoaded: false; networkRequests: 0; productionOperations: 0 };
  digests: { pairs: string; races: string; evidence: string };
};

export type G8V2RevisedDispositionEntry = {
  path: string;
  family: G8V2ConflictFamily;
  disposition: G8V2DraftDisposition;
  safeToReplace: boolean;
  pointerSignature: string;
  pointerRules: G8V2DispositionPointerRule[];
  evidenceDigests: string[];
  proposedOutputDigest: string;
  proposedOutputBasis: 'preserved-current' | 'certified-output' | 'deterministic-merge' | 'no-op-unresolved';
  rollbackDigest: string;
  rollbackEvidence: 'complete-actual-document-in-immutable-br5b-snapshot';
  rationale: string;
};

export type G8V2RevisedDispositionPlan = {
  schemaVersion: 1;
  contract: typeof G8_V2_REVISED_DISPOSITION_CONTRACT;
  pointerContract: typeof G8_V2_FEC_POINTER_CONTRACT;
  basePlan: { contract: typeof G8_V2_DISPOSITION_CONTRACT; planDigest: typeof G8_V2_BR6A_CERTIFIED_PLAN_DIGEST };
  equivalence: G8V2FecEquivalenceEvidence;
  entries: G8V2RevisedDispositionEntry[];
  aggregate: ReturnType<typeof aggregateG8V2RevisedDispositionEntries>;
  readiness: {
    readyForExecutor: boolean;
    deterministicallyResolved: number;
    unresolved: number;
    reproducibleOutputs: boolean;
    rollbackEvidenceComplete: boolean;
    policyConflicts: number;
    nextEvidenceBatches: Array<{
      batchId: string;
      racePathDigest: string;
      rejectedFecPairs: number;
      exceptionClasses: G8V2FecRejectClass[];
      requiredEvidence: 'unique noncontradictory official FEC candidate mapping for this canonical race';
    }>;
  };
  safety: { firebaseImported: false; credentialsLoaded: false; networkRequests: 0; productionOperations: 0 };
  digests: { entries: string; aggregate: string; plan: string };
};

const FEC_ID = /^[HS]\d[A-Z]{2}\d{5}$/;
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const digest = (value: unknown) => localProductDigest(value);
const sortedUnique = (values: string[]) => [...new Set(values)].sort();
const pointerToken = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
const pointerUntoken = (value: string) => value.replace(/~1/g, '/').replace(/~0/g, '~');
const candidateFecId = (value: unknown) => isRecord(value) && isRecord(value.externalIds) ? text(value.externalIds.fecCandidateId) : '';
const candidateIdentity = (value: unknown) => isRecord(value) ? text(value.id) || text(value.candidateId) : '';

function expect(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) { const value = key(item); counts.set(value, (counts.get(value) ?? 0) + 1); }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function completeCounts<const T extends readonly string[]>(labels: T, counts: Record<string, number>) {
  return Object.fromEntries(labels.map((label) => [label, counts[label] ?? 0])) as Record<T[number], number>;
}

const rejectClasses = [
  'invalid-fec-id','missing-actual-candidate','missing-certified-candidate','duplicate-actual-fec-id','duplicate-certified-fec-id',
  'cross-race-reused-fec-id','office-mismatch','state-mismatch','seat-mismatch','cycle-mismatch','canonical-contest-mismatch',
  'certified-candidate-mismatch','official-fec-baseline-mismatch','contradictory-finance-evidence',
] as const satisfies readonly G8V2FecRejectClass[];

function candidateArray(value: unknown) {
  return isRecord(value) && Array.isArray(value.candidates) ? value.candidates : [];
}

function indexCandidates(values: unknown[]) {
  const byFec = new Map<string, unknown[]>();
  const invalid: unknown[] = [];
  for (const candidate of values) {
    const fecCandidateId = candidateFecId(candidate);
    if (!FEC_ID.test(fecCandidateId)) { invalid.push(candidate); continue; }
    byFec.set(fecCandidateId, [...(byFec.get(fecCandidateId) ?? []), candidate]);
  }
  return { byFec, invalid };
}

function raceReuse(conflicts: G8V2ConflictDocument[], side: 'actual' | 'expected') {
  const memberships = new Map<string, Set<string>>();
  for (const conflict of conflicts) {
    for (const candidate of candidateArray(conflict[side])) {
      const fecCandidateId = candidateFecId(candidate);
      if (!FEC_ID.test(fecCandidateId)) continue;
      const paths = memberships.get(fecCandidateId) ?? new Set<string>();
      paths.add(conflict.path); memberships.set(fecCandidateId, paths);
    }
  }
  return new Set([...memberships].filter(([, paths]) => paths.size > 1).map(([fecCandidateId]) => fecCandidateId));
}

function rawPublicationDocuments(publication: CanonicalPublicationSnapshot) {
  const documents = new Map<string, Json>();
  for (const race of publication.inputs.races) documents.set(`races/${race.id}`, race);
  for (const research of publication.inputs.candidateResearch) documents.set(`races/${research.raceId}/candidateResearch/${research.candidateId}`, research.data);
  for (const metric of publication.inputs.contestMetrics) documents.set(`contestMetrics/${metric.raceId}`, metric.data);
  return documents;
}

function canonicalRawPublicationCandidates(publication: CanonicalPublicationSnapshot) {
  const plan = buildCanonicalPublicationPlan(publication.inputs);
  const raceMap = new Map(plan.mapping.raceMappings.map((mapping) => [mapping.from, mapping.to]));
  const candidates = new Map<string, unknown[]>();
  for (const race of publication.inputs.races) {
    const path = `races/${raceMap.get(race.id) ?? race.id}`;
    candidates.set(path, [...(candidates.get(path) ?? []), ...race.candidates]);
  }
  return candidates;
}

function canonicalIndexes(bundle: LocalProductBundle, publication: CanonicalPublicationSnapshot, finance: FecBulkFinanceSnapshot) {
  const bundleRaces = new Map(bundle.documents.filter((item) => /^races\/[^/]+$/.test(item.path)).map((item) => [item.path, item.data]));
  const research = new Map(bundle.documents.filter((item) => /^races\/[^/]+\/candidateResearch\/[^/]+$/.test(item.path)).map((item) => [item.path, item.data]));
  const publicationPlan = buildCanonicalPublicationPlan(publication.inputs);
  const publicationRaces = new Map(publicationPlan.documents.filter((item) => /^races\/[^/]+$/.test(item.path)).map((item) => [item.path, item.data]));
  const financeFacts = new Map(finance.candidateFacts.map((item) => [`${item.raceId}/${item.fecCandidateId}`, item]));
  const financeRecords = new Map(finance.capture.records.map((item) => [`${item.raceId}/${item.fecCandidateId}`, item]));
  return { bundleRaces, research, publicationPlan, publicationRaces, financeFacts, financeRecords };
}

function validateCanonicalPair(options: {
  path: string;
  fecCandidateId: string;
  certifiedCandidate: unknown;
  bundle: LocalProductBundle;
  publication: CanonicalPublicationSnapshot;
  finance: FecBulkFinanceSnapshot;
  indexes: ReturnType<typeof canonicalIndexes>;
  lineageEvidenceDigests: string[];
}) {
  const { path, fecCandidateId, certifiedCandidate, indexes } = options;
  const raceId = path.replace(/^races\//, '');
  const canonicalId = `fec-${fecCandidateId}`;
  const race = indexes.bundleRaces.get(path);
  const publicationRace = indexes.publicationRaces.get(path);
  const raceCandidates = candidateArray(race);
  const publicationCandidates = candidateArray(publicationRace);
  const matchingBundleCandidates = raceCandidates.filter((candidate) => candidateFecId(candidate) === fecCandidateId);
  const matchingPublicationCandidates = publicationCandidates.filter((candidate) => candidateFecId(candidate) === fecCandidateId);
  const research = indexes.research.get(`${path}/candidateResearch/${canonicalId}`);
  const identity = isRecord(research?.baselineResearch) && isRecord(research.baselineResearch.fields)
    && isRecord(research.baselineResearch.fields.identity) ? research.baselineResearch.fields.identity : undefined;
  const identityValue = isRecord(identity?.value) ? identity.value : undefined;
  const raceOffice = text(race?.office);
  const raceState = text(race?.state);
  const raceDistrict = race?.district === null ? null : text(race?.district);
  const office = (fecCandidateId[0] === 'H' ? 'House' : fecCandidateId[0] === 'S' ? 'Senate' : '');
  const state = fecCandidateId.slice(2, 4);
  const canonicalSeat = CANONICAL_2026_FEDERAL_CONTESTS.find((seat) => seat.id === raceId);
  const officeOk = office.length > 0 && office === raceOffice && canonicalSeat?.office === raceOffice;
  const stateOk = state === raceState && canonicalSeat?.state === raceState;
  const districtSeatOk = canonicalSeat !== undefined
    && canonicalSeat.district === raceDistrict
    && (raceOffice === 'House' ? isValidFecHouseDistrict(raceState, raceDistrict) : raceOffice === 'Senate' && raceDistrict === null && Number.isInteger(race?.senateClass));
  const certifiedCurrentCandidate = matchingBundleCandidates.length === 1
    && matchingPublicationCandidates.length === 1
    && candidateIdentity(certifiedCandidate) === canonicalId
    && candidateIdentity(matchingBundleCandidates[0]) === canonicalId
    && candidateIdentity(matchingPublicationCandidates[0]) === canonicalId
    && digest(matchingBundleCandidates[0]) === digest(certifiedCandidate);
  const canonicalContest = text(race?.id) === raceId
    && text(research?.raceId) === raceId
    && text(research?.candidateId) === canonicalId
    && options.publication.inputs.generation === 'canonical-2026-shadow-v2'
    && options.bundle.generation === 'canonical-2026-shadow-v2';
  const officialFecBaseline = identity?.availability === 'present'
    && identity?.verificationLevel === 'official'
    && text(identityValue?.fecCandidateId) === fecCandidateId
    && text(identity?.sourceId) === canonicalId
    && text(identity?.sourceUrl) === `https://www.fec.gov/data/candidate/${fecCandidateId}/`
    && text(identity?.sourceVintage) === 'canonical-publication-schema-v3';
  const identityAsOf = text(identity?.asOf);
  let cycle = race?.electionYear === 2026 && /^2026-/.test(identityAsOf);
  const financeFact = indexes.financeFacts.get(`${raceId}/${fecCandidateId}`);
  const financeRecord = indexes.financeRecords.get(`${raceId}/${fecCandidateId}`);
  let financeEvidence: 'matched' | 'not-present' | 'contradictory' = 'not-present';
  if (financeFact || financeRecord) {
    const factMatches = financeFact !== undefined
      && financeFact.raceId === raceId && financeFact.candidateId === canonicalId && financeFact.fecCandidateId === fecCandidateId
      && financeFact.office === raceOffice && financeFact.state === raceState
      && financeFact.district === raceDistrict;
    const recordMatches = financeRecord !== undefined
      && financeRecord.raceId === raceId && financeRecord.candidateId === canonicalId && financeRecord.fecCandidateId === fecCandidateId && financeRecord.cycle === 2026;
    financeEvidence = factMatches && recordMatches ? 'matched' : 'contradictory';
    cycle = cycle && recordMatches;
  }
  const evidenceDigests = sortedUnique([
    ...options.lineageEvidenceDigests,
    text(research?.baselineResearch && isRecord(research.baselineResearch) ? research.baselineResearch.evidenceDigest : ''),
    ...(financeFact ? [digest(financeFact)] : []),
    ...(financeRecord ? [digest(financeRecord)] : []),
    options.finance.inputDigest,
    options.finance.archiveDigest,
    options.indexes.publicationPlan.planDigest,
  ].filter((value) => /^[a-f0-9]{64}$/.test(value)));
  return { office: officeOk, state: stateOk, districtSeat: districtSeatOk, cycle, canonicalContest, certifiedCurrentCandidate, officialFecBaseline, financeEvidence, evidenceDigests };
}

function rejectedFromChecks(checks: ReturnType<typeof validateCanonicalPair>) {
  const reasons: G8V2FecRejectClass[] = [];
  if (!checks.office) reasons.push('office-mismatch');
  if (!checks.state) reasons.push('state-mismatch');
  if (!checks.districtSeat) reasons.push('seat-mismatch');
  if (!checks.cycle) reasons.push('cycle-mismatch');
  if (!checks.canonicalContest) reasons.push('canonical-contest-mismatch');
  if (!checks.certifiedCurrentCandidate) reasons.push('certified-candidate-mismatch');
  if (!checks.officialFecBaseline) reasons.push('official-fec-baseline-mismatch');
  if (checks.financeEvidence === 'contradictory') reasons.push('contradictory-finance-evidence');
  return reasons;
}

function buildFecEquivalenceEvidence(options: {
  raceConflicts: G8V2ConflictDocument[];
  bundle: LocalProductBundle;
  publication: CanonicalPublicationSnapshot;
  finance: FecBulkFinanceSnapshot;
  lineageCatalogDigest: string;
  lineageEvidenceDigests: string[];
}) {
  const actualReuse = raceReuse(options.raceConflicts, 'actual');
  const certifiedReuse = raceReuse(options.raceConflicts, 'expected');
  const reused = new Set([...actualReuse, ...certifiedReuse]);
  const indexes = canonicalIndexes(options.bundle, options.publication, options.finance);
  const pairs: G8V2FecPairEvidence[] = [];
  const races: G8V2FecRaceEvidence[] = [];
  const acceptedFecDigestsByPath = new Map<string, Set<string>>();
  let invalidFecCandidates = 0;
  const duplicateActual = new Set<string>();
  const duplicateCertified = new Set<string>();

  for (const conflict of [...options.raceConflicts].sort((left, right) => left.path.localeCompare(right.path))) {
    const actualCandidates = candidateArray(conflict.actual);
    const certifiedCandidates = candidateArray(conflict.expected);
    const actual = indexCandidates(actualCandidates);
    const certified = indexCandidates(certifiedCandidates);
    invalidFecCandidates += actual.invalid.length + certified.invalid.length;
    const pairStart = pairs.length;
    const fecIds = sortedUnique([...actual.byFec.keys(), ...certified.byFec.keys()]);
    for (const fecCandidateId of fecIds) {
      const actualMatches = actual.byFec.get(fecCandidateId) ?? [];
      const certifiedMatches = certified.byFec.get(fecCandidateId) ?? [];
      const reasons: G8V2FecRejectClass[] = [];
      if (!FEC_ID.test(fecCandidateId)) reasons.push('invalid-fec-id');
      if (actualMatches.length === 0) reasons.push('missing-actual-candidate');
      if (certifiedMatches.length === 0) reasons.push('missing-certified-candidate');
      if (actualMatches.length > 1) { reasons.push('duplicate-actual-fec-id'); duplicateActual.add(fecCandidateId); }
      if (certifiedMatches.length > 1) { reasons.push('duplicate-certified-fec-id'); duplicateCertified.add(fecCandidateId); }
      if (reused.has(fecCandidateId)) reasons.push('cross-race-reused-fec-id');
      const canonicalChecks = certifiedMatches.length === 1 ? validateCanonicalPair({
        path: conflict.path, fecCandidateId, certifiedCandidate: certifiedMatches[0], bundle: options.bundle, publication: options.publication,
        finance: options.finance, indexes, lineageEvidenceDigests: options.lineageEvidenceDigests,
      }) : {
        office: false, state: false, districtSeat: false, cycle: false, canonicalContest: false, certifiedCurrentCandidate: false,
        officialFecBaseline: false, financeEvidence: 'not-present' as const, evidenceDigests: options.lineageEvidenceDigests,
      };
      if (certifiedMatches.length === 1) reasons.push(...rejectedFromChecks(canonicalChecks));
      const reject = sortedUnique(reasons) as G8V2FecRejectClass[];
      const base = {
        racePathDigest: digest(conflict.path),
        fecCandidateIdDigest: digest(fecCandidateId),
        status: reject.length === 0 ? 'accepted' as const : 'rejected' as const,
        rejectClasses: reject,
        actualMultiplicity: actualMatches.length,
        certifiedMultiplicity: certifiedMatches.length,
        actualCandidateIdDigest: actualMatches.length === 1 ? digest(candidateIdentity(actualMatches[0])) : null,
        certifiedCandidateIdDigest: certifiedMatches.length === 1 ? digest(candidateIdentity(certifiedMatches[0])) : null,
        checks: {
          fecFormat: FEC_ID.test(fecCandidateId), uniqueOnActualSide: actualMatches.length === 1, uniqueOnCertifiedSide: certifiedMatches.length === 1,
          notReusedAcrossRaces: !reused.has(fecCandidateId), office: canonicalChecks.office, state: canonicalChecks.state,
          districtSeat: canonicalChecks.districtSeat, cycle: canonicalChecks.cycle, canonicalContest: canonicalChecks.canonicalContest,
          certifiedCurrentCandidate: canonicalChecks.certifiedCurrentCandidate, officialFecBaseline: canonicalChecks.officialFecBaseline,
          financeEvidence: canonicalChecks.financeEvidence,
        },
        evidenceDigests: canonicalChecks.evidenceDigests,
      };
      const pair: G8V2FecPairEvidence = { ...base, pairDigest: digest(base) };
      pairs.push(pair);
      if (pair.status === 'accepted') {
        const accepted = acceptedFecDigestsByPath.get(conflict.path) ?? new Set<string>();
        accepted.add(pair.fecCandidateIdDigest!); acceptedFecDigestsByPath.set(conflict.path, accepted);
      }
    }
    for (const [side, invalid] of [['actual', actual.invalid], ['certified', certified.invalid]] as const) {
      for (const candidate of invalid) {
        const reasons: G8V2FecRejectClass[] = ['invalid-fec-id', side === 'actual' ? 'missing-certified-candidate' : 'missing-actual-candidate'];
        const base = {
          racePathDigest: digest(conflict.path), fecCandidateIdDigest: null, status: 'rejected' as const, rejectClasses: reasons,
          actualMultiplicity: side === 'actual' ? 1 : 0, certifiedMultiplicity: side === 'certified' ? 1 : 0,
          actualCandidateIdDigest: side === 'actual' ? digest(candidateIdentity(candidate)) : null,
          certifiedCandidateIdDigest: side === 'certified' ? digest(candidateIdentity(candidate)) : null,
          checks: { fecFormat: false, uniqueOnActualSide: side === 'actual', uniqueOnCertifiedSide: side === 'certified', notReusedAcrossRaces: true,
            office: false, state: false, districtSeat: false, cycle: false, canonicalContest: false, certifiedCurrentCandidate: false,
            officialFecBaseline: false, financeEvidence: 'not-present' as const },
          evidenceDigests: options.lineageEvidenceDigests,
        };
        pairs.push({ ...base, pairDigest: digest(base) });
      }
    }
    const racePairs = pairs.slice(pairStart);
    const acceptedPairs = racePairs.filter((pair) => pair.status === 'accepted').length;
    const rejectedPairs = racePairs.length - acceptedPairs;
    const fullyResolved = rejectedPairs === 0 && acceptedPairs === actualCandidates.length && acceptedPairs === certifiedCandidates.length;
    const raceBase = {
      racePathDigest: digest(conflict.path), acceptedPairs, rejectedPairs, fullyResolved,
      actualCandidates: actualCandidates.length, certifiedCandidates: certifiedCandidates.length,
      rejectClasses: sortedUnique(racePairs.flatMap((pair) => pair.rejectClasses)) as G8V2FecRejectClass[],
      pairEvidenceDigest: digest(racePairs.map((pair) => pair.pairDigest)),
    };
    races.push(raceBase);
  }
  pairs.sort((left, right) => left.racePathDigest.localeCompare(right.racePathDigest) || (left.fecCandidateIdDigest ?? '').localeCompare(right.fecCandidateIdDigest ?? '') || left.pairDigest.localeCompare(right.pairDigest));
  races.sort((left, right) => left.racePathDigest.localeCompare(right.racePathDigest));
  const duplicateFecIds = new Set([...duplicateActual, ...duplicateCertified]).size;
  const byRejectClass = completeCounts(rejectClasses, countBy(pairs.flatMap((pair) => pair.rejectClasses), (value) => value));
  const aggregate = {
    raceConflicts: options.raceConflicts.length,
    actualCandidates: options.raceConflicts.reduce((sum, conflict) => sum + candidateArray(conflict.actual).length, 0),
    certifiedCandidates: options.raceConflicts.reduce((sum, conflict) => sum + candidateArray(conflict.expected).length, 0),
    acceptedFecPairs: pairs.filter((pair) => pair.status === 'accepted').length,
    rejectedFecPairs: pairs.filter((pair) => pair.status === 'rejected').length,
    fullyResolvedRaces: races.filter((race) => race.fullyResolved).length,
    remainingRaces: races.filter((race) => !race.fullyResolved).length,
    invalidFecCandidates,
    duplicateFecIds,
    duplicateActualFecIds: duplicateActual.size,
    duplicateCertifiedFecIds: duplicateCertified.size,
    reusedFecIds: reused.size,
    seatMismatches: pairs.filter((pair) => pair.rejectClasses.some((reason) => ['office-mismatch','state-mismatch','seat-mismatch'].includes(reason))).length,
    contradictoryEvidence: pairs.filter((pair) => pair.rejectClasses.some((reason) => ['cycle-mismatch','canonical-contest-mismatch','certified-candidate-mismatch','official-fec-baseline-mismatch','contradictory-finance-evidence'].includes(reason))).length,
    financeMatchedPairs: pairs.filter((pair) => pair.status === 'accepted' && pair.checks.financeEvidence === 'matched').length,
    financeNotPresentPairs: pairs.filter((pair) => pair.status === 'accepted' && pair.checks.financeEvidence === 'not-present').length,
    byRejectClass,
  };
  expect(aggregate.acceptedFecPairs + aggregate.rejectedFecPairs === pairs.length, 'BR6B_FEC_PAIR_ACCOUNTING_MISMATCH');
  expect(aggregate.fullyResolvedRaces + aggregate.remainingRaces === options.raceConflicts.length, 'BR6B_FEC_RACE_ACCOUNTING_MISMATCH');
  const pairsDigest = digest(pairs); const racesDigest = digest(races);
  const base = {
    schemaVersion: 1 as const, contract: G8_V2_FEC_EQUIVALENCE_CONTRACT, lineageCatalogDigest: options.lineageCatalogDigest,
    policy: {
      sameNonemptyFecIdRequired: true as const, uniqueWithinCanonicalRaceRequired: true as const, crossRaceReuseRejected: true as const,
      canonicalSeatCycleAndContestRequired: true as const, certifiedCurrentIdentityAndEligibilityAuthoritative: true as const,
      br6aLineageRequiredForPreservation: true as const,
      diagnosticFieldsCannotEstablishIdentity: ['candidate-order','normalized-name','party','incumbent-flag','bioguide-id'] as const,
    },
    pairs, races, aggregate,
    safety: { firebaseImported: false as const, credentialsLoaded: false as const, networkRequests: 0 as const, productionOperations: 0 as const },
  };
  const evidence: G8V2FecEquivalenceEvidence = { ...base, digests: { pairs: pairsDigest, races: racesDigest, evidence: digest({ ...base, digests: { pairs: pairsDigest, races: racesDigest } }) } };
  return { evidence, acceptedFecDigestsByPath };
}

function candidateFecIndex(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  const values = new Map<string, unknown[]>();
  const invalid: unknown[] = [];
  for (const item of value) {
    const fecCandidateId = candidateFecId(item);
    if (!FEC_ID.test(fecCandidateId)) { invalid.push(item); continue; }
    ids.push(fecCandidateId);
    values.set(fecCandidateId, [...(values.get(fecCandidateId) ?? []), item]);
  }
  return { ids, values, invalid };
}

function isCandidatePointer(pointer: string) {
  return /(?:^|\/)candidates$/.test(pointer);
}

function compareFecEquivalentValues(actual: unknown, expected: unknown, pointer: string, acceptedFecDigests: Set<string>): G8V2DispositionDifference[] {
  if (actual !== undefined && expected !== undefined && digest(actual) === digest(expected)) return [];
  if ((Array.isArray(actual) || Array.isArray(expected)) && isCandidatePointer(pointer)) {
    const actualIndex = candidateFecIndex(actual === undefined ? [] : actual);
    const expectedIndex = candidateFecIndex(expected === undefined ? [] : expected);
    if (!actualIndex || !expectedIndex) return [{ pointer: pointer || '/', kind: 'identity', actualValueDigest: actual === undefined ? null : digest(actual), expectedValueDigest: expected === undefined ? null : digest(expected), identityDigest: digest({ actualArray: Array.isArray(actual), expectedArray: Array.isArray(expected) }), identitySide: 'invalid-or-duplicate' }];
    const differences: G8V2DispositionDifference[] = [];
    const actualUniqueIds = actualIndex.ids.filter((id) => actualIndex.values.get(id)?.length === 1);
    const expectedUniqueIds = expectedIndex.ids.filter((id) => expectedIndex.values.get(id)?.length === 1);
    const acceptedIds = sortedUnique([...actualIndex.values.keys(), ...expectedIndex.values.keys()]).filter((id) => acceptedFecDigests.has(digest(id)));
    const fullyAccepted = actualIndex.invalid.length === 0 && expectedIndex.invalid.length === 0
      && actualIndex.ids.length === expectedIndex.ids.length && acceptedIds.length === actualIndex.ids.length
      && actualUniqueIds.length === actualIndex.ids.length && expectedUniqueIds.length === expectedIndex.ids.length;
    if (fullyAccepted && actualIndex.ids.some((id, index) => id !== expectedIndex.ids[index])) {
      differences.push({ pointer: pointer || '/', kind: 'reorder', actualValueDigest: digest(actualIndex.ids.map(digest)), expectedValueDigest: digest(expectedIndex.ids.map(digest)) });
    }
    for (const fecCandidateId of sortedUnique([...actualIndex.values.keys(), ...expectedIndex.values.keys()])) {
      const actualValues = actualIndex.values.get(fecCandidateId) ?? [];
      const expectedValues = expectedIndex.values.get(fecCandidateId) ?? [];
      const fecDigest = digest(fecCandidateId);
      const durablePointer = `${pointer}/${pointerToken(`@fec-sha256:${fecDigest}`)}`;
      if (acceptedFecDigests.has(fecDigest) && actualValues.length === 1 && expectedValues.length === 1) {
        differences.push(...compareFecEquivalentValues(actualValues[0], expectedValues[0], durablePointer, acceptedFecDigests));
      } else {
        differences.push({ pointer: durablePointer, kind: 'identity', actualValueDigest: actualValues.length === 1 ? digest(actualValues[0]) : actualValues.length === 0 ? null : digest(actualValues), expectedValueDigest: expectedValues.length === 1 ? digest(expectedValues[0]) : expectedValues.length === 0 ? null : digest(expectedValues), identityDigest: fecDigest, identitySide: actualValues.length === 0 ? 'expected-only' : expectedValues.length === 0 ? 'production-only' : 'invalid-or-duplicate' });
      }
    }
    for (const [side, invalid] of [['actual', actualIndex.invalid], ['expected', expectedIndex.invalid]] as const) {
      for (const item of invalid) differences.push({ pointer: `${pointer}/${pointerToken(`@invalid-sha256:${digest(item)}`)}`, kind: 'identity', actualValueDigest: side === 'actual' ? digest(item) : null, expectedValueDigest: side === 'expected' ? digest(item) : null, identityDigest: digest(item), identitySide: 'invalid-or-duplicate' });
    }
    return differences;
  }
  if (isRecord(actual) && isRecord(expected)) return sortedUnique([...Object.keys(actual), ...Object.keys(expected)]).flatMap((key) => compareFecEquivalentValues(actual[key], expected[key], `${pointer}/${pointerToken(key)}`, acceptedFecDigests));
  if (Array.isArray(actual) && Array.isArray(expected)) return Array.from({ length: Math.max(actual.length, expected.length) }, (_, index) => compareFecEquivalentValues(actual[index], expected[index], `${pointer}/${index}`, acceptedFecDigests)).flat();
  if (isRecord(actual) && expected === undefined) return Object.keys(actual).sort().flatMap((key) => compareFecEquivalentValues(actual[key], undefined, `${pointer}/${pointerToken(key)}`, acceptedFecDigests));
  if (isRecord(expected) && actual === undefined) return Object.keys(expected).sort().flatMap((key) => compareFecEquivalentValues(undefined, expected[key], `${pointer}/${pointerToken(key)}`, acceptedFecDigests));
  if (Array.isArray(actual) && expected === undefined) return actual.flatMap((item, index) => compareFecEquivalentValues(item, undefined, `${pointer}/${index}`, acceptedFecDigests));
  if (Array.isArray(expected) && actual === undefined) return expected.flatMap((item, index) => compareFecEquivalentValues(undefined, item, `${pointer}/${index}`, acceptedFecDigests));
  return [{ pointer: pointer || '/', kind: actual === undefined ? 'expected-only' : expected === undefined ? 'production-only' : 'value', actualValueDigest: actual === undefined ? null : digest(actual), expectedValueDigest: expected === undefined ? null : digest(expected) }];
}

export function diffG8V2FecEquivalentValues(actual: Json, expected: Json, acceptedFecDigests: Set<string>) {
  return compareFecEquivalentValues(actual, expected, '', acceptedFecDigests);
}

function getPointer(value: unknown, pointer: string): unknown {
  if (pointer === '/') return value;
  let current = value;
  for (const raw of pointer.split('/').slice(1)) {
    const key = pointerUntoken(raw);
    if (key.startsWith('@fec-sha256:')) {
      if (!Array.isArray(current)) return undefined;
      const fecDigest = key.slice('@fec-sha256:'.length);
      const matches = current.filter((item) => FEC_ID.test(candidateFecId(item)) && digest(candidateFecId(item)) === fecDigest);
      if (matches.length !== 1) return undefined;
      current = matches[0]; continue;
    }
    if (Array.isArray(current)) { if (!/^\d+$/.test(key)) return undefined; current = current[Number(key)]; }
    else if (isRecord(current)) current = current[key];
    else return undefined;
  }
  return current;
}

function canonicalRawCandidateSourceValues(candidates: Map<string, unknown[]>, path: string, pointer: string) {
  const match = /^\/candidates\/@fec-sha256:([a-f0-9]{64})(\/.*)?$/.exec(pointer);
  if (!match) return [];
  const fecDigest = match[1]; const suffix = match[2] || '/';
  return (candidates.get(path) ?? []).filter((candidate) => FEC_ID.test(candidateFecId(candidate)) && digest(candidateFecId(candidate)) === fecDigest)
    .map((candidate) => getPointer(candidate, suffix)).filter((value) => value !== undefined);
}

function classifyRevisedDifference(options: Parameters<typeof classifyG8V2DispositionDifference>[0] & {
  canonicalRawCandidates: Map<string, unknown[]>;
  publicationArtifactDigest: string;
}) {
  const base = classifyG8V2DispositionDifference(options);
  if (options.difference.kind !== 'production-only' || !options.difference.pointer.includes('@fec-sha256:') || base.provenanceClass === 'runtime-metadata') return base;
  const sourceValues = canonicalRawCandidateSourceValues(options.canonicalRawCandidates, options.path, options.difference.pointer);
  const distinct = new Set(sourceValues.map(digest));
  if (distinct.size > 1) return {
    ...base, provenanceClass: 'ambiguous/unresolved' as const, blockerClass: 'conflicting-lineage' as const,
    evidenceDigests: sortedUnique([options.publicationArtifactDigest, ...distinct]),
    rationale: 'validated BR6A publication lineage contains contradictory values for this FEC-equivalent candidate pointer',
  };
  if (sourceValues.some((value) => digest(value) === options.difference.actualValueDigest)) return {
    ...base, provenanceClass: 'existing-value-with-validated-source' as const, blockerClass: 'none' as const,
    evidenceDigests: sortedUnique([options.publicationArtifactDigest, options.difference.actualValueDigest ?? ''].filter((value) => /^[a-f0-9]{64}$/.test(value))),
    rationale: 'the existing candidate value matches the validated BR6A publication lineage after one-to-one FEC equivalence',
  };
  return {
    ...base, provenanceClass: 'unsupported-production-only-value' as const, blockerClass: 'unsupported-production-only' as const,
    evidenceDigests: sortedUnique([options.publicationArtifactDigest]),
    rationale: 'the production-only candidate value has no matching value in the validated BR6A publication lineage',
  };
}

function setPointer(target: Json, pointer: string, value: unknown) {
  const keys = pointer.split('/').slice(1).map(pointerUntoken);
  let current: unknown = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (key.startsWith('@fec-sha256:')) {
      expect(Array.isArray(current), 'BR6B_INVALID_FEC_MERGE_POINTER');
      const matches = current.filter((item) => FEC_ID.test(candidateFecId(item)) && digest(candidateFecId(item)) === key.slice('@fec-sha256:'.length));
      expect(matches.length === 1, 'BR6B_FEC_MERGE_IDENTITY_NOT_UNIQUE'); current = matches[0]; continue;
    }
    if (Array.isArray(current)) {
      expect(/^\d+$/.test(key), 'BR6B_INVALID_MERGE_ARRAY_POINTER');
      const position = Number(key); if (current[position] === undefined) current[position] = /^\d+$/.test(keys[index + 1]) ? [] : {}; current = current[position];
    } else if (isRecord(current)) {
      if (!(key in current)) current[key] = /^\d+$/.test(keys[index + 1]) ? [] : {}; current = current[key];
    } else throw new Error('BR6B_INVALID_MERGE_POINTER');
  }
  const last = keys.at(-1); expect(last !== undefined && !last.startsWith('@'), 'BR6B_INVALID_MERGE_POINTER');
  if (Array.isArray(current)) current[Number(last)] = structuredClone(value);
  else if (isRecord(current)) current[last] = structuredClone(value);
  else throw new Error('BR6B_INVALID_MERGE_POINTER');
}

export function draftG8V2RevisedDisposition(conflict: G8V2ConflictDocument, rules: G8V2DispositionPointerRule[]) {
  if (rules.some((rule) => rule.blockerClass !== 'none')) return { disposition: 'unresolved' as const, output: conflict.actual, basis: 'no-op-unresolved' as const, rationale: 'one or more FEC identity, lineage, or unsupported-production blockers remain; the draft proposes no change' };
  const productionPreserve = rules.filter((rule) => rule.kind === 'production-only' && ['existing-value-with-validated-source','runtime-metadata'].includes(rule.provenanceClass));
  const certifiedChanges = rules.some((rule) => rule.kind !== 'production-only' && ['current-certified-authoritative','runtime-metadata'].includes(rule.provenanceClass));
  if (productionPreserve.length > 0 && certifiedChanges) {
    const output = structuredClone(conflict.expected);
    for (const rule of productionPreserve) {
      const value = getPointer(conflict.actual, rule.pointer); expect(value !== undefined, 'BR6B_MERGE_SOURCE_POINTER_MISSING'); setPointer(output, rule.pointer, value);
    }
    return { disposition: 'deterministic-merge' as const, output, basis: 'deterministic-merge' as const, rationale: 'certified identity, eligibility, and publication fields are combined only with BR6A lineage-proven existing values and runtime metadata' };
  }
  if (certifiedChanges) return { disposition: 'replace-with-certified' as const, output: conflict.expected, basis: 'certified-output' as const, rationale: 'every differing pointer is resolved by FEC equivalence plus the validated certified chain' };
  return { disposition: 'preserve-current' as const, output: conflict.actual, basis: 'preserved-current' as const, rationale: 'all differences are validated existing values or runtime metadata and no certified expected field is absent or changed' };
}

function pointerSignaturePointer(pointer: string) {
  return pointer.replace(/@(?:id|fec)-sha256:[a-f0-9]{64}/g, '@candidate-id');
}

export function aggregateG8V2RevisedDispositionEntries(entries: G8V2RevisedDispositionEntry[]) {
  const rules = entries.flatMap((entry) => entry.pointerRules);
  return {
    plannedPaths: entries.length,
    duplicatePaths: entries.length - new Set(entries.map((entry) => entry.path)).size,
    omittedPaths: 858 - new Set(entries.map((entry) => entry.path)).size,
    byFamily: completeCounts(['races','measures','candidateResearch','measureResearch','metrics'] as const, countBy(entries, (entry) => entry.family)),
    byDisposition: completeCounts(['preserve-current','replace-with-certified','deterministic-merge','unresolved'] as const, countBy(entries, (entry) => entry.disposition)),
    byProvenanceClass: completeCounts(['current-certified-authoritative','existing-value-with-validated-source','runtime-metadata','identity-conflict','unsupported-production-only-value','ambiguous/unresolved'] as const, countBy(rules, (rule) => rule.provenanceClass)),
    byDifferenceKind: completeCounts(['reorder','identity','value','expected-only','production-only'] as const, countBy(rules, (rule) => rule.kind)),
    byPointerSignature: countBy(entries, (entry) => entry.pointerSignature),
    byBlockerClass: completeCounts(['none','identity-conflict','unsupported-production-only','conflicting-lineage','ambiguous-lineage'] as const, countBy(rules, (rule) => rule.blockerClass)),
    pointerRules: rules.length,
  };
}

function nextEvidenceBatches(entries: G8V2RevisedDispositionEntry[], evidence: G8V2FecEquivalenceEvidence) {
  const unresolvedPathDigests = new Set(entries.filter((entry) => entry.disposition === 'unresolved').map((entry) => digest(entry.path)));
  return evidence.races.filter((race) => !race.fullyResolved && unresolvedPathDigests.has(race.racePathDigest)).map((race) => ({
    batchId: digest({ racePathDigest: race.racePathDigest, rejectClasses: race.rejectClasses, rejectedPairs: race.rejectedPairs }).slice(0, 16),
    racePathDigest: race.racePathDigest,
    rejectedFecPairs: race.rejectedPairs,
    exceptionClasses: race.rejectClasses,
    requiredEvidence: 'unique noncontradictory official FEC candidate mapping for this canonical race' as const,
  })).sort((left, right) => left.racePathDigest.localeCompare(right.racePathDigest));
}

export function buildG8V2RevisedDispositionPlan(options: {
  basePlan: G8V2DispositionPlan;
  snapshot: G8V2ConflictSnapshot;
  lineageValues: Parameters<typeof buildG8V2LineageCatalog>[0];
}) {
  expect(options.basePlan.contract === G8_V2_DISPOSITION_CONTRACT && options.basePlan.digests.plan === G8_V2_BR6A_CERTIFIED_PLAN_DIGEST, 'BR6B_BR6A_PLAN_IDENTITY_MISMATCH');
  expect(options.snapshot.conflicts.length === 858 && options.snapshot.digests.plan === options.basePlan.snapshot.planDigest, 'BR6B_CONFLICT_SNAPSHOT_MISMATCH');
  const lineage = buildG8V2LineageCatalog(options.lineageValues);
  expect(lineage.catalog.catalogDigest === options.basePlan.lineage.catalogDigest, 'BR6B_LINEAGE_CATALOG_MISMATCH');
  const finance = validateFecBulkFinanceSnapshot(options.lineageValues.finance);
  const raceConflicts = options.snapshot.conflicts.filter((conflict) => conflict.family === 'races');
  const lineageEvidenceDigests = sortedUnique(lineage.catalog.artifacts.flatMap((artifact) => artifact.semanticDigests));
  const { evidence, acceptedFecDigestsByPath } = buildFecEquivalenceEvidence({
    raceConflicts, bundle: lineage.currentBundle, publication: lineage.publication, finance,
    lineageCatalogDigest: lineage.catalog.catalogDigest, lineageEvidenceDigests,
  });
  const artifactDigests = new Map(lineage.catalog.artifacts.map((artifact) => [artifact.id, artifact.semanticDigests]));
  artifactDigests.set('snapshot', [options.basePlan.snapshot.inputDigest, options.basePlan.snapshot.evidenceDigest, options.basePlan.snapshot.planDigest, options.basePlan.snapshot.fileSha256]);
  const publicationArtifact = lineage.catalog.artifacts.find((artifact) => artifact.id === 'approved-publication');
  expect(publicationArtifact !== undefined, 'BR6B_PUBLICATION_ARTIFACT_MISSING');
  const sourceDocuments = [{ artifactId: 'approved-publication', artifactDigest: publicationArtifact.semanticDigests[0], documents: rawPublicationDocuments(lineage.publication) }];
  const canonicalRawCandidates = canonicalRawPublicationCandidates(lineage.publication);
  const entries: G8V2RevisedDispositionEntry[] = [...options.snapshot.conflicts].sort((left, right) => left.path.localeCompare(right.path)).map((conflict) => {
    const differences = conflict.family === 'races'
      ? diffG8V2FecEquivalentValues(conflict.actual, conflict.expected, acceptedFecDigestsByPath.get(conflict.path) ?? new Set<string>())
      : diffG8V2DispositionValues(conflict.actual, conflict.expected);
    expect(differences.length > 0, 'BR6B_EMPTY_CONFLICT_DIFF');
    const pointerRules = differences.map((difference) => {
      const rule = classifyRevisedDifference({ difference, family: conflict.family, path: conflict.path, sourceDocuments, artifactDigests, canonicalRawCandidates, publicationArtifactDigest: publicationArtifact.semanticDigests[0] });
      if (conflict.family === 'races' && difference.pointer.includes('@fec-sha256:')) {
        return { ...rule, evidenceDigests: sortedUnique([...rule.evidenceDigests, evidence.digests.evidence]), rationale: `${rule.kind === 'identity' ? 'FEC equivalence evidence rejected or could not uniquely pair this candidate. ' : 'A unique validated FEC equivalence established this candidate pointer. '}${rule.rationale}` };
      }
      return rule;
    });
    const drafted = draftG8V2RevisedDisposition(conflict, pointerRules);
    const evidenceDigests = sortedUnique([lineage.catalog.catalogDigest, options.basePlan.snapshot.evidenceDigest, evidence.digests.evidence, ...pointerRules.flatMap((rule) => rule.evidenceDigests)]);
    const pointerSignature = digest(pointerRules.map((rule) => ({ pointer: pointerSignaturePointer(rule.pointer), kind: rule.kind, provenanceClass: rule.provenanceClass, blockerClass: rule.blockerClass })));
    return {
      path: conflict.path, family: conflict.family, disposition: drafted.disposition,
      safeToReplace: drafted.disposition !== 'unresolved' && pointerRules.every((rule) => rule.blockerClass === 'none'),
      pointerSignature, pointerRules, evidenceDigests, proposedOutputDigest: digest(drafted.output), proposedOutputBasis: drafted.basis,
      rollbackDigest: conflict.actualDigest, rollbackEvidence: 'complete-actual-document-in-immutable-br5b-snapshot' as const, rationale: drafted.rationale,
    };
  });
  expect(entries.length === 858 && new Set(entries.map((entry) => entry.path)).size === 858, 'BR6B_DUPLICATE_OR_OMITTED_PATH');
  const aggregate = aggregateG8V2RevisedDispositionEntries(entries);
  expect(aggregate.plannedPaths === 858 && aggregate.duplicatePaths === 0 && aggregate.omittedPaths === 0, 'BR6B_AGGREGATE_PATH_COVERAGE_MISMATCH');
  const unresolved = entries.filter((entry) => entry.disposition === 'unresolved').length;
  const policyConflicts = entries.flatMap((entry) => entry.pointerRules).filter((rule) => rule.blockerClass !== 'none').length;
  const readinessBase = {
    readyForExecutor: false,
    deterministicallyResolved: 858 - unresolved,
    unresolved,
    reproducibleOutputs: entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.proposedOutputDigest)),
    rollbackEvidenceComplete: entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.rollbackDigest) && entry.rollbackEvidence === 'complete-actual-document-in-immutable-br5b-snapshot'),
    policyConflicts,
    nextEvidenceBatches: nextEvidenceBatches(entries, evidence),
  };
  const readiness = { ...readinessBase, readyForExecutor: unresolved === 0 && readinessBase.reproducibleOutputs && readinessBase.rollbackEvidenceComplete && policyConflicts === 0 };
  const base = {
    schemaVersion: 1 as const, contract: G8_V2_REVISED_DISPOSITION_CONTRACT, pointerContract: G8_V2_FEC_POINTER_CONTRACT,
    basePlan: { contract: G8_V2_DISPOSITION_CONTRACT, planDigest: G8_V2_BR6A_CERTIFIED_PLAN_DIGEST }, equivalence: evidence,
    entries, aggregate, readiness,
    safety: { firebaseImported: false as const, credentialsLoaded: false as const, networkRequests: 0 as const, productionOperations: 0 as const },
  };
  const entriesDigest = digest(entries); const aggregateDigest = digest({ aggregate, readiness, equivalence: evidence.digests });
  const plan: G8V2RevisedDispositionPlan = { ...base, digests: { entries: entriesDigest, aggregate: aggregateDigest, plan: digest({ ...base, digests: { entries: entriesDigest, aggregate: aggregateDigest } }) } };
  return plan;
}

export function loadG8V2RevisedDispositionPlan(paths: G8V2DispositionPaths, activationPlan: G8V2ActivationPlan) {
  const basePlan = loadG8V2DispositionPlan(paths, activationPlan);
  const snapshot = JSON.parse(readFileSync(paths.snapshot, 'utf8')) as G8V2ConflictSnapshot;
  const lineageValues = {
    paths: { currentBundle: paths.currentBundle, historicalBundle: paths.historicalBundle, manifest: paths.manifest, publication: paths.publication, finance: paths.finance, congress: paths.congress, historicalCvap: paths.historicalCvap, measures: paths.measures },
    currentBundle: JSON.parse(readFileSync(paths.currentBundle, 'utf8')) as unknown,
    historicalBundle: JSON.parse(readFileSync(paths.historicalBundle, 'utf8')) as unknown,
    manifest: JSON.parse(readFileSync(paths.manifest, 'utf8')) as unknown,
    publication: JSON.parse(readFileSync(paths.publication, 'utf8')) as unknown,
    finance: JSON.parse(readFileSync(paths.finance, 'utf8')) as unknown,
    congress: JSON.parse(readFileSync(paths.congress, 'utf8')) as unknown,
    historicalCvap: JSON.parse(readFileSync(paths.historicalCvap, 'utf8')) as unknown,
    measures: JSON.parse(readFileSync(paths.measures, 'utf8')) as unknown,
  };
  return buildG8V2RevisedDispositionPlan({ basePlan, snapshot, lineageValues });
}

export function buildG8V2RevisedDispositionAggregateReport(plan: G8V2RevisedDispositionPlan) {
  return {
    schemaVersion: 1,
    contract: G8_V2_REVISED_DISPOSITION_REPORT_CONTRACT,
    operation: 'g8-4br6b-offline-fec-candidate-equivalence',
    basePlan: plan.basePlan,
    equivalence: { contract: plan.equivalence.contract, aggregate: plan.equivalence.aggregate, digests: plan.equivalence.digests },
    aggregate: plan.aggregate,
    readiness: plan.readiness,
    safety: plan.safety,
    digests: plan.digests,
  };
}

export function verifyG8V2RevisedDispositionReplay(first: Pick<G8V2RevisedDispositionPlan, 'digests'>, second: Pick<G8V2RevisedDispositionPlan, 'digests'>) {
  expect(first.digests.entries === second.digests.entries && first.digests.aggregate === second.digests.aggregate && first.digests.plan === second.digests.plan, 'BR6B_NONDETERMINISTIC_REPLAY');
  return true;
}
