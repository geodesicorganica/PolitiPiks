import assert from 'node:assert/strict';
import { buildCanonicalPublicationPlan, auditCanonicalPublicationPlan, buildCanonicalPublicationSnapshot, certifyCanonicalCatalogPlan, certifyCanonicalPublicationPlan } from './canonicalPublication.js';
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
assert.deepEqual(promotedRace.data.eligibleCandidateIds, [], 'a FEC filing is browseable but is not a ballot-qualified pick');
assert.equal((promotedRace.data.candidates as Array<{ qualificationStatus: string }>)[0]?.qualificationStatus, 'filed', 'FEC normalization does not claim ballot qualification');
assert.equal((promotedRace.data.candidates as Array<{ sourceUrl: string }>)[0]?.sourceUrl, 'https://www.fec.gov/data/candidate/S6CA00001/', 'FEC candidate provenance is deterministic');
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
const completeAudit = auditCanonicalPublicationPlan(completeFixture);
assert.equal(completeAudit.catalogReady, true, 'the complete canonical registry can certify a browseable v2 catalog');
assert.equal(completeAudit.predictionReady, false, 'FEC filings alone never certify candidates for picks');
assert.equal(completeAudit.publicationReady, false, 'catalog certification cannot authorize a pick-capable publication');
const catalogCertification = certifyCanonicalCatalogPlan(completeFixture, 'abcdef1');
assert.equal(catalogCertification.expectedCounts.races, 470, 'catalog certification retains the complete federal set');
assert.throws(() => certifyCanonicalPublicationPlan(completeFixture, 'abcdef1'), /not ready/, 'pick certification remains closed without official ballot evidence');
assert.throws(() => buildPublicationV2ActivationPlan({ projectId: 'test-project', databaseId: 'test-database', ...catalogCertification }, completeFixture), /not ready/, 'catalog-only certification cannot become an activation plan');
const replayFixture = buildCanonicalPublicationPlan({
  generation: 'canonical-2026-shadow-v2', races: [...CANONICAL_2026_FEDERAL_CONTESTS].reverse().map((seat, index) => ({
    id: seat.id, state: seat.state, office: seat.office, district: seat.district,
    candidates: [{ ...candidate, id: `fec-H6AA${String(CANONICAL_2026_FEDERAL_CONTESTS.length - index).padStart(5, '0')}`, externalIds: { fecCandidateId: `H6AA${String(CANONICAL_2026_FEDERAL_CONTESTS.length - index).padStart(5, '0')}` } }],
  })), deadlines: [...CANONICAL_2026_FEDERAL_CONTESTS].reverse().map((seat) => ({ ...deadline, electionId: seat.id, jurisdiction: seat.state })), predictions: [], candidateResearch: [], contestMetrics: [], overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
assert.equal(replayFixture.inputDigest, completeFixture.inputDigest, 'shuffled complete inputs have the same digest');
assert.equal(replayFixture.planDigest, completeFixture.planDigest, 'shuffled complete inputs have the same plan digest');
assert.equal(completeFixture.lockPolicyDigest.length, 64, 'the approved policy has its own deterministic certification digest');
assert.equal(completeFixture.excludedSourceDocuments.candidateResearch.nonCanonicalRace, 0, 'canonical fixtures do not report historical research exclusions');
const noBallotEvidence = buildCanonicalPublicationPlan({
  generation: 'canonical-2026-shadow-v2', races: [{ id: 'legacy-ga-senate', state: 'GA', office: 'Senate', district: null, candidates: [{ ...candidate, ballotSourceUrl: '' }] }],
  deadlines: [deadline], predictions: [], candidateResearch: [], contestMetrics: [], overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
assert.equal(auditCanonicalPublicationPlan(noBallotEvidence).eligibleWithoutBallotEvidence, 0, 'FEC normalization removes unsupported eligibility claims');

const catalogOnlyFixture = buildCanonicalPublicationPlan({
  generation: 'canonical-2026-shadow-v2',
  races: [{ ...CANONICAL_2026_FEDERAL_CONTESTS.find((seat) => seat.id === '2026-GA-senate-class-2')!, candidates: [{ ...candidate, id: 'fec-S6CA00001' }] }], deadlines: [], predictions: [],
  candidateResearch: [
    { raceId: '2024-legacy-race', candidateId: 'legacy-candidate', data: { buckets: { history: [{ body: 'legacy' }] } } },
    { raceId: '2026-GA-senate-class-2', candidateId: 'fec-S6CA00001', data: { buckets: { history: [{ body: 'canonical' }] } } },
  ],
  contestMetrics: [
    { id: 'legacy-metric', raceId: '2024-legacy-race', data: { value: 2024 } },
    { id: 'canonical-metric', raceId: '2026-GA-senate-class-2', data: { value: 2026 } },
  ],
  overrides: { schemaVersion: 1, candidateOverrides: [], contestDispositions: [] },
});
assert.equal(catalogOnlyFixture.documents.some((document) => document.path.includes('2024-')), false, 'historical source documents never enter the active v2 namespace');
assert.equal(catalogOnlyFixture.excludedSourceDocuments.candidateResearch.nonCanonicalRace, 1, 'historical research is reported as coverage information');
assert.equal(catalogOnlyFixture.excludedSourceDocuments.contestMetrics.nonCanonicalRace, 1, 'historical metrics are reported as coverage information');

console.log('canonical publication builder tracer test passed');
