import { createHash } from 'node:crypto';
import {
  CANONICAL_2026_FEDERAL_CONTESTS,
  CANONICAL_2026_NON_VOTING_CONTESTS,
  canonicalFederalContestId,
  isValidFecHouseDistrict,
} from '../../ingest/src/federalRegistry.js';

type RecordValue = Record<string, unknown>;
export type FirestoreTimestampTag = { __firestoreType: 'timestamp/v1'; seconds: number; nanoseconds: number };
const FIRESTORE_MIN_SECONDS = -62135596800;
const FIRESTORE_MAX_SECONDS = 253402300799;
type Candidate = { id?: unknown; externalIds?: { fecCandidateId?: unknown } };
type Race = { id: string; state?: unknown; office?: unknown; district?: unknown; candidates?: Candidate[] };
type Prediction = { id: string; targetId?: unknown; pick?: unknown };
type CandidateResearch = { id?: unknown; raceId?: unknown; candidateId?: unknown; data?: RecordValue };
type ContestMetric = { id?: unknown; raceId?: unknown; data?: RecordValue };
type CanonicalMigrationInput = { races: Race[]; predictions: Prediction[]; candidateResearch: CandidateResearch[]; contestMetrics: ContestMetric[]; overrides?: unknown };

export const CANONICAL_MIGRATION_PROJECT_ID = 'politipiks';
export const CANONICAL_MIGRATION_DATABASE_ID = 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a';

export type CanonicalMigrationSnapshot = {
  schemaVersion: 2;
  capturedAt: string;
  projectId: string;
  databaseId: string;
  collectionCounts: { races: number; predictions: number; candidateResearch: number; contestMetrics: number };
  inputDigest: string;
  inputs: Required<CanonicalMigrationInput>;
};

export type CandidateIdentityOverride = {
  legacyRaceId: string;
  legacyCandidateId: string;
  fecCandidateId: string;
  sourceUrl: string;
  approvedManyToOneMerge?: string;
};

export type ContestDisposition = {
  legacyRaceId: string;
  disposition: 'retire_invalid' | 'retire_nonvoting';
  auditAlias?: string;
  sourceUrl: string;
};

export type CanonicalIdentityOverrides = {
  schemaVersion: 1;
  candidateOverrides: CandidateIdentityOverride[];
  contestDispositions: ContestDisposition[];
};

const canonicalIds = new Set(CANONICAL_2026_FEDERAL_CONTESTS.map((contest) => contest.id));
const nonVotingIds = new Set(CANONICAL_2026_NON_VOTING_CONTESTS.map((contest) => contest.id));
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): RecordValue | null => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = record(value);
  if (object) return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const sorted = <T>(items: T[], key: (item: T) => string) => [...items].sort((a, b) => key(a).localeCompare(key(b)));
const emptyOverrides = (): CanonicalIdentityOverrides => ({ schemaVersion: 1, candidateOverrides: [], contestDispositions: [] });
const requireText = (value: unknown, path: string) => {
  const result = text(value);
  if (!result) throw new Error(`malformed snapshot record: ${path} must be a non-empty string`);
  return result;
};
const isValidTimestampParts = (seconds: unknown, nanoseconds: unknown) => Number.isInteger(seconds) && Number.isInteger(nanoseconds)
  && (seconds as number) >= FIRESTORE_MIN_SECONDS && (seconds as number) <= FIRESTORE_MAX_SECONDS
  && (nanoseconds as number) >= 0 && (nanoseconds as number) <= 999999999;
const isTimestampTag = (value: RecordValue) => value.__firestoreType === 'timestamp/v1'
  && Object.keys(value).length === 3 && Object.keys(value).every((key) => ['__firestoreType', 'seconds', 'nanoseconds'].includes(key))
  && isValidTimestampParts(value.seconds, value.nanoseconds);
/** Live-capture boundary only: recursively replaces native Firestore Timestamps with exact JSON tags. */
export function encodeFirestoreSnapshotValue(value: unknown, path = 'value'): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => encodeFirestoreSnapshotValue(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    const candidate = value as { seconds?: unknown; nanoseconds?: unknown; constructor?: { name?: string } };
    if (candidate.constructor?.name === 'Timestamp' && isValidTimestampParts(candidate.seconds, candidate.nanoseconds)) {
      return { __firestoreType: 'timestamp/v1', seconds: candidate.seconds as number, nanoseconds: candidate.nanoseconds as number } satisfies FirestoreTimestampTag;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`unsupported Firestore value at ${path}`);
    return Object.fromEntries(Object.entries(value as RecordValue).map(([key, item]) => [key, encodeFirestoreSnapshotValue(item, `${path}.${key}`)]));
  }
  throw new Error(`unsupported Firestore value at ${path}`);
}
const assertJsonValue = (value: unknown, path: string): void => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (Number.isFinite(value)) return; throw new Error(`unsupported Firestore value at ${path}`); }
  if (Array.isArray(value)) { value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`)); return; }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const object = value as RecordValue;
    if ('__firestoreType' in object) { if (!isTimestampTag(object)) throw new Error(`malformed Firestore timestamp tag at ${path}`); return; }
    if ('seconds' in object && 'nanoseconds' in object) throw new Error(`malformed Firestore timestamp lookalike at ${path}`);
    Object.entries(value).forEach(([key, item]) => assertJsonValue(item, `${path}.${key}`));
    return;
  }
  throw new Error(`unsupported Firestore value at ${path}`);
};
const assertOnlyKeys = (value: RecordValue, allowed: string[], path: string) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`malformed snapshot record: ${path}.${key} is not permitted`);
};

/** Validates the checked-in, source-backed exception list before planning. */
export function parseCanonicalIdentityOverrides(input: unknown): CanonicalIdentityOverrides {
  if (input === undefined) return emptyOverrides();
  const root = record(input);
  if (!root || root.schemaVersion !== 1 || !Array.isArray(root.candidateOverrides) || !Array.isArray(root.contestDispositions)) {
    throw new Error('identity overrides must be a schemaVersion 1 object with candidateOverrides and contestDispositions arrays');
  }
  const candidateOverrides: CandidateIdentityOverride[] = [];
  const candidateKeys = new Set<string>();
  const mergeGroups = new Map<string, number>();
  for (const item of root.candidateOverrides) {
    const value = record(item);
    const legacyRaceId = text(value?.legacyRaceId);
    const legacyCandidateId = text(value?.legacyCandidateId);
    const fecCandidateId = text(value?.fecCandidateId);
    const sourceUrl = text(value?.sourceUrl);
    const approvedManyToOneMerge = text(value?.approvedManyToOneMerge) || undefined;
    const expectedSource = `https://www.fec.gov/data/candidate/${fecCandidateId}/`;
    if (!legacyRaceId || !legacyCandidateId || !/^[HS]\d[A-Z]{2}\d{5}$/.test(fecCandidateId) || sourceUrl !== expectedSource) {
      throw new Error(`invalid or unsourced candidate override: ${legacyRaceId || 'missing-race'}/${legacyCandidateId || 'missing-candidate'}`);
    }
    const key = `${legacyRaceId}/${legacyCandidateId}`;
    if (candidateKeys.has(key)) throw new Error(`duplicate or contradictory candidate override: ${key}`);
    candidateKeys.add(key);
    if (approvedManyToOneMerge) mergeGroups.set(approvedManyToOneMerge, (mergeGroups.get(approvedManyToOneMerge) ?? 0) + 1);
    candidateOverrides.push({ legacyRaceId, legacyCandidateId, fecCandidateId, sourceUrl, ...(approvedManyToOneMerge ? { approvedManyToOneMerge } : {}) });
  }
  for (const [mergeGroup, count] of mergeGroups) {
    if (count < 2) throw new Error(`approved many-to-one merge must name at least two aliases: ${mergeGroup}`);
  }
  const contestDispositions: ContestDisposition[] = [];
  const dispositionIds = new Set<string>();
  for (const item of root.contestDispositions) {
    const value = record(item);
    const legacyRaceId = text(value?.legacyRaceId);
    const disposition = text(value?.disposition);
    const auditAlias = text(value?.auditAlias) || undefined;
    const sourceUrl = text(value?.sourceUrl);
    if (!legacyRaceId || !['retire_invalid', 'retire_nonvoting'].includes(disposition) || sourceUrl !== 'https://www.house.gov/representatives') {
      throw new Error(`invalid or unsourced contest disposition: ${legacyRaceId || 'missing-race'}`);
    }
    if (dispositionIds.has(legacyRaceId)) throw new Error(`duplicate or contradictory contest disposition: ${legacyRaceId}`);
    if (disposition === 'retire_invalid' && auditAlias) throw new Error(`retire_invalid cannot have an audit alias: ${legacyRaceId}`);
    if (disposition === 'retire_nonvoting' && (!auditAlias || !nonVotingIds.has(auditAlias))) {
      throw new Error(`retire_nonvoting must reference an excluded registry alias: ${legacyRaceId}`);
    }
    dispositionIds.add(legacyRaceId);
    contestDispositions.push({ legacyRaceId, disposition: disposition as ContestDisposition['disposition'], ...(auditAlias ? { auditAlias } : {}), sourceUrl });
  }
  return {
    schemaVersion: 1,
    candidateOverrides: sorted(candidateOverrides, (item) => `${item.legacyRaceId}/${item.legacyCandidateId}`),
    contestDispositions: sorted(contestDispositions, (item) => item.legacyRaceId),
  };
}

function projectCandidate(value: unknown, path: string, strict = false): Candidate {
  const candidate = record(value);
  if (!candidate) throw new Error(`malformed snapshot record: ${path}`);
  if (strict) assertOnlyKeys(candidate, ['id', 'externalIds'], path);
  const externalIds = record(candidate.externalIds);
  if (strict && externalIds) assertOnlyKeys(externalIds, ['fecCandidateId'], `${path}.externalIds`);
  if (externalIds && externalIds.fecCandidateId !== undefined) requireText(externalIds.fecCandidateId, `${path}.externalIds.fecCandidateId`);
  return { id: requireText(candidate.id, `${path}.id`), ...(externalIds?.fecCandidateId ? { externalIds: { fecCandidateId: text(externalIds.fecCandidateId) } } : {}) };
}

function projectedInputs(input: CanonicalMigrationInput, strict = false): Required<CanonicalMigrationInput> {
  const races = input.races.map((value, index) => {
    const race = record(value);
    if (!race || !Array.isArray(race.candidates)) throw new Error(`malformed snapshot record: races[${index}]`);
    if (strict) assertOnlyKeys(race, ['id', 'state', 'office', 'district', 'candidates'], `races[${index}]`);
    const district = race.district === null || race.district === undefined ? null : requireText(race.district, `races[${index}].district`);
    return { id: requireText(race.id, `races[${index}].id`), state: requireText(race.state, `races[${index}].state`), office: requireText(race.office, `races[${index}].office`), district,
      candidates: race.candidates.map((candidate, candidateIndex) => projectCandidate(candidate, `races[${index}].candidates[${candidateIndex}]`, strict)) };
  });
  const predictions = input.predictions.map((value, index) => {
    const prediction = record(value);
    if (!prediction) throw new Error(`malformed snapshot record: predictions[${index}]`);
    if (strict) assertOnlyKeys(prediction, ['id', 'targetId', 'pick'], `predictions[${index}]`);
    return { id: requireText(prediction.id, `predictions[${index}].id`), targetId: requireText(prediction.targetId, `predictions[${index}].targetId`), pick: requireText(prediction.pick, `predictions[${index}].pick`) };
  });
  const candidateResearch = input.candidateResearch.map((value, index) => {
    const research = record(value);
    if (!research || !record(research.data)) throw new Error(`malformed snapshot record: candidateResearch[${index}]`);
    if (strict) assertOnlyKeys(research, ['id', 'raceId', 'candidateId', 'data'], `candidateResearch[${index}]`);
    assertJsonValue(research.data, `candidateResearch[${index}].data`);
    const raceId = requireText(research.raceId, `candidateResearch[${index}].raceId`);
    const candidateId = requireText(research.candidateId, `candidateResearch[${index}].candidateId`);
    const id = text(research.id) || `${raceId}/${candidateId}/${digest(research.data)}`;
    return { id, raceId, candidateId, data: research.data as RecordValue };
  });
  const contestMetrics = input.contestMetrics.map((value, index) => {
    const metric = record(value);
    if (!metric || !record(metric.data)) throw new Error(`malformed snapshot record: contestMetrics[${index}]`);
    if (strict) assertOnlyKeys(metric, ['id', 'raceId', 'data'], `contestMetrics[${index}]`);
    assertJsonValue(metric.data, `contestMetrics[${index}].data`);
    const raceId = requireText(metric.raceId, `contestMetrics[${index}].raceId`);
    return { id: text(metric.id) || raceId, raceId, data: metric.data as RecordValue };
  });
  return {
    races: sorted(races, (item) => item.id),
    predictions: sorted(predictions, (item) => item.id),
    candidateResearch: sorted(candidateResearch, (item) => `${text(item.raceId)}/${text(item.candidateId)}/${text(item.id)}`),
    contestMetrics: sorted(contestMetrics, (item) => `${text(item.raceId)}/${text(item.id)}`),
    overrides: parseCanonicalIdentityOverrides(input.overrides),
  };
}

function assertUnique(values: unknown[], label: string, key: (value: any) => string) {
  const seen = new Set<string>();
  for (const value of values) { const identity = key(value); if (seen.has(identity)) throw new Error(`duplicate snapshot ${label}: ${identity}`); seen.add(identity); }
}

function validatedSnapshot(snapshot: CanonicalMigrationSnapshot): CanonicalMigrationSnapshot {
  if (!snapshot || snapshot.schemaVersion !== 2) throw new Error('unsupported canonical migration snapshot version');
  if (snapshot.projectId !== CANONICAL_MIGRATION_PROJECT_ID) throw new Error(`unexpected project: ${snapshot.projectId}`);
  if (snapshot.databaseId !== CANONICAL_MIGRATION_DATABASE_ID) throw new Error(`unexpected database: ${snapshot.databaseId}`);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(snapshot.capturedAt) || Number.isNaN(Date.parse(snapshot.capturedAt))) throw new Error('malformed snapshot capturedAt');
  const inputs = projectedInputs(snapshot.inputs, true);
  assertUnique(inputs.races, 'race identity', (item) => item.id);
  assertUnique(inputs.predictions, 'prediction identity', (item) => item.id);
  assertUnique(inputs.candidateResearch, 'research identity', (item) => `${item.raceId}/${item.candidateId}/${item.id}`);
  assertUnique(inputs.contestMetrics, 'metric identity', (item) => item.id);
  const counts = { races: inputs.races.length, predictions: inputs.predictions.length, candidateResearch: inputs.candidateResearch.length, contestMetrics: inputs.contestMetrics.length };
  if (canonicalJson(counts) !== canonicalJson(snapshot.collectionCounts)) throw new Error('snapshot collection counts mismatch');
  const inputDigest = digest(inputs);
  if (inputDigest !== snapshot.inputDigest) throw new Error(`snapshot input digest mismatch: expected ${snapshot.inputDigest}, computed ${inputDigest}`);
  return { ...snapshot, inputs, collectionCounts: counts, inputDigest };
}

/** Creates a JSON-safe, immutable input snapshot. It never contacts Firestore. */
export function buildCanonicalMigrationSnapshot(input: CanonicalMigrationInput & { projectId: string; databaseId: string }): CanonicalMigrationSnapshot {
  if (input.projectId !== CANONICAL_MIGRATION_PROJECT_ID) throw new Error(`unexpected project: ${input.projectId}`);
  if (input.databaseId !== CANONICAL_MIGRATION_DATABASE_ID) throw new Error(`unexpected database: ${input.databaseId}`);
  const inputs = JSON.parse(JSON.stringify(projectedInputs(input))) as Required<CanonicalMigrationInput>;
  return validatedSnapshot({ schemaVersion: 2, capturedAt: new Date().toISOString(), projectId: input.projectId, databaseId: input.databaseId,
    collectionCounts: { races: inputs.races.length, predictions: inputs.predictions.length, candidateResearch: inputs.candidateResearch.length, contestMetrics: inputs.contestMetrics.length }, inputDigest: digest(inputs), inputs });
}

export function mergeCandidateResearchDocuments(input: Array<{ raceId: string; candidateId: string; data?: RecordValue }>) {
  const byTarget = new Map<string, Array<{ raceId: string; candidateId: string; data?: RecordValue }>>();
  for (const item of input) byTarget.set(`${item.raceId}/${item.candidateId}`, [...(byTarget.get(`${item.raceId}/${item.candidateId}`) ?? []), item]);
  const conflicts: Array<{ target: string; field: string; values: unknown[] }> = [];
  let deduplicatedSections = 0;
  const documents = Array.from(byTarget.entries()).map(([target, items]) => {
    const [raceId, candidateId] = target.split('/');
    const bucketSections = new Map<string, Map<string, unknown>>();
    const sources = new Map<string, unknown>();
    const scalarValues = new Map<string, Map<string, unknown>>();
    const provenanceTimestamps = new Map<string, Map<string, unknown>>();
    for (const item of items) {
      const data = item.data ?? {};
      const buckets = record(data.buckets);
      for (const [bucket, sections] of Object.entries(buckets ?? {})) {
        if (!Array.isArray(sections)) continue;
        const seen = bucketSections.get(bucket) ?? new Map<string, unknown>();
        for (const section of sections) {
          const fingerprint = canonicalJson(section);
          if (seen.has(fingerprint)) deduplicatedSections += 1;
          else seen.set(fingerprint, section);
        }
        bucketSections.set(bucket, seen);
      }
      if (Array.isArray(data.sources)) for (const source of data.sources) sources.set(canonicalJson(source), source);
      for (const [field, value] of Object.entries(data)) {
        if (['raceId', 'candidateId', 'buckets', 'sources', 'externalIds'].includes(field) || value === undefined) continue;
        if (field === 'updatedAt' || field.endsWith('At')) {
          const timestamps = provenanceTimestamps.get(field) ?? new Map<string, unknown>();
          timestamps.set(canonicalJson(value), value);
          provenanceTimestamps.set(field, timestamps);
          continue;
        }
        const values = scalarValues.get(field) ?? new Map<string, unknown>();
        values.set(canonicalJson(value), value);
        scalarValues.set(field, values);
      }
    }
    const data: RecordValue = {
      raceId,
      candidateId,
      externalIds: { fecCandidateId: candidateId.replace(/^fec-/, '') },
      buckets: Object.fromEntries(sorted(Array.from(bucketSections.entries()), ([bucket]) => bucket).map(([bucket, sections]) => [bucket, sorted(Array.from(sections.values()), canonicalJson)])),
      sources: sorted(Array.from(sources.values()), canonicalJson),
    };
    if (provenanceTimestamps.size > 0) {
      data.provenance = { timestamps: Object.fromEntries(sorted(Array.from(provenanceTimestamps.entries()), ([field]) => field)
        .map(([field, values]) => [field, sorted(Array.from(values.values()), canonicalJson)])) };
    }
    for (const [field, values] of scalarValues) {
      if (values.size === 1) data[field] = values.values().next().value;
      else conflicts.push({ target, field, values: sorted(Array.from(values.values()), canonicalJson) });
    }
    return { raceId, candidateId, data };
  });
  return { documents: sorted(documents, (item) => `${item.raceId}/${item.candidateId}`), conflicts: sorted(conflicts, (item) => `${item.target}/${item.field}`), deduplicatedSections };
}

export function buildCanonicalShadowPlan(input: CanonicalMigrationInput) {
  const overrides = parseCanonicalIdentityOverrides(input.overrides);
  const candidateOverrideByLegacy = new Map(overrides.candidateOverrides.map((item) => [`${item.legacyRaceId}/${item.legacyCandidateId}`, item]));
  const dispositionByLegacy = new Map(overrides.contestDispositions.map((item) => [item.legacyRaceId, item]));
  const appliedCandidateOverrides = new Set<string>();
  const appliedDispositions = new Set<string>();
  const raceMappings: Array<{ from: string; to: string }> = [];
  const candidateMappings: Array<{ raceId: string; from: string; to: string; fecCandidateId: string; sourceUrl?: string; approvedManyToOneMerge?: string }> = [];
  const unresolvedRaces: Array<{ id: string; reason: string }> = [];
  const unresolvedCandidates: Array<{ raceId: string; candidateId: string; reason: string }> = [];
  const retiredContests: Array<ContestDisposition> = [];

  for (const race of input.races) {
    const state = text(race.state);
    const office = text(race.office);
    const district = text(race.district) || null;
    const disposition = dispositionByLegacy.get(race.id);
    let canonicalId: string | null = null;
    if (office === 'House') {
      if (!isValidFecHouseDistrict(state, district)) {
        if (disposition) { retiredContests.push(disposition); appliedDispositions.add(race.id); continue; }
        unresolvedRaces.push({ id: race.id, reason: 'not a canonical voting House seat' });
        continue;
      }
      canonicalId = canonicalFederalContestId('H', state, district);
    } else if (office === 'Senate') {
      canonicalId = canonicalFederalContestId('S', state);
      if (!canonicalId) { unresolvedRaces.push({ id: race.id, reason: 'not a 2026 Class II or declared special Senate seat' }); continue; }
    } else continue;
    if (canonicalId && canonicalId !== race.id) raceMappings.push({ from: race.id, to: canonicalId });
    if (canonicalId && !canonicalIds.has(canonicalId)) unresolvedRaces.push({ id: race.id, reason: 'canonical target is missing from registry' });
    for (const candidate of race.candidates ?? []) {
      const candidateId = text(candidate.id);
      const override = candidateOverrideByLegacy.get(`${race.id}/${candidateId}`);
      const fecCandidateId = override?.fecCandidateId ?? text(candidate.externalIds?.fecCandidateId);
      if (override) appliedCandidateOverrides.add(`${race.id}/${candidateId}`);
      if (!candidateId || !fecCandidateId) { unresolvedCandidates.push({ raceId: race.id, candidateId, reason: 'candidate lacks a durable FEC identity' }); continue; }
      const canonicalCandidateId = `fec-${fecCandidateId}`;
      if (candidateId !== canonicalCandidateId) candidateMappings.push({ raceId: race.id, from: candidateId, to: canonicalCandidateId, fecCandidateId, ...(override ? { sourceUrl: override.sourceUrl, ...(override.approvedManyToOneMerge ? { approvedManyToOneMerge: override.approvedManyToOneMerge } : {}) } : {}) });
    }
  }
  for (const override of overrides.candidateOverrides) {
    const key = `${override.legacyRaceId}/${override.legacyCandidateId}`;
    if (!appliedCandidateOverrides.has(key)) unresolvedCandidates.push({ raceId: override.legacyRaceId, candidateId: override.legacyCandidateId, reason: 'override source candidate is absent from snapshot' });
  }
  for (const disposition of overrides.contestDispositions) {
    if (!appliedDispositions.has(disposition.legacyRaceId)) unresolvedRaces.push({ id: disposition.legacyRaceId, reason: 'disposition race is absent or no longer invalid in snapshot' });
  }

  const orderedRaceMappings = sorted(raceMappings, (item) => item.from);
  const orderedCandidateMappings = sorted(candidateMappings, (item) => `${item.raceId}/${item.from}`);
  const raceMap = new Map(orderedRaceMappings.map((mapping) => [mapping.from, mapping.to]));
  const candidateMap = new Map(orderedCandidateMappings.map((mapping) => [`${mapping.raceId}/${mapping.from}`, mapping.to]));
  const candidateSourcesByTarget = new Map<string, typeof orderedCandidateMappings>();
  for (const mapping of orderedCandidateMappings) {
    const target = `${raceMap.get(mapping.raceId) ?? mapping.raceId}/${mapping.to}`;
    candidateSourcesByTarget.set(target, [...(candidateSourcesByTarget.get(target) ?? []), mapping]);
  }
  const ambiguousReferences: Array<{ kind: 'candidate'; target: string; sources: string[] }> = [];
  const approvedCandidateMerges: Array<{ target: string; mergeGroup: string; sources: string[] }> = [];
  for (const [target, mappings] of candidateSourcesByTarget) {
    if (mappings.length < 2) continue;
    const groups = new Set(mappings.map((item) => item.approvedManyToOneMerge).filter(Boolean));
    const sources = sorted(mappings.map((item) => `${item.raceId}/${item.from}`), (item) => item);
    if (groups.size === 1 && mappings.every((item) => item.approvedManyToOneMerge)) approvedCandidateMerges.push({ target, mergeGroup: groups.values().next().value!, sources });
    else ambiguousReferences.push({ kind: 'candidate', target, sources });
  }

  const retiredMap = new Map(retiredContests.map((item) => [item.legacyRaceId, item]));
  const predictionMigrations: Array<{ id: string; targetId: string; pick: string }> = [];
  const orphanedPredictions: Array<{ id: string; targetId: string; pick: string; reason: string }> = [];
  const retiredContestPredictions: Array<{ id: string; targetId: string; pick: string; disposition: ContestDisposition['disposition'] }> = [];
  for (const prediction of input.predictions) {
    const targetId = text(prediction.targetId);
    const pick = text(prediction.pick);
    const retired = retiredMap.get(targetId);
    if (retired) { retiredContestPredictions.push({ id: prediction.id, targetId, pick, disposition: retired.disposition }); continue; }
    const nextTargetId = raceMap.get(targetId) ?? targetId;
    const nextPick = candidateMap.get(`${targetId}/${pick}`);
    if (!raceMap.has(targetId) && !nextPick) continue;
    if (!nextPick) { orphanedPredictions.push({ id: prediction.id, targetId, pick, reason: 'candidate mapping is unavailable' }); continue; }
    predictionMigrations.push({ id: prediction.id, targetId: nextTargetId, pick: nextPick });
  }

  const researchInputs = input.candidateResearch.flatMap((item) => {
    const oldRaceId = text(item.raceId);
    const oldCandidateId = text(item.candidateId);
    const candidateId = candidateMap.get(`${oldRaceId}/${oldCandidateId}`);
    return candidateId ? [{ raceId: raceMap.get(oldRaceId) ?? oldRaceId, candidateId, data: item.data }] : [];
  });
  const researchMerge = mergeCandidateResearchDocuments(researchInputs);
  const contestMetricCopies = input.contestMetrics.flatMap((item) => {
    const raceId = text(item.raceId);
    const targetRaceId = raceMap.get(raceId);
    return targetRaceId ? [{ id: text((item as { id?: unknown }).id) || raceId, raceId, targetRaceId, data: item.data ?? {} }] : [];
  });
  const mappingInput = { overrides, raceMappings: orderedRaceMappings, candidateMappings: orderedCandidateMappings, predictionMigrations: sorted(predictionMigrations, (item) => item.id), retiredContests: sorted(retiredContests, (item) => item.legacyRaceId) };
  const mappingDigest = digest(mappingInput);
  const shadowContests = CANONICAL_2026_FEDERAL_CONTESTS.map((contest) => {
    const legacySources = orderedRaceMappings.filter((mapping) => mapping.to === contest.id).map((mapping) => mapping.from);
    return { id: contest.id, action: legacySources.length > 0 ? 'create_from_legacy' : 'create_registry_seat', legacySources };
  });
  const safeToActivate = unresolvedRaces.length === 0 && unresolvedCandidates.length === 0 && orphanedPredictions.length === 0
    && ambiguousReferences.length === 0 && retiredContestPredictions.length === 0 && researchMerge.conflicts.length === 0;
  return {
    migration: 'canonical-2026-shadow-v1', mappingDigest, overrides, raceMappings: orderedRaceMappings, candidateMappings: orderedCandidateMappings,
    predictionMigrations: sorted(predictionMigrations, (item) => item.id), shadowContests, retiredContests: sorted(retiredContests, (item) => item.legacyRaceId),
    unresolvedRaces: sorted(unresolvedRaces, (item) => item.id), unresolvedCandidates: sorted(unresolvedCandidates, (item) => `${item.raceId}/${item.candidateId}`),
    orphanedPredictions: sorted(orphanedPredictions, (item) => item.id), retiredContestPredictions: sorted(retiredContestPredictions, (item) => item.id),
    ambiguousReferences: sorted(ambiguousReferences, (item) => item.target), approvedCandidateMerges: sorted(approvedCandidateMerges, (item) => item.target),
    researchMerge, contestMetricCopies, copyPlan: { candidateResearch: researchInputs.length, contestMetrics: contestMetricCopies.length },
    legacyRetirement: 'retain legacy documents as aliases after activation; do not delete in this migration', safeToActivate,
  };
}

/** Replays one captured snapshot without opening Firestore and returns the full dry-run evidence. */
export function buildCanonicalMigrationReport(snapshot: CanonicalMigrationSnapshot) {
  const validated = validatedSnapshot(snapshot);
  const inputs = validated.inputs;
  const inputDigest = validated.inputDigest;
  const plan = buildCanonicalShadowPlan(inputs);
  const fullPlan = {
    migration: plan.migration,
    inputDigest,
    mappingDigest: plan.mappingDigest,
    overrides: plan.overrides,
    raceMappings: plan.raceMappings,
    candidateMappings: plan.candidateMappings,
    predictionMigrations: plan.predictionMigrations,
    shadowContests: plan.shadowContests,
    retiredContests: plan.retiredContests,
    unresolvedRaces: plan.unresolvedRaces,
    unresolvedCandidates: plan.unresolvedCandidates,
    orphanedPredictions: plan.orphanedPredictions,
    retiredContestPredictions: plan.retiredContestPredictions,
    ambiguousReferences: plan.ambiguousReferences,
    approvedCandidateMerges: plan.approvedCandidateMerges,
    researchMerge: plan.researchMerge,
    contestMetricCopies: plan.contestMetricCopies,
  };
  const planDigest = digest(fullPlan);
  return {
    operation: 'dry-run', applied: false, projectId: validated.projectId, databaseId: validated.databaseId,
    snapshotSchemaVersion: validated.schemaVersion, capturedAt: validated.capturedAt, collectionCounts: validated.collectionCounts,
    inputDigest, mappingDigest: plan.mappingDigest, planDigest,
    scanned: { live2026Races: inputs.races.length, predictions: inputs.predictions.length, candidateResearch: inputs.candidateResearch.length, contestMetrics: inputs.contestMetrics.length },
    canonicalVotingFederalSeatCount: CANONICAL_2026_FEDERAL_CONTESTS.length, migration: plan.migration, overrides: plan.overrides,
    mappings: { races: plan.raceMappings.length, candidates: plan.candidateMappings.length, predictions: plan.predictionMigrations.length,
      samples: { races: plan.raceMappings.slice(0, 10), candidates: plan.candidateMappings.slice(0, 10), predictions: plan.predictionMigrations.slice(0, 10) } },
    copyPlan: { ...plan.copyPlan, mergedCandidateResearchDocuments: plan.researchMerge.documents.length, deduplicatedResearchSections: plan.researchMerge.deduplicatedSections,
      researchConflicts: plan.researchMerge.conflicts, metricCopiesPreservingProvenance: plan.contestMetricCopies.length },
    shadowContests: { total: plan.shadowContests.length, fromLegacy: plan.shadowContests.filter((item) => item.action === 'create_from_legacy').length,
      registryOnly: plan.shadowContests.filter((item) => item.action === 'create_registry_seat').length },
    unresolved: { races: plan.unresolvedRaces, candidateCount: plan.unresolvedCandidates.length, candidateSamples: plan.unresolvedCandidates.slice(0, 20),
      orphanedPredictions: plan.orphanedPredictions, retiredContestPredictions: plan.retiredContestPredictions, ambiguousReferences: plan.ambiguousReferences,
      approvedCandidateMerges: plan.approvedCandidateMerges },
    legacyRetirement: plan.legacyRetirement, requiresProductionChoice: plan.raceMappings.length > 0 || plan.candidateMappings.length > 0, safeToActivate: plan.safeToActivate,
  };
}
