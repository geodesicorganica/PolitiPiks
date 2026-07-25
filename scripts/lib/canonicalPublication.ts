import { createHash } from 'node:crypto';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import {
  buildCanonicalShadowPlan,
  type FirestoreTimestampTag,
} from './canonicalMigration.js';
import { CANONICAL_2026_PRE_ELECTION_LOCK_POLICY, PRODUCT_LOCK_CLOSE_AT, PRODUCT_LOCK_POLICY_ID, generateProductLockRecords, validateGeneratedDeadlineRecords, validateProductLockPolicy, type JurisdictionDeadline, type ProductLockPolicy } from './deadlineRegistry.js';

type Json = Record<string, unknown>;
type PublicationCandidate = Json & { id: string; externalIds?: Json };
type PublicationRace = Json & { id: string; state: string; office: string; district: string | null; candidates: PublicationCandidate[] };
export type PublicationDocument = { path: string; data: Json };
export type CanonicalPublicationPlan = {
  schemaVersion: 3;
  generation: 'canonical-2026-shadow-v2';
  documents: PublicationDocument[];
  inputDigest: string;
  mappingDigest: string;
  planDigest: string;
  lockPolicyDigest: string;
  mapping: ReturnType<typeof buildCanonicalShadowPlan> & { publicationCandidateConflicts: Array<{ target: string; fields: string[] }>; activeCandidates: Set<string> };
  sourceCandidateCount: number;
  expectedCounts: { races: number; research: number; metrics: number };
};
export type CanonicalPublicationInput = {
  generation: 'canonical-2026-shadow-v2';
  races: PublicationRace[];
  lockPolicy?: ProductLockPolicy;
  deadlines: JurisdictionDeadline[];
  predictions: Array<{ id: string; targetId: string; pick: string }>;
  candidateResearch: Array<{ raceId: string; candidateId: string; data: Json }>;
  contestMetrics: Array<{ id?: string; raceId: string; data: Json }>;
  overrides: unknown;
};
export type CanonicalPublicationSnapshot = {
  schemaVersion: 3;
  capturedAt: string;
  projectId: string;
  databaseId: string;
  collectionCounts: { races: number; predictions: number; candidateResearch: number; contestMetrics: number; deadlines: number };
  inputDigest: string;
  inputs: CanonicalPublicationInput;
};

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]`
  : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
export const publicationInputDigest = (input: CanonicalPublicationInput) => digest(input);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const isTimestamp = (value: unknown): value is FirestoreTimestampTag => isRecord(value)
  && value.__firestoreType === 'timestamp/v1' && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)
  && (value.seconds as number) >= -62135596800 && (value.seconds as number) <= 253402300799
  && (value.nanoseconds as number) >= 0 && (value.nanoseconds as number) <= 999999999;
const sort = <T>(items: T[], key: (item: T) => string) => [...items].sort((left, right) => key(left).localeCompare(key(right)));

function assertDeadline(deadline: JurisdictionDeadline) {
  // Full coverage is asserted at the capture boundary. Retain this narrow guard for partial builder tests.
  if (!text(deadline.electionId) || !text(deadline.jurisdiction) || !/^\d{2}:\d{2}$/.test(deadline.localPollClosingTime) || !isTimestamp(deadline.closeAt) || !/^https:\/\//.test(deadline.sourceUrl)) throw new Error(`invalid source-backed deadline record: ${deadline.electionId || 'missing-election'}`);
}

function canonicalCandidateId(candidate: PublicationCandidate) {
  const fec = text(isRecord(candidate.externalIds) ? candidate.externalIds.fecCandidateId : undefined);
  return fec ? `fec-${fec}` : text(candidate.id);
}

/** Merges approved aliases without dropping sourced fields; differing non-empty scalar values are blockers. */
function mergeCandidates(candidates: PublicationCandidate[], targetId: string) {
  const result: Json = { id: targetId };
  const conflictingFields: string[] = [];
  const externalIds: Json = {};
  for (const candidate of candidates) {
    for (const [key, value] of Object.entries(candidate)) {
      if (key === 'id' || value === undefined || value === null || value === '') continue;
      if (key === 'externalIds' && isRecord(value)) {
        for (const [externalKey, externalValue] of Object.entries(value)) {
          if (externalIds[externalKey] !== undefined && canonicalJson(externalIds[externalKey]) !== canonicalJson(externalValue)) conflictingFields.push(`externalIds.${externalKey}`);
          else externalIds[externalKey] = externalValue;
        }
        continue;
      }
      if (result[key] !== undefined && canonicalJson(result[key]) !== canonicalJson(value)) conflictingFields.push(key);
      else result[key] = value;
    }
  }
  result.externalIds = externalIds;
  return { candidate: result, conflicts: [...new Set(conflictingFields)].sort() };
}

/** Builds the exact active-document payload from a complete publication source; it never uses v1 identity-only documents. */
export function buildCanonicalPublicationPlan(input: CanonicalPublicationInput): CanonicalPublicationPlan {
  if (input.generation !== 'canonical-2026-shadow-v2') throw new Error('publication generation must be canonical-2026-shadow-v2');
  const normalizedInput: CanonicalPublicationInput = {
    ...input,
    lockPolicy: validateProductLockPolicy(input.lockPolicy ?? CANONICAL_2026_PRE_ELECTION_LOCK_POLICY),
    races: sort(input.races.map((race) => ({ ...race, candidates: sort(race.candidates, (candidate) => text(candidate.id)) })), (race) => race.id),
    deadlines: sort(input.deadlines, (deadline) => `${deadline.electionId}/${deadline.jurisdiction}/${deadline.localPollClosingTime}`),
    predictions: sort(input.predictions, (prediction) => prediction.id),
    candidateResearch: sort(input.candidateResearch, (research) => `${research.raceId}/${research.candidateId}/${canonicalJson(research.data)}`),
    contestMetrics: sort(input.contestMetrics, (metric) => `${metric.raceId}/${metric.id ?? ''}/${canonicalJson(metric.data)}`),
  };
  const mapping = buildCanonicalShadowPlan({
    races: normalizedInput.races, predictions: normalizedInput.predictions, candidateResearch: normalizedInput.candidateResearch, contestMetrics: normalizedInput.contestMetrics, overrides: normalizedInput.overrides,
  });
  const raceMap = new Map(mapping.raceMappings.map((item) => [item.from, item.to]));
  const candidateMap = new Map(mapping.candidateMappings.map((item) => [`${item.raceId}/${item.from}`, item.to]));
  const deadlines = new Map<string, JurisdictionDeadline>();
  for (const deadline of normalizedInput.deadlines) {
    assertDeadline(deadline);
    if (deadlines.has(deadline.electionId)) throw new Error(`duplicate deadline record: ${deadline.electionId}`);
    deadlines.set(deadline.electionId, deadline);
  }
  const locks = new Map(generateProductLockRecords(normalizedInput.lockPolicy!).map((lock) => [lock.electionId, lock]));
  const sourceCandidates = new Map<string, PublicationCandidate[]>();
  for (const race of normalizedInput.races) {
    const targetRaceId = raceMap.get(race.id) ?? race.id;
    for (const candidate of race.candidates) {
      const targetCandidateId = candidateMap.get(`${race.id}/${candidate.id}`) ?? canonicalCandidateId(candidate);
      const key = `${targetRaceId}/${targetCandidateId}`;
      sourceCandidates.set(key, [...(sourceCandidates.get(key) ?? []), candidate]);
    }
  }
  const candidateConflicts: Array<{ target: string; fields: string[] }> = [];
  const raceDocuments: PublicationDocument[] = CANONICAL_2026_FEDERAL_CONTESTS.map((seat) => {
    const deadline = deadlines.get(seat.id);
    const lock = locks.get(seat.id);
    if (!lock) throw new Error(`missing product lock: ${seat.id}`);
    const candidates = sort([...sourceCandidates.entries()]
      .filter(([key]) => key.startsWith(`${seat.id}/`))
      .map(([key, sources]) => {
        const targetId = key.slice(seat.id.length + 1);
        const merged = mergeCandidates(sources, targetId);
        if (merged.conflicts.length) candidateConflicts.push({ target: key, fields: merged.conflicts });
        return merged.candidate;
      }), (candidate) => text(candidate.id));
    return {
      path: `races/${seat.id}`,
      data: {
        ...seat,
        closeAt: lock.closeAt,
        closeDate: seat.closeDate,
        deadlineKind: lock.deadlineKind,
        lockPolicyId: lock.lockPolicyId,
        lockPolicyVersion: lock.lockPolicyVersion,
        lockReason: lock.lockReason,
        electionDate: lock.electionDate,
        electionDateSourceUrl: lock.electionDateSourceUrl,
        deadlineProvenance: { policyId: lock.lockPolicyId, policyVersion: lock.lockPolicyVersion, reviewedAt: lock.reviewedAt },
        ...(deadline ? {
          officialPollCloseAt: deadline.closeAt,
          officialPollCloseKind: 'fixed',
          officialPollCloseProvenance: {
            electionId: deadline.electionId, jurisdiction: deadline.jurisdiction, localPollClosingTime: deadline.localPollClosingTime,
            electionDate: deadline.electionDate, timeZone: deadline.timeZone, sourceName: deadline.sourceName, sourceUrl: deadline.sourceUrl,
            retrievedAt: deadline.retrievedAt, reviewedAt: deadline.reviewedAt, reviewerStatus: deadline.reviewerStatus, notes: deadline.notes,
            ...(deadline.multiTimeZone ? { multiTimeZone: deadline.multiTimeZone } : {}),
          },
        } : { officialPollCloseKind: 'unknown' }),
        candidates,
        catalogScope: 'federal', registryGeneration: input.generation,
        canonicalPublication: { schemaVersion: 3, generation: input.generation },
      },
    };
  });
  const activeCandidates = new Set(raceDocuments.flatMap((document) => (document.data.candidates as Json[]).map((candidate) => `${document.path.slice('races/'.length)}/${text(candidate.id)}`)));
  const researchDocuments = sort(normalizedInput.candidateResearch.flatMap((research) => {
    const raceId = raceMap.get(research.raceId) ?? research.raceId;
    const candidateId = candidateMap.get(`${research.raceId}/${research.candidateId}`) ?? research.candidateId;
    return [{ path: `races/${raceId}/candidateResearch/${candidateId}`, data: { ...research.data, raceId, candidateId, canonicalPublication: { generation: input.generation } } }];
  }), (document) => document.path);
  const metricDocuments = sort(normalizedInput.contestMetrics.flatMap((metric) => {
    const raceId = raceMap.get(metric.raceId) ?? metric.raceId;
    return [{ path: `contestMetrics/${raceId}`, data: { ...metric.data, raceId, canonicalPublication: { generation: input.generation, sourceMetricId: metric.id ?? metric.raceId } } }];
  }), (document) => document.path);
  const documents = sort([...raceDocuments, ...researchDocuments, ...metricDocuments], (document) => document.path);
  const lockPolicyDigest = digest(normalizedInput.lockPolicy);
  const planDigest = digest({ generation: input.generation, lockPolicyDigest, documents, mappingDigest: mapping.mappingDigest, candidateConflicts });
  return {
    schemaVersion: 3, generation: input.generation, documents,
    inputDigest: digest({ races: normalizedInput.races, lockPolicy: normalizedInput.lockPolicy, deadlines: normalizedInput.deadlines, predictions: normalizedInput.predictions, candidateResearch: normalizedInput.candidateResearch, contestMetrics: normalizedInput.contestMetrics, overrides: normalizedInput.overrides }),
    mappingDigest: mapping.mappingDigest, planDigest, mapping: { ...mapping, publicationCandidateConflicts: candidateConflicts, activeCandidates }, sourceCandidateCount: normalizedInput.races.reduce((count, race) => count + race.candidates.length, 0),
    lockPolicyDigest, expectedCounts: { races: raceDocuments.length, research: researchDocuments.length, metrics: metricDocuments.length },
  };
}

/** Audits exactly the active paths built above; no synthetic substitute is accepted. */
export function auditCanonicalPublicationPlan(plan: CanonicalPublicationPlan) {
  const races = plan.documents.filter((document) => /^races\/[^/]+$/.test(document.path));
  const research = plan.documents.filter((document) => /^races\/[^/]+\/candidateResearch\/[^/]+$/.test(document.path));
  const metrics = plan.documents.filter((document) => /^contestMetrics\/[^/]+$/.test(document.path));
  const raceIds = new Set(races.map((document) => document.path.slice('races/'.length)));
  const candidateKeys = new Set<string>();
  let racesMissingCloseAt = 0; let invalidCloseAt = 0; let racesMissingLockPolicy = 0; let locksLaterThanPolicy = 0; let officialResearchRecords = 0; let racesMissingRequiredLiveFields = 0; let racesWithNoCandidates = 0;
  let totalCandidates = 0; let candidatesWithNoEligible = 0; let candidatesMissingName = 0; let candidatesMissingParty = 0; let candidatesMissingFecIdentity = 0;
  let candidatesMissingQualification = 0; let candidatesMissingProvenance = 0; let duplicateCanonicalCandidateIds = 0; let invalidCandidateIds = 0; let eligibleWithoutBallotEvidence = 0;
  for (const race of races) {
    const data = race.data;
    if (data.closeAt === undefined) racesMissingCloseAt += 1;
    else if (!isTimestamp(data.closeAt)) invalidCloseAt += 1;
    if (data.deadlineKind !== 'product_safety_lock' || data.lockPolicyId !== PRODUCT_LOCK_POLICY_ID || data.lockPolicyVersion !== 1 || !text(data.lockReason)) racesMissingLockPolicy += 1;
    if (isTimestamp(data.closeAt) && (data.closeAt.seconds > PRODUCT_LOCK_CLOSE_AT.seconds || data.closeAt.seconds !== PRODUCT_LOCK_CLOSE_AT.seconds || data.closeAt.nanoseconds !== PRODUCT_LOCK_CLOSE_AT.nanoseconds)) locksLaterThanPolicy += 1;
    if (isTimestamp(data.officialPollCloseAt)) officialResearchRecords += 1;
    if (data.electionYear !== 2026 || data.mode !== 'live' || !text(data.state) || !text(data.office) || !text(data.status) || !text(data.source) || !text(data.sourceUrl) || !text(data.verificationLevel)) racesMissingRequiredLiveFields += 1;
    const candidates = Array.isArray(data.candidates) ? data.candidates.filter(isRecord) : [];
    if (candidates.length === 0) racesWithNoCandidates += 1;
    let eligible = 0;
    for (const candidate of candidates) {
      totalCandidates += 1;
      const id = text(candidate.id); const candidateKey = `${race.path}/${id}`;
      if (candidateKeys.has(candidateKey)) duplicateCanonicalCandidateIds += 1; else candidateKeys.add(candidateKey);
      if (!/^fec-[HS]\d[A-Z]{2}\d{5}$/.test(id)) invalidCandidateIds += 1;
      if (!text(candidate.name)) candidatesMissingName += 1;
      if (!text(candidate.party)) candidatesMissingParty += 1;
      if (!text(isRecord(candidate.externalIds) ? candidate.externalIds.fecCandidateId : undefined)) candidatesMissingFecIdentity += 1;
      if (!text(candidate.qualificationStatus) || !text(candidate.candidateState) || !text(candidate.visibility) || !text(candidate.pickEligibility)) candidatesMissingQualification += 1;
      if (!text(candidate.source) || !text(candidate.sourceUrl) || !text(candidate.verificationLevel)) candidatesMissingProvenance += 1;
      if (candidate.pickEligibility === 'eligible') {
        eligible += 1;
        if (candidate.qualificationStatus !== 'on_ballot' || !text(candidate.ballotVerifiedAt) || !/^https:\/\//.test(text(candidate.ballotSourceUrl))) eligibleWithoutBallotEvidence += 1;
      }
    }
    if (candidates.length > 0 && eligible === 0) candidatesWithNoEligible += 1;
  }
  const researchMissingCandidate = research.filter((document) => {
    const match = /^races\/([^/]+)\/candidateResearch\/([^/]+)$/.exec(document.path);
    return !match || !candidateKeys.has(`races/${match[1]}/${match[2]}`);
  }).length;
  const metricsMissingRace = metrics.filter((document) => !raceIds.has(text(document.data.raceId))).length;
  const unresolvedPredictions = plan.mapping.orphanedPredictions.length + plan.mapping.retiredContestPredictions.length + plan.mapping.ambiguousReferences.length + plan.mapping.unresolvedCandidates.length + plan.mapping.unresolvedRaces.length;
  const publicationLockReady = plan.generation === 'canonical-2026-shadow-v2' && races.length === 470 && racesMissingCloseAt === 0 && invalidCloseAt === 0 && racesMissingLockPolicy === 0 && locksLaterThanPolicy === 0;
  const publicationReady = publicationLockReady
    && racesMissingRequiredLiveFields === 0 && racesWithNoCandidates === 0 && candidatesMissingName === 0 && candidatesMissingParty === 0
    && candidatesMissingFecIdentity === 0 && candidatesMissingQualification === 0 && candidatesMissingProvenance === 0 && duplicateCanonicalCandidateIds === 0
    && invalidCandidateIds === 0 && eligibleWithoutBallotEvidence === 0 && researchMissingCandidate === 0 && metricsMissingRace === 0
    && unresolvedPredictions === 0 && plan.mapping.publicationCandidateConflicts.length === 0;
  return { generation: plan.generation, totalFederalRaces: races.length, racesMissingCloseAt, invalidCloseAt, racesMissingLockPolicy, locksLaterThanPolicy, federalLockCoverage: races.length - racesMissingCloseAt - invalidCloseAt, lockPolicyId: PRODUCT_LOCK_POLICY_ID, lockPolicyDigest: plan.lockPolicyDigest, publicationLockReady, officialResearchRecords, unresolvedOfficialResearch: 470 - officialResearchRecords, officialResearchComplete: officialResearchRecords === 470, racesMissingRequiredLiveFields,
    totalSourceCandidates: plan.sourceCandidateCount, totalCanonicalCandidates: totalCandidates, mappedCandidates: plan.mapping.candidateMappings.length,
    mergedCandidates: plan.mapping.approvedCandidateMerges.length, retiredCandidates: 0, unresolvedCandidates: plan.mapping.unresolvedCandidates.length,
    racesWithNoCandidates, racesWithCandidatesButNoEligible: candidatesWithNoEligible, candidatesMissingName, candidatesMissingParty,
    candidatesMissingFecIdentity, candidatesMissingQualification, candidatesMissingProvenance, duplicateCanonicalCandidateIds, invalidCandidateIds,
    eligibleWithoutBallotEvidence, researchMissingCandidate, metricsMissingRace, unresolvedPredictions, publicationReady };
}

export function assertPublicationReady(plan: CanonicalPublicationPlan) {
  const audit = auditCanonicalPublicationPlan(plan);
  if (!audit.publicationReady) throw new Error(`canonical publication is not ready: ${canonicalJson(audit)}`);
  return audit;
}

/** Immutable, local certification for a publication-ready v2 plan. It is data-derived, never caller-supplied. */
export function certifyCanonicalPublicationPlan(plan: CanonicalPublicationPlan, sourceCommit: string) {
  if (!/^[a-f0-9]{7,64}$/i.test(sourceCommit)) throw new Error('publication source commit must be a git hash');
  const audit = assertPublicationReady(plan);
  return {
    schemaVersion: 3 as const, generation: plan.generation, sourceCommit, inputDigest: plan.inputDigest, mappingDigest: plan.mappingDigest,
    planDigest: plan.planDigest, lockPolicyDigest: plan.lockPolicyDigest, namespaceDigest: digest({ generation: plan.generation, documents: plan.documents }), expectedCounts: plan.expectedCounts, audit,
  };
}

const raceFields = ['id', 'state', 'jurisdiction', 'office', 'district', 'seatKind', 'senateClass', 'electionYear', 'mode', 'status', 'closeAt', 'closeDate', 'deadlineKind', 'lockPolicyId', 'lockPolicyVersion', 'lockReason', 'electionDate', 'electionDateSourceUrl', 'officialPollCloseAt', 'officialPollCloseKind', 'officialPollCloseProvenance', 'source', 'sourceUrl', 'verificationLevel', 'sourceUpdatedAt', 'lastRefreshedAt', 'refreshStatus', 'candidates'] as const;
const candidateFields = ['id', 'name', 'party', 'incumbent', 'challenger', 'externalIds', 'candidateState', 'visibility', 'qualificationStatus', 'pickEligibility', 'ballotVerifiedAt', 'ballotSourceUrl', 'source', 'sourceUrl', 'verificationLevel', 'sourceUpdatedAt', 'lastRefreshedAt', 'refreshStatus', 'websiteUrl', 'ballotpediaUrl', 'biography', 'keyVotes', 'campaignPromises'] as const;
function projectFields(value: Json, fields: readonly string[]) { return Object.fromEntries(fields.filter((field) => value[field] !== undefined).map((field) => [field, value[field]])); }

/** Explicit privacy boundary for future v2 captures: no user, league, or unrelated Firestore fields enter the snapshot. */
export function buildCanonicalPublicationSnapshot(input: Omit<CanonicalPublicationInput, 'generation'> & { projectId: string; databaseId: string; capturedAt?: string }): CanonicalPublicationSnapshot {
  if (input.projectId !== 'politipiks' || input.databaseId !== 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a') throw new Error('unexpected publication snapshot target');
  const races = sort(input.races.map((race) => {
    const projected = projectFields(race, raceFields) as PublicationRace;
    if (!text(projected.id) || !Array.isArray(projected.candidates)) throw new Error(`malformed publication race: ${text(projected.id) || 'missing-id'}`);
    projected.candidates = projected.candidates.map((candidate) => projectFields(candidate, candidateFields) as PublicationCandidate);
    return projected;
  }), (race) => race.id);
  const inputs: CanonicalPublicationInput = {
    generation: 'canonical-2026-shadow-v2', races, lockPolicy: validateProductLockPolicy(input.lockPolicy ?? CANONICAL_2026_PRE_ELECTION_LOCK_POLICY), deadlines: sort(input.deadlines, (deadline) => deadline.electionId),
    predictions: sort(input.predictions.map((prediction) => ({ id: text(prediction.id), targetId: text(prediction.targetId), pick: text(prediction.pick) })), (prediction) => prediction.id),
    candidateResearch: sort(input.candidateResearch, (research) => `${research.raceId}/${research.candidateId}`),
    contestMetrics: sort(input.contestMetrics, (metric) => `${metric.raceId}/${metric.id ?? ''}`), overrides: input.overrides,
  };
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(capturedAt))) throw new Error('malformed publication snapshot capturedAt');
  return { schemaVersion: 3, capturedAt, projectId: input.projectId, databaseId: input.databaseId,
    collectionCounts: { races: inputs.races.length, predictions: inputs.predictions.length, candidateResearch: inputs.candidateResearch.length, contestMetrics: inputs.contestMetrics.length, deadlines: inputs.deadlines.length },
    inputDigest: publicationInputDigest(inputs), inputs };
}

function assertOnlyKeys(value: Json, keys: readonly string[], label: string) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`unsupported publication snapshot field at ${label}: ${key}`);
}
function assertJson(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
  if (Array.isArray(value)) return value.forEach((item, index) => assertJson(item, `${path}[${index}]`));
  if (isRecord(value)) {
    if ('__firestoreType' in value && !isTimestamp(value)) throw new Error(`unsupported Firestore value at ${path}`);
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`unsupported Firestore value at ${path}`);
    return Object.entries(value).forEach(([key, item]) => assertJson(item, `${path}.${key}`));
  }
  throw new Error(`unsupported Firestore value at ${path}`);
}
function assertUnique(values: string[], label: string) { if (new Set(values).size !== values.length) throw new Error(`duplicate publication snapshot ${label}`); }

/** Strict, Firestore-free schema-v3 boundary for both live-capture receipts and offline replay. */
export function validateCanonicalPublicationSnapshot(value: unknown): CanonicalPublicationSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 3 || !isRecord(value.inputs)) throw new Error('unsupported canonical publication snapshot version');
  if (value.projectId !== 'politipiks' || value.databaseId !== 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a') throw new Error('unexpected publication snapshot target');
  if (!text(value.capturedAt) || Number.isNaN(Date.parse(text(value.capturedAt))) || !text(value.inputDigest) || !isRecord(value.collectionCounts)) throw new Error('malformed publication snapshot envelope');
  const inputsValue = value.inputs;
  assertOnlyKeys(inputsValue, ['generation', 'races', 'lockPolicy', 'deadlines', 'predictions', 'candidateResearch', 'contestMetrics', 'overrides'], 'inputs');
  if (inputsValue.generation !== 'canonical-2026-shadow-v2' || !Array.isArray(inputsValue.races) || !isRecord(inputsValue.lockPolicy) || !Array.isArray(inputsValue.deadlines) || !Array.isArray(inputsValue.predictions) || !Array.isArray(inputsValue.candidateResearch) || !Array.isArray(inputsValue.contestMetrics)) throw new Error('malformed publication snapshot inputs');
  for (const [index, raceValue] of inputsValue.races.entries()) {
    if (!isRecord(raceValue)) throw new Error(`malformed publication race ${index}`);
    assertOnlyKeys(raceValue, raceFields, `races[${index}]`);
    if (!text(raceValue.id) || !Array.isArray(raceValue.candidates)) throw new Error(`malformed publication race ${index}`);
    for (const [candidateIndex, candidate] of raceValue.candidates.entries()) {
      if (!isRecord(candidate)) throw new Error(`malformed publication candidate ${index}/${candidateIndex}`);
      assertOnlyKeys(candidate, candidateFields, `races[${index}].candidates[${candidateIndex}]`);
      if (!text(candidate.id)) throw new Error(`malformed publication candidate ${index}/${candidateIndex}`);
      assertJson(candidate, `races[${index}].candidates[${candidateIndex}]`);
    }
    assertUnique((raceValue.candidates as Json[]).map((candidate) => text(candidate.id)), `candidate identity in ${text(raceValue.id)}`);
    assertJson(raceValue, `races[${index}]`);
  }
  for (const [index, item] of inputsValue.predictions.entries()) {
    if (!isRecord(item)) throw new Error(`malformed publication prediction ${index}`);
    assertOnlyKeys(item, ['id', 'targetId', 'pick'], `predictions[${index}]`);
    if (!text(item.id) || !text(item.targetId) || !text(item.pick)) throw new Error(`malformed publication prediction ${index}`);
  }
  for (const [index, item] of inputsValue.candidateResearch.entries()) {
    if (!isRecord(item)) throw new Error(`malformed publication research ${index}`);
    assertOnlyKeys(item, ['raceId', 'candidateId', 'data'], `candidateResearch[${index}]`);
    if (!text(item.raceId) || !text(item.candidateId) || !isRecord(item.data)) throw new Error(`malformed publication research ${index}`);
    assertJson(item.data, `candidateResearch[${index}].data`);
  }
  for (const [index, item] of inputsValue.contestMetrics.entries()) {
    if (!isRecord(item)) throw new Error(`malformed publication metric ${index}`);
    assertOnlyKeys(item, ['id', 'raceId', 'data'], `contestMetrics[${index}]`);
    if (!text(item.raceId) || !isRecord(item.data)) throw new Error(`malformed publication metric ${index}`);
    assertJson(item.data, `contestMetrics[${index}].data`);
  }
  assertUnique(inputsValue.races.map((race) => text((race as Json).id)), 'race identity');
  assertUnique(inputsValue.predictions.map((prediction) => text((prediction as Json).id)), 'prediction identity');
  assertUnique(inputsValue.candidateResearch.map((item) => `${text((item as Json).raceId)}/${text((item as Json).candidateId)}`), 'research identity');
  assertUnique(inputsValue.contestMetrics.map((item) => text((item as Json).id) || text((item as Json).raceId)), 'metric identity');
  const lockPolicy = validateProductLockPolicy(inputsValue.lockPolicy);
  const deadlineRecords = validateGeneratedDeadlineRecords(inputsValue.deadlines, false);
  const snapshot = buildCanonicalPublicationSnapshot({ projectId: value.projectId, databaseId: value.databaseId, capturedAt: text(value.capturedAt),
    races: inputsValue.races as PublicationRace[], lockPolicy, deadlines: deadlineRecords, predictions: inputsValue.predictions as CanonicalPublicationInput['predictions'],
    candidateResearch: inputsValue.candidateResearch as CanonicalPublicationInput['candidateResearch'], contestMetrics: inputsValue.contestMetrics as CanonicalPublicationInput['contestMetrics'], overrides: inputsValue.overrides,
  });
  if (canonicalJson(snapshot.collectionCounts) !== canonicalJson(value.collectionCounts)) throw new Error('publication snapshot collection counts mismatch');
  if (snapshot.inputDigest !== value.inputDigest) throw new Error(`publication snapshot input digest mismatch: expected ${value.inputDigest}, computed ${snapshot.inputDigest}`);
  return snapshot;
}

/** Activation-level guard: every promoted document must satisfy the v2 race and reference contract before a selector may change. */
export function assertPublicationActivationDocuments(generation: string, documents: PublicationDocument[]) {
  if (generation !== 'canonical-2026-shadow-v2') throw new Error('incomplete canonical-2026-shadow-v1 generation cannot be activated');
  const races = documents.filter((document) => /^races\/[^/]+$/.test(document.path));
  const candidateKeys = new Set<string>();
  for (const race of races) {
    if (!isTimestamp(race.data.closeAt) || race.data.closeAt.seconds !== PRODUCT_LOCK_CLOSE_AT.seconds || race.data.closeAt.nanoseconds !== PRODUCT_LOCK_CLOSE_AT.nanoseconds || race.data.deadlineKind !== 'product_safety_lock' || race.data.lockPolicyId !== PRODUCT_LOCK_POLICY_ID || race.data.lockPolicyVersion !== 1 || !text(race.data.lockReason) || race.data.electionYear !== 2026 || race.data.mode !== 'live' || !Array.isArray(race.data.candidates) || race.data.candidates.length === 0) {
      throw new Error(`publication race contract failed: ${race.path}`);
    }
    for (const candidate of race.data.candidates.filter(isRecord)) {
      const id = text(candidate.id);
      if (!/^fec-[HS]\d[A-Z]{2}\d{5}$/.test(id) || candidateKeys.has(`${race.path}/${id}`)) throw new Error(`publication candidate identity failed: ${race.path}/${id}`);
      candidateKeys.add(`${race.path}/${id}`);
      if (candidate.pickEligibility === 'eligible' && (candidate.qualificationStatus !== 'on_ballot' || !text(candidate.ballotVerifiedAt) || !/^https:\/\//.test(text(candidate.ballotSourceUrl)))) {
        throw new Error(`eligible candidate lacks official-ballot evidence: ${race.path}/${id}`);
      }
    }
  }
  for (const document of documents.filter((item) => /^races\/[^/]+\/candidateResearch\/[^/]+$/.test(item.path))) {
    const match = /^races\/([^/]+)\/candidateResearch\/([^/]+)$/.exec(document.path)!;
    if (!candidateKeys.has(`races/${match[1]}/${match[2]}`)) throw new Error(`research points to a missing canonical candidate: ${document.path}`);
  }
  for (const document of documents.filter((item) => /^contestMetrics\/[^/]+$/.test(item.path))) {
    if (!races.some((race) => race.path === `races/${text(document.data.raceId)}`)) throw new Error(`metrics point to a missing canonical race: ${document.path}`);
  }
}
