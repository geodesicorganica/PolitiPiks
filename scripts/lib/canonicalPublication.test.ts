import assert from 'node:assert/strict';
import { buildCanonicalPublicationPlan, auditCanonicalPublicationPlan, buildCanonicalPublicationSnapshot, certifyCanonicalPublicationPlan } from './canonicalPublication.js';
import { buildPublicationV2ActivationPlan } from './canonicalActivation.js';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import { PRODUCT_LOCK_CLOSE_AT } from './deadlineRegistry.js';

const deadline = {
  electionId: '2026-GA-senate-class-2', jurisdiction: 'GA', localPollClosingTime: '19:00', timeZone: 'America/New_York',
  closeAt: { __firestoreType: 'timestamp/v1' as const, seconds: 1793505600, nanoseconds: 0 },
  electionDate: '2026-11-03', sourceName: 'Test-only deadline fixture', sourceUrl: 'https://elections.example.gov/fixture', retrievedAt: '2026-01-01T00:00:00.000Z', reviewedAt: '2026-01-01T00:00:00.000Z', reviewerStatus: 'reviewed' as const,
  notes: 'Test fixture only; not an official deadline record.', sourceRuleIds: ['fixture-ga'], citation: 'Fixture citation.',
};
const candidate = {
  id: 'legacy-candidate', name: 'Example Candidate', party: 'Independent', candidateState: 'active', visibility: 'visible',
  qualificationStatus: 'on_ballot', pickEligibility: 'eligible', ballotVerifiedAt: '2026-01-01T00:00:00.000Z',
  ballotSourceUrl: 'https://elections.example.gov/fixture-candidate', externalIds: { fecCandidateId: 'S6CA00001' },
  source: 'Test-only candidate fixture', sourceUrl: 'https://elections.example.gov/fixture-candidate', verificationLevel: 'fixture',
};
const plan = buildCanonicalPublicationPlan({
  generation: 'canonical-2026-shadow-v2',
  races: [{ id: 'legacy-ga-senate', state: 'GA', office: 'Senate', district: null, candidates: [candidate] }],
  deadlines: [deadline], predictions: [], candidateResearch: [{ raceId: 'legacy-ga-senate', candidateId: 'legacy-candidate', data: { section: 'source-backed' } }], contestMetrics: [],
  overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
const promotedRace = plan.documents.find((document) => document.path === 'races/2026-GA-senate-class-2');
assert.ok(promotedRace, 'canonical race document is built');
assert.deepEqual(promotedRace.data.closeAt, PRODUCT_LOCK_CLOSE_AT, 'product lock, never an official poll close, is the published deadline');
assert.deepEqual(promotedRace.data.officialPollCloseAt, deadline.closeAt, 'reviewed official close is retained only as supplemental research');
assert.equal(promotedRace.data.deadlineKind, 'product_safety_lock');
assert.equal((promotedRace.data.candidates as Array<{ id: string }>)[0]?.id, 'fec-S6CA00001', 'candidate is mapped to its canonical FEC identity');
assert.equal(plan.documents.some((document) => document.path.endsWith('/candidateResearch/fec-S6CA00001')), true, 'research follows the canonical candidate ID');
const audit = auditCanonicalPublicationPlan(plan);
assert.equal(audit.racesMissingCloseAt, 0, 'every canonical race receives the product lock');
assert.equal(audit.publicationLockReady, true, 'partial official research does not block prediction-lock readiness');
assert.equal(audit.officialResearchComplete, false, 'official research remains accurately incomplete');
assert.equal(audit.publicationReady, false, 'partial source input never certifies a production publication');
const snapshot = buildCanonicalPublicationSnapshot({
  projectId: 'politipiks', databaseId: 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a',
  races: [{ id: 'legacy-ga-senate', state: 'GA', office: 'Senate', district: null, candidates: [{ ...candidate, userId: 'must-not-survive' }] }],
  deadlines: [deadline], predictions: [], candidateResearch: [], contestMetrics: [], overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
assert.equal((snapshot.inputs.races[0]?.candidates[0] as Record<string, unknown>).userId, undefined, 'private candidate fields are not captured');

const completeFixture = buildCanonicalPublicationPlan({
  generation: 'canonical-2026-shadow-v2',
  races: CANONICAL_2026_FEDERAL_CONTESTS.map((seat, index) => ({
    id: seat.id, state: seat.state, office: seat.office, district: seat.district,
    candidates: [{ ...candidate, id: `fec-H6AA${String(index + 1).padStart(5, '0')}`, externalIds: { fecCandidateId: `H6AA${String(index + 1).padStart(5, '0')}` } }],
  })),
  deadlines: CANONICAL_2026_FEDERAL_CONTESTS.map((seat) => ({ ...deadline, electionId: seat.id, jurisdiction: seat.state })),
  predictions: [], candidateResearch: [], contestMetrics: [], overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
assert.equal(auditCanonicalPublicationPlan(completeFixture).publicationReady, true, 'the actual registry -> publication builder -> audit chain can certify a complete v2-shaped payload');
const certification = certifyCanonicalPublicationPlan(completeFixture, 'abcdef1');
const activation = buildPublicationV2ActivationPlan({ projectId: 'test-project', databaseId: 'test-database', ...certification }, completeFixture);
assert.equal(activation.documents.filter((document) => /^races\/[^/]+$/.test(document.path)).length, 470, 'only an audited 470-seat plan reaches activation');
const replayFixture = buildCanonicalPublicationPlan({
  generation: 'canonical-2026-shadow-v2', races: [...CANONICAL_2026_FEDERAL_CONTESTS].reverse().map((seat, index) => ({
    id: seat.id, state: seat.state, office: seat.office, district: seat.district,
    candidates: [{ ...candidate, id: `fec-H6AA${String(CANONICAL_2026_FEDERAL_CONTESTS.length - index).padStart(5, '0')}`, externalIds: { fecCandidateId: `H6AA${String(CANONICAL_2026_FEDERAL_CONTESTS.length - index).padStart(5, '0')}` } }],
  })), deadlines: [...CANONICAL_2026_FEDERAL_CONTESTS].reverse().map((seat) => ({ ...deadline, electionId: seat.id, jurisdiction: seat.state })), predictions: [], candidateResearch: [], contestMetrics: [], overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
assert.equal(replayFixture.inputDigest, completeFixture.inputDigest, 'shuffled complete inputs have the same digest');
assert.equal(replayFixture.planDigest, completeFixture.planDigest, 'shuffled complete inputs have the same plan digest');
assert.equal(completeFixture.lockPolicyDigest.length, 64, 'the approved policy has its own deterministic certification digest');
const noBallotEvidence = buildCanonicalPublicationPlan({
  generation: 'canonical-2026-shadow-v2', races: [{ id: 'legacy-ga-senate', state: 'GA', office: 'Senate', district: null, candidates: [{ ...candidate, ballotSourceUrl: '' }] }],
  deadlines: [deadline], predictions: [], candidateResearch: [], contestMetrics: [], overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
assert.equal(auditCanonicalPublicationPlan(noBallotEvidence).eligibleWithoutBallotEvidence, 1, 'eligible candidates require official-ballot evidence');

console.log('canonical publication builder tracer test passed');
