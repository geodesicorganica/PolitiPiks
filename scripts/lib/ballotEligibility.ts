import { createHash } from 'node:crypto';

export type BallotQualificationStatus = 'on_ballot' | 'withdrawn' | 'ineligible';
export type BallotSourceStatus = 'available' | 'not_yet_published';

export type CanonicalBallotCandidate = {
  canonicalRaceId: string;
  fecCandidateId: string;
  name: string;
  party: string;
};

export type OfficialBallotCandidate = {
  canonicalRaceId: string;
  ballotName: string;
  ballotParty?: string;
  qualificationStatus: BallotQualificationStatus;
  fecCandidateId?: string;
};

export type OfficialBallotSourceInput = {
  schemaVersion: 1;
  electionYear: number;
  state: string;
  election: 'general';
  sourceStatus: BallotSourceStatus;
  sourceAuthority: string;
  sourceUrl: string;
  sourcePublishedAt?: string;
  retrievedAt: string;
  reviewedAt: string;
  records: OfficialBallotCandidate[];
};

export type BallotEligibilityEvidence = {
  schemaVersion: 1;
  canonicalRaceId: string;
  fecCandidateId: string;
  qualificationStatus: BallotQualificationStatus;
  ballotName?: string;
  ballotParty?: string;
  sourceAuthority: string;
  sourceUrl: string;
  sourcePublishedAt?: string;
  retrievedAt: string;
  reviewedAt: string;
  evidenceDigest: string;
};

export type UnresolvedBallotEvidence = {
  recordDigest: string;
  canonicalRaceId: string;
  reason: 'missing_candidate' | 'ambiguous_candidate' | 'conflicting_candidate' | 'duplicate_candidate' | 'invalid_record';
};

export type BallotEligibilityReport = {
  source: Omit<OfficialBallotSourceInput, 'records'>;
  evidence: BallotEligibilityEvidence[];
  unresolved: UnresolvedBallotEvidence[];
  counts: { sourceRecords: number; resolved: number; eligible: number; withdrawn: number; ineligible: number; unresolved: number };
  digest: string;
};

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const canonicalJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]`
  : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const normalized = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
const validDate = (value: unknown) => Boolean(text(value)) && !Number.isNaN(Date.parse(text(value)));
const validFec = (value: unknown) => /^[HS]\d[A-Z]{2}\d{5}$/.test(text(value));
const sort = <T>(values: T[], key: (value: T) => string) => [...values].sort((left, right) => key(left).localeCompare(key(right)));

function assertSource(input: OfficialBallotSourceInput) {
  if (input.schemaVersion !== 1 || input.electionYear !== 2026 || !/^[A-Z]{2}$/.test(input.state) || input.election !== 'general'
    || !['available', 'not_yet_published'].includes(input.sourceStatus) || !text(input.sourceAuthority) || !/^https:\/\//.test(input.sourceUrl)
    || !validDate(input.retrievedAt) || !validDate(input.reviewedAt) || (input.sourcePublishedAt !== undefined && !validDate(input.sourcePublishedAt)) || !Array.isArray(input.records)) {
    throw new Error('invalid official ballot source input');
  }
  if (input.sourceStatus === 'not_yet_published' && input.records.length !== 0) throw new Error('unpublished ballot source cannot contain candidate records');
}

/** Strictly validates a local, source-backed state input without contacting Firebase or the network. */
export function parseOfficialBallotSource(value: unknown): OfficialBallotSourceInput {
  if (!isRecord(value)) throw new Error('official ballot source must be an object');
  const input: OfficialBallotSourceInput = {
    schemaVersion: value.schemaVersion as 1,
    electionYear: value.electionYear as number,
    state: text(value.state),
    election: value.election as 'general',
    sourceStatus: value.sourceStatus as BallotSourceStatus,
    sourceAuthority: text(value.sourceAuthority),
    sourceUrl: text(value.sourceUrl),
    ...(value.sourcePublishedAt === undefined ? {} : { sourcePublishedAt: text(value.sourcePublishedAt) }),
    retrievedAt: text(value.retrievedAt), reviewedAt: text(value.reviewedAt),
    records: Array.isArray(value.records) ? value.records.map((record) => ({
      canonicalRaceId: text(isRecord(record) ? record.canonicalRaceId : ''),
      ballotName: text(isRecord(record) ? record.ballotName : ''),
      ...(text(isRecord(record) ? record.ballotParty : '') ? { ballotParty: text((record as Json).ballotParty) } : {}),
      qualificationStatus: (isRecord(record) ? record.qualificationStatus : '') as BallotQualificationStatus,
      ...(text(isRecord(record) ? record.fecCandidateId : '') ? { fecCandidateId: text((record as Json).fecCandidateId) } : {}),
    })) : [],
  };
  assertSource(input);
  return input;
}

/** Only an official record with an explicit FEC ID, or an exact name-plus-party match, can resolve a candidate. */
export function normalizeOfficialBallotEvidence(input: OfficialBallotSourceInput, candidates: CanonicalBallotCandidate[]): BallotEligibilityReport {
  assertSource(input);
  const candidateByRace = new Map<string, CanonicalBallotCandidate[]>();
  for (const candidate of candidates) {
    if (!/^2026-GA-/.test(candidate.canonicalRaceId) || !validFec(candidate.fecCandidateId) || !text(candidate.name) || !text(candidate.party)) continue;
    candidateByRace.set(candidate.canonicalRaceId, [...(candidateByRace.get(candidate.canonicalRaceId) ?? []), candidate]);
  }
  const tentative: Array<{ record: OfficialBallotCandidate; recordDigest: string; candidate?: CanonicalBallotCandidate; unresolved?: UnresolvedBallotEvidence }> = [];
  for (const record of input.records) {
    const recordDigest = digest(record);
    if (!/^2026-GA-/.test(record.canonicalRaceId) || !text(record.ballotName) || !['on_ballot', 'withdrawn', 'ineligible'].includes(record.qualificationStatus)) {
      tentative.push({ record, recordDigest, unresolved: { recordDigest, canonicalRaceId: record.canonicalRaceId, reason: 'invalid_record' } });
      continue;
    }
    const raceCandidates = candidateByRace.get(record.canonicalRaceId) ?? [];
    const matches = record.fecCandidateId
      ? raceCandidates.filter((candidate) => candidate.fecCandidateId === record.fecCandidateId)
      : text(record.ballotParty)
        ? raceCandidates.filter((candidate) => normalized(candidate.name) === normalized(record.ballotName) && normalized(candidate.party) === normalized(record.ballotParty!))
        : [];
    if (matches.length === 0) tentative.push({ record, recordDigest, unresolved: { recordDigest, canonicalRaceId: record.canonicalRaceId, reason: 'missing_candidate' } });
    else if (matches.length > 1) tentative.push({ record, recordDigest, unresolved: { recordDigest, canonicalRaceId: record.canonicalRaceId, reason: 'ambiguous_candidate' } });
    else tentative.push({ record, recordDigest, candidate: matches[0] });
  }
  const byTarget = new Map<string, typeof tentative>();
  for (const item of tentative.filter((item) => item.candidate)) {
    const target = `${item.record.canonicalRaceId}/${item.candidate!.fecCandidateId}`;
    byTarget.set(target, [...(byTarget.get(target) ?? []), item]);
  }
  const evidence: BallotEligibilityEvidence[] = [];
  const unresolved = tentative.flatMap((item) => item.unresolved ? [item.unresolved] : []);
  for (const [target, matches] of byTarget) {
    if (matches.length !== 1) {
      // Repeated, identical statements are duplicates; differing status statements are a
      // conflict. Neither form can silently select a pickable candidate.
      const statuses = new Set(matches.map((match) => match.record.qualificationStatus));
      const reason = statuses.size > 1 ? 'conflicting_candidate' : 'duplicate_candidate';
      for (const match of matches) unresolved.push({ recordDigest: match.recordDigest, canonicalRaceId: match.record.canonicalRaceId, reason });
      continue;
    }
    const match = matches[0]!;
    const source = { schemaVersion: 1 as const, canonicalRaceId: match.record.canonicalRaceId, fecCandidateId: match.candidate!.fecCandidateId,
      qualificationStatus: match.record.qualificationStatus, ballotName: match.record.ballotName, ...(match.record.ballotParty ? { ballotParty: match.record.ballotParty } : {}),
      sourceAuthority: input.sourceAuthority, sourceUrl: input.sourceUrl, ...(input.sourcePublishedAt ? { sourcePublishedAt: input.sourcePublishedAt } : {}), retrievedAt: input.retrievedAt, reviewedAt: input.reviewedAt };
    evidence.push({ ...source, evidenceDigest: digest(source) });
  }
  const orderedEvidence = sort(evidence, (item) => `${item.canonicalRaceId}/${item.fecCandidateId}`);
  const orderedUnresolved = sort(unresolved, (item) => `${item.canonicalRaceId}/${item.recordDigest}`);
  const { records: _records, ...source } = input;
  return {
    source,
    evidence: orderedEvidence, unresolved: orderedUnresolved,
    counts: { sourceRecords: input.records.length, resolved: orderedEvidence.length, eligible: orderedEvidence.filter((item) => item.qualificationStatus === 'on_ballot').length,
      withdrawn: orderedEvidence.filter((item) => item.qualificationStatus === 'withdrawn').length, ineligible: orderedEvidence.filter((item) => item.qualificationStatus === 'ineligible').length, unresolved: orderedUnresolved.length },
    digest: digest({ source, evidence: orderedEvidence, unresolved: orderedUnresolved }),
  };
}

/** Evidence copied into publication must remain tamper-evident and official. */
export function validateBallotEligibilityEvidence(evidence: BallotEligibilityEvidence[]) {
  const targets = new Set<string>();
  for (const item of evidence) {
    const source = { schemaVersion: item.schemaVersion, canonicalRaceId: item.canonicalRaceId, fecCandidateId: item.fecCandidateId,
      qualificationStatus: item.qualificationStatus, ...(item.ballotName ? { ballotName: item.ballotName } : {}), ...(item.ballotParty ? { ballotParty: item.ballotParty } : {}),
      sourceAuthority: item.sourceAuthority, sourceUrl: item.sourceUrl, ...(item.sourcePublishedAt ? { sourcePublishedAt: item.sourcePublishedAt } : {}), retrievedAt: item.retrievedAt, reviewedAt: item.reviewedAt };
    if (item.schemaVersion !== 1 || !/^2026-GA-/.test(item.canonicalRaceId) || !validFec(item.fecCandidateId) || !['on_ballot', 'withdrawn', 'ineligible'].includes(item.qualificationStatus)
      || !text(item.sourceAuthority) || !/^https:\/\//.test(item.sourceUrl) || !validDate(item.retrievedAt) || !validDate(item.reviewedAt) || (item.sourcePublishedAt && !validDate(item.sourcePublishedAt)) || item.evidenceDigest !== digest(source)) {
      throw new Error(`invalid ballot eligibility evidence: ${item.canonicalRaceId}/${item.fecCandidateId}`);
    }
    const target = `${item.canonicalRaceId}/${item.fecCandidateId}`;
    if (targets.has(target)) throw new Error(`duplicate ballot eligibility evidence: ${target}`);
    targets.add(target);
  }
  return sort(evidence, (item) => `${item.canonicalRaceId}/${item.fecCandidateId}`);
}

export function ballotEligibilityDigest(value: unknown) { return digest(value); }
