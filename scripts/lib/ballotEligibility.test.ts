import assert from 'node:assert/strict';
import { normalizeOfficialBallotEvidence, parseOfficialBallotSource, validateBallotEligibilityEvidence } from './ballotEligibility.js';

const candidates = [
  { canonicalRaceId: '2026-GA-senate-class-2', fecCandidateId: 'S6GA00001', name: 'Alex Example', party: 'Democrat' },
  { canonicalRaceId: '2026-GA-house-001', fecCandidateId: 'H6GA00001', name: 'Casey Example', party: 'Republican' },
  { canonicalRaceId: '2026-GA-house-001', fecCandidateId: 'H6GA00002', name: 'Casey Example', party: 'Republican' },
];
const source = (records: unknown[], sourceStatus: 'available' | 'not_yet_published' = 'available') => parseOfficialBallotSource({ schemaVersion: 1, electionYear: 2026, state: 'GA', election: 'general', sourceStatus,
  sourceAuthority: 'Georgia Secretary of State', sourceUrl: 'https://sos.ga.gov/example', sourcePublishedAt: '2026-09-19T00:00:00.000Z', retrievedAt: '2026-09-20T00:00:00.000Z', reviewedAt: '2026-09-20T00:00:00.000Z', records });

const eligible = normalizeOfficialBallotEvidence(source([{ canonicalRaceId: '2026-GA-senate-class-2', fecCandidateId: 'S6GA00001', ballotName: 'Alex Example', ballotParty: 'Democrat', qualificationStatus: 'on_ballot' }]), candidates);
assert.equal(eligible.counts.eligible, 1);
assert.equal(validateBallotEligibilityEvidence(eligible.evidence)[0]?.fecCandidateId, 'S6GA00001');
assert.throws(() => validateBallotEligibilityEvidence([{ ...eligible.evidence[0]!, sourceAuthority: 'Unverified source' }]), /invalid ballot eligibility evidence/, 'evidence digests are tamper-evident');
const withdrawn = normalizeOfficialBallotEvidence(source([{ canonicalRaceId: '2026-GA-senate-class-2', fecCandidateId: 'S6GA00001', ballotName: 'Alex Example', ballotParty: 'Democrat', qualificationStatus: 'withdrawn' }]), candidates);
assert.equal(withdrawn.counts.withdrawn, 1);
const ineligible = normalizeOfficialBallotEvidence(source([{ canonicalRaceId: '2026-GA-senate-class-2', fecCandidateId: 'S6GA00001', ballotName: 'Alex Example', ballotParty: 'Democrat', qualificationStatus: 'ineligible' }]), candidates);
assert.equal(ineligible.counts.ineligible, 1);
const ambiguous = normalizeOfficialBallotEvidence(source([{ canonicalRaceId: '2026-GA-house-001', ballotName: 'Casey Example', ballotParty: 'Republican', qualificationStatus: 'on_ballot' }]), candidates);
assert.equal(ambiguous.counts.unresolved, 1);
const unmatched = normalizeOfficialBallotEvidence(source([{ canonicalRaceId: '2026-GA-senate-class-2', ballotName: 'Unknown', ballotParty: 'Democrat', qualificationStatus: 'on_ballot' }]), candidates);
assert.equal(unmatched.unresolved[0]?.reason, 'missing_candidate');
const duplicate = normalizeOfficialBallotEvidence(source([
  { canonicalRaceId: '2026-GA-senate-class-2', fecCandidateId: 'S6GA00001', ballotName: 'Alex Example', qualificationStatus: 'on_ballot' },
  { canonicalRaceId: '2026-GA-senate-class-2', fecCandidateId: 'S6GA00001', ballotName: 'Alex Example', qualificationStatus: 'on_ballot' },
]), candidates);
assert.equal(duplicate.evidence.length, 0); assert.equal(duplicate.unresolved.every((item) => item.reason === 'duplicate_candidate'), true);
const conflicting = normalizeOfficialBallotEvidence(source([
  { canonicalRaceId: '2026-GA-senate-class-2', fecCandidateId: 'S6GA00001', ballotName: 'Alex Example', qualificationStatus: 'on_ballot' },
  { canonicalRaceId: '2026-GA-senate-class-2', fecCandidateId: 'S6GA00001', ballotName: 'Alex Example', qualificationStatus: 'withdrawn' },
]), candidates);
assert.equal(conflicting.evidence.length, 0); assert.equal(conflicting.unresolved.every((item) => item.reason === 'conflicting_candidate'), true);
const retired = normalizeOfficialBallotEvidence(source([{ canonicalRaceId: '2026-GA-house-010', fecCandidateId: 'H6GA99999', ballotName: 'Retired Example', qualificationStatus: 'on_ballot' }]), candidates);
assert.equal(retired.unresolved[0]?.reason, 'missing_candidate', 'retired or unmapped candidates are never made eligible');
const unavailable = normalizeOfficialBallotEvidence(source([], 'not_yet_published'), candidates);
assert.deepEqual(unavailable.counts, { sourceRecords: 0, resolved: 0, eligible: 0, withdrawn: 0, ineligible: 0, unresolved: 0 });
assert.throws(() => parseOfficialBallotSource({ ...source([], 'not_yet_published'), records: [{ canonicalRaceId: '2026-GA-senate-class-2' }] }), /unpublished/);
console.log('ballot eligibility normalization tests passed');
