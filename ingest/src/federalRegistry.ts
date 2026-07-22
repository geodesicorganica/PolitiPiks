import { electionDayFor, normParty } from './sources/medslCommon.js';

export type CanonicalFederalContest = {
  id: string;
  state: string;
  office: 'House' | 'Senate';
  district: string | null;
  seatKind: 'regular' | 'special';
  senateClass?: 1 | 2 | 3;
  electionYear: 2026;
  mode: 'live';
  status: 'upcoming';
  closeDate: string;
  candidates: [];
  source: 'Politipiks canonical federal seat registry';
  sourceUrl: string;
  verificationLevel: 'derived';
};

export type NonVotingFederalContest = {
  id: string;
  jurisdiction: 'DC' | 'AS' | 'GU' | 'MP' | 'PR' | 'VI';
  office: 'Delegate' | 'Resident Commissioner';
  registryStatus: 'excluded_non_voting';
  votingHouseSeat: false;
  reason: string;
};

export type FecFederalCandidateInput = {
  candidate_id: string;
  name: string;
  party_full?: string;
  incumbent_challenge?: 'I' | 'C' | 'O' | null;
  candidate_status?: string;
  candidate_inactive?: boolean;
};

export const HOUSE_SEATS_BY_STATE: Record<string, number> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14,
  HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8,
  MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12,
  NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7,
  SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1,
};

// Senate.gov lists these seats as Class II, whose terms expire in January 2027.
export const SENATE_CLASS_2_STATES = [
  'AL', 'AK', 'AR', 'CO', 'DE', 'GA', 'ID', 'IL', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MA', 'MI', 'MN', 'MS', 'MT', 'NE', 'NH', 'NJ', 'NM', 'NC', 'OK',
  'OR', 'RI', 'SC', 'SD', 'TN', 'TX', 'VA', 'WV', 'WY',
] as const;

// The FEC's 2026 primary-date calendar identifies FL and OH Senate elections
// as unexpired terms. These IDs identify the seat, not a candidate or filer.
export const FEC_2026_SPECIAL_SENATE_SEATS = [
  { state: 'FL', senateClass: 3 as const, id: '2026-FL-senate-special-class-3' },
  { state: 'OH', senateClass: 3 as const, id: '2026-OH-senate-special-class-3' },
] as const;

export const CANONICAL_2026_NON_VOTING_CONTESTS: NonVotingFederalContest[] = [
  { id: '2026-DC-delegate', jurisdiction: 'DC', office: 'Delegate', registryStatus: 'excluded_non_voting', votingHouseSeat: false, reason: 'District of Columbia elects a non-voting Delegate; it is not one of the 435 voting House seats.' },
  { id: '2026-AS-delegate', jurisdiction: 'AS', office: 'Delegate', registryStatus: 'excluded_non_voting', votingHouseSeat: false, reason: 'American Samoa elects a non-voting Delegate; it is outside voting House-seat coverage.' },
  { id: '2026-GU-delegate', jurisdiction: 'GU', office: 'Delegate', registryStatus: 'excluded_non_voting', votingHouseSeat: false, reason: 'Guam elects a non-voting Delegate; it is outside voting House-seat coverage.' },
  { id: '2026-MP-delegate', jurisdiction: 'MP', office: 'Delegate', registryStatus: 'excluded_non_voting', votingHouseSeat: false, reason: 'Northern Mariana Islands elects a non-voting Delegate; it is outside voting House-seat coverage.' },
  { id: '2026-VI-delegate', jurisdiction: 'VI', office: 'Delegate', registryStatus: 'excluded_non_voting', votingHouseSeat: false, reason: 'U.S. Virgin Islands elects a non-voting Delegate; it is outside voting House-seat coverage.' },
  { id: '2028-PR-resident-commissioner', jurisdiction: 'PR', office: 'Resident Commissioner', registryStatus: 'excluded_non_voting', votingHouseSeat: false, reason: 'Puerto Rico elects a non-voting Resident Commissioner on a four-year cycle, not as a 2026 voting House seat.' },
];

function houseDistricts(state: string, seats: number) {
  return seats === 1 ? ['AL'] : Array.from({ length: seats }, (_, index) => String(index + 1).padStart(3, '0'));
}

function contestBase() {
  return {
    electionYear: 2026 as const,
    mode: 'live' as const,
    status: 'upcoming' as const,
    closeDate: electionDayFor(2026),
    candidates: [] as [],
    source: 'Politipiks canonical federal seat registry' as const,
    sourceUrl: 'https://www.house.gov/representatives',
    verificationLevel: 'derived' as const,
  };
}

export const CANONICAL_2026_FEDERAL_CONTESTS: CanonicalFederalContest[] = [
  ...Object.entries(HOUSE_SEATS_BY_STATE).flatMap(([state, seats]) => houseDistricts(state, seats).map((district) => ({
    ...contestBase(),
    id: `2026-${state}-house-${district.toLowerCase()}`,
    state,
    office: 'House' as const,
    district,
    seatKind: 'regular' as const,
  }))),
  ...SENATE_CLASS_2_STATES.map((state) => ({
    ...contestBase(),
    id: `2026-${state}-senate-class-2`,
    state,
    office: 'Senate' as const,
    district: null,
    seatKind: 'regular' as const,
    senateClass: 2 as const,
    sourceUrl: 'https://www.senate.gov/senators/Class_II.htm',
  })),
  ...FEC_2026_SPECIAL_SENATE_SEATS.map((seat) => ({
    ...contestBase(),
    id: seat.id,
    state: seat.state,
    office: 'Senate' as const,
    district: null,
    seatKind: 'special' as const,
    senateClass: seat.senateClass,
    sourceUrl: 'https://www.fec.gov/documents/5910/2026pdates.pdf',
  })),
];

export function isValidFecHouseDistrict(state: string, district: string | null | undefined) {
  const seats = HOUSE_SEATS_BY_STATE[state.toUpperCase()];
  if (!seats || !district) return false;
  if (district === 'AL') return seats === 1;
  const districtNumber = Number(district);
  return Number.isInteger(districtNumber) && districtNumber >= 1 && districtNumber <= seats;
}

function displayNameFromFec(fecName: string) {
  const commaIndex = fecName.indexOf(',');
  if (commaIndex < 0) return fecName.trim();
  return `${fecName.slice(commaIndex + 1).trim()} ${fecName.slice(0, commaIndex).trim()}`.replace(/\s+/g, ' ').trim();
}

export function normalizeFecFederalCandidate(fec: FecFederalCandidateInput) {
  const inactive = fec.candidate_inactive === true;
  return {
    id: `fec-${fec.candidate_id}`,
    name: displayNameFromFec(fec.name),
    party: normParty(fec.party_full ?? ''),
    ...(fec.incumbent_challenge === 'I' ? { incumbent: true } : {}),
    qualificationStatus: 'filed' as const,
    candidateState: inactive ? 'inactive' as const : 'active' as const,
    visibility: inactive ? 'hidden' as const : 'visible' as const,
    pickEligibility: 'ineligible' as const,
    ballotVerifiedAt: undefined,
    ballotSourceUrl: undefined,
    externalIds: { fecCandidateId: fec.candidate_id },
    source: 'Federal Election Commission',
    sourceUrl: `https://www.fec.gov/data/candidate/${fec.candidate_id}/?cycle=2026&election_full=true`,
    verificationLevel: 'official' as const,
  };
}

export function canonicalFederalContestId(office: 'S' | 'H', state: string, district?: string | null) {
  const normalizedState = state.toUpperCase();
  if (office === 'H') return district ? `2026-${normalizedState}-house-${district.toLowerCase()}` : null;
  const special = FEC_2026_SPECIAL_SENATE_SEATS.find((seat) => seat.state === normalizedState);
  if (special) return special.id;
  return (SENATE_CLASS_2_STATES as readonly string[]).includes(normalizedState)
    ? `2026-${normalizedState}-senate-class-2`
    : null;
}
