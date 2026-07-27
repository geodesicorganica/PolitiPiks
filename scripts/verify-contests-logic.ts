import { CANONICAL_2026_FEDERAL_CONTESTS, canonicalFederalContestId, isValidFecHouseDistrict } from '../ingest/src/federalRegistry.js';

type CanonicalCandidate = {
  id?: unknown;
  externalIds?: { fecCandidateId?: unknown };
  qualificationStatus?: unknown;
  ballotVerifiedAt?: unknown;
  ballotSourceUrl?: unknown;
  pickEligibility?: unknown;
};

type CanonicalRace = {
  id: string;
  electionYear?: unknown;
  mode?: unknown;
  state?: unknown;
  office?: unknown;
  district?: unknown;
  candidates?: unknown;
  eligibleCandidateIds?: unknown;
};

type CanonicalPrediction = { id: string; targetId?: unknown; pick?: unknown };

const canonicalText = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/**
 * Checks the canonical shadow before it becomes the only active 2026 surface.
 * It is deliberately independent of UI filtering: activation is allowed only
 * when the canonical voting-seat set and every prediction target/pick agree.
 */
export function findCanonical2026Issues(races: CanonicalRace[], predictions: CanonicalPrediction[] = []) {
  const issues: string[] = [];
  const expectedIds = new Set(CANONICAL_2026_FEDERAL_CONTESTS.map((contest) => contest.id));
  const active = races.filter((race) => Number(race.electionYear) === 2026 && canonicalText(race.mode) === 'live'
    && ['House', 'Senate'].includes(canonicalText(race.office)));
  const byId = new Map(active.map((race) => [race.id, race]));
  const seatOwners = new Map<string, string>();

  for (const race of active) {
    const office = canonicalText(race.office);
    const state = canonicalText(race.state);
    const district = canonicalText(race.district) || null;
    const expected = office === 'House'
      ? (isValidFecHouseDistrict(state, district) ? canonicalFederalContestId('H', state, district) : null)
      : canonicalFederalContestId('S', state);
    if (!expected) {
      issues.push(`non-voting or invalid 2026 federal seat: ${race.id}`);
      continue;
    }
    if (race.id !== expected) issues.push(`unstable canonical contest ID: ${race.id} should be ${expected}`);
    const owner = seatOwners.get(expected);
    if (owner) issues.push(`ambiguous canonical seat ${expected}: ${owner}, ${race.id}`);
    else seatOwners.set(expected, race.id);

    const eligibleCandidateIds = Array.isArray(race.eligibleCandidateIds)
      ? race.eligibleCandidateIds.filter((candidateId): candidateId is string => typeof candidateId === 'string' && candidateId.trim().length > 0)
      : null;
    if (!eligibleCandidateIds || new Set(eligibleCandidateIds).size !== eligibleCandidateIds.length) {
      issues.push(`invalid eligible candidate list: ${race.id}`);
    }

    for (const rawCandidate of Array.isArray(race.candidates) ? race.candidates : []) {
      const candidate = rawCandidate as CanonicalCandidate;
      const candidateId = canonicalText(candidate.id);
      const fecCandidateId = canonicalText(candidate.externalIds?.fecCandidateId);
      const qualification = canonicalText(candidate.qualificationStatus);
      const ballotVerifiedAt = canonicalText(candidate.ballotVerifiedAt);
      const ballotSourceUrl = canonicalText(candidate.ballotSourceUrl);
      const pickEligibility = canonicalText(candidate.pickEligibility);
      if (fecCandidateId && candidateId !== `fec-${fecCandidateId}`) {
        issues.push(`unstable FEC candidate ID: ${race.id}/${candidateId} should be fec-${fecCandidateId}`);
      }
      if (!qualification || qualification === 'unresolved') {
        issues.push(`unresolved candidate qualification: ${race.id}/${candidateId || 'missing-id'}`);
      }
      if (qualification === 'on_ballot' && (!ballotVerifiedAt || !ballotSourceUrl)) {
        issues.push(`unverified on-ballot candidate: ${race.id}/${candidateId}`);
      }
      if (pickEligibility === 'eligible' && (qualification !== 'on_ballot' || !ballotVerifiedAt || !ballotSourceUrl)) {
        issues.push(`ineligible pick exposed: ${race.id}/${candidateId}`);
      }
      if (eligibleCandidateIds?.includes(candidateId) && pickEligibility !== 'eligible') {
        issues.push(`ineligible candidate listed for picks: ${race.id}/${candidateId}`);
      }
    }
  }

  for (const expectedId of expectedIds) {
    if (!seatOwners.has(expectedId)) issues.push(`missing canonical 2026 voting seat: ${expectedId}`);
  }

  for (const prediction of predictions) {
    const targetId = canonicalText(prediction.targetId);
    const pick = canonicalText(prediction.pick);
    const target = byId.get(targetId);
    if (!target) continue;
    const matches = (Array.isArray(target.candidates) ? target.candidates : [])
      .filter((candidate) => canonicalText((candidate as CanonicalCandidate).id) === pick).length;
    if (matches !== 1) issues.push(`orphaned or ambiguous prediction: ${prediction.id} (${targetId}/${pick})`);
    if (!Array.isArray(target.eligibleCandidateIds) || !target.eligibleCandidateIds.includes(pick)) {
      issues.push(`prediction targets an ineligible candidate: ${prediction.id} (${targetId}/${pick})`);
    }
  }

  return issues.sort((a, b) => a.localeCompare(b));
}

export type StateCoverage = {
  President: number;
  Governor: number;
  Senate: number;
  House: number;
  ballotMeasures: number;
  houseDistricts: Set<string>;
};

export function getStateCoverage(coverageByState: Map<string, StateCoverage>, state: string) {
  const existing = coverageByState.get(state);
  if (existing) return existing;

  const next: StateCoverage = {
    President: 0,
    Governor: 0,
    Senate: 0,
    House: 0,
    ballotMeasures: 0,
    houseDistricts: new Set<string>(),
  };
  coverageByState.set(state, next);
  return next;
}

export function getYearStateCoverage(
  coverageByYearState: Map<string, Map<string, StateCoverage>>,
  year: string,
  state: string,
) {
  let coverageByState = coverageByYearState.get(year);
  if (!coverageByState) {
    coverageByState = new Map<string, StateCoverage>();
    coverageByYearState.set(year, coverageByState);
  }
  return getStateCoverage(coverageByState, state);
}

export function findMissing2024StateViewSlots(
  coverageByYearState: Map<string, Map<string, StateCoverage>>,
  expectedHouseSeats: Record<string, number>,
) {
  const coverage2024 = coverageByYearState.get('2024') ?? new Map<string, StateCoverage>();
  const missing: string[] = [];
  const allStates = new Set([...Object.keys(expectedHouseSeats), ...coverage2024.keys()]);

  for (const state of Array.from(allStates).sort((a, b) => a.localeCompare(b))) {
    const coverage = coverage2024.get(state);
    const expectedHouse = expectedHouseSeats[state];

    if (!coverage) {
      missing.push(`${state}: missing all contests`);
      continue;
    }

    if (coverage.President === 0) {
      missing.push(`${state}: missing President`);
    }

    if (typeof expectedHouse === 'number' && coverage.House !== expectedHouse) {
      missing.push(`${state}: expected ${expectedHouse} House contests, found ${coverage.House}`);
    }
  }

  return missing;
}

export function recordUnidentifiedCandidateName(
  name: string,
  party: unknown,
  candidateId: string,
  seenNameParties: Set<string>,
) {
  // Candidate IDs are authoritative. Same-name candidates with distinct IDs
  // are allowed, as are same-name candidates from different parties.
  if (candidateId) return false;
  const normalizedName = name.replace(/\s+/g, ' ').trim().toUpperCase();
  const normalizedParty = typeof party === 'string' ? party.trim().toUpperCase() : '';
  const key = `${normalizedName}|${normalizedParty}`;
  const duplicate = seenNameParties.has(key);
  seenNameParties.add(key);
  return duplicate;
}
