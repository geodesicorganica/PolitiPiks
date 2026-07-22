import assert from 'node:assert/strict';
import {
  CANONICAL_2026_FEDERAL_CONTESTS,
  CANONICAL_2026_NON_VOTING_CONTESTS,
  FEC_2026_SPECIAL_SENATE_SEATS,
  normalizeFecFederalCandidate,
} from './federalRegistry.js';

const votingHouse = CANONICAL_2026_FEDERAL_CONTESTS.filter((contest) => contest.office === 'House');
const regularSenate = CANONICAL_2026_FEDERAL_CONTESTS.filter((contest) => contest.office === 'Senate' && contest.seatKind === 'regular');
const specialSenate = CANONICAL_2026_FEDERAL_CONTESTS.filter((contest) => contest.office === 'Senate' && contest.seatKind === 'special');

assert.equal(votingHouse.length, 435, 'the registry must generate all voting House seats without filings');
assert.equal(new Set(votingHouse.map((contest) => contest.id)).size, 435, 'every voting House seat must have a durable unique ID');
assert.equal(regularSenate.length, 33, '2026 regular Senate seats are Class II');
assert.equal(specialSenate.length, FEC_2026_SPECIAL_SENATE_SEATS.length, 'each known unexpired Senate term gets a distinct contest');
assert.ok(specialSenate.some((contest) => contest.id === '2026-FL-senate-special-class-3'));
assert.ok(specialSenate.some((contest) => contest.id === '2026-OH-senate-special-class-3'));
assert.equal(CANONICAL_2026_NON_VOTING_CONTESTS.length, 6, 'DC and territorial representation is modeled, not coerced into voting House seats');
assert.ok(CANONICAL_2026_NON_VOTING_CONTESTS.every((contest) => contest.registryStatus === 'excluded_non_voting'));

const candidate = normalizeFecFederalCandidate({
  candidate_id: 'H6GA01001',
  name: 'DOE, JANE',
  party_full: 'Democratic Party',
  candidate_status: 'C',
});
assert.equal(candidate.id, 'fec-H6GA01001', 'FEC candidate IDs are durable candidate identities');
assert.equal(candidate.visibility, 'visible');
assert.equal(candidate.qualificationStatus, 'filed');
assert.equal(candidate.pickEligibility, 'ineligible', 'FEC filing cannot establish ballot eligibility');
assert.equal(candidate.ballotVerifiedAt, undefined);

console.log('canonical federal registry tests passed');
