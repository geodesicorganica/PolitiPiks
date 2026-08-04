import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ACTIVE_ELECTION_MODE, ACTIVE_ELECTION_YEAR, formatCloseAt, isPickClosed } from '../lib/electionCycle';
import { selectContestCatalog } from '../lib/contestCatalog';
import type { BallotMeasure, Race } from '../types';
import { RACE_2024_SANDBOX_FIXTURE } from './fixtures';
import { CanonicalEvidencePanels } from '../components/CanonicalEvidencePanels';
import { candidatePickIsEligible, measurePickIsEligible, racePickUnavailableReason } from '../lib/predictionEligibility';

const openCloseAt = Timestamp.fromDate(new Date('2026-11-03T20:00:00Z'));
const closedCloseAt = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
const base = { state: 'California', office: 'Senate' as const, candidates: [], eligibleCandidateIds: [], status: 'upcoming' as const, closeAt: openCloseAt, closeDate: '2026-11-03T20:00:00Z', electionYear: 2026, mode: 'live' as const };
const canonicalCandidate = { id: 'fec-canonical', name: 'Canonical Candidate', party: 'Democrat' as const };
const ballotVerifiedCandidate = { id: 'fec-ballot-verified', name: 'Ballot Verified Candidate', party: 'Democrat' as const, qualificationStatus: 'on_ballot' as const, pickEligibility: 'eligible' as const };
const races: Race[] = [
  { ...base, id: '2026-CA-senate' },
  { ...base, id: '2026-CA-senate-class-1', predictionReady: false, catalogScope: 'federal', registryGeneration: 'canonical-2026-shadow-v2', candidates: [canonicalCandidate] },
  { ...base, id: '2026-GA-senate-class-2', state: 'Georgia', predictionReady: false, catalogScope: 'federal', registryGeneration: 'canonical-2026-shadow-v2', candidates: [ballotVerifiedCandidate], eligibleCandidateIds: [] },
  { ...base, id: '2026-VA-house-001', state: 'Virginia', office: 'House', district: '001', predictionReady: true, catalogScope: 'federal', registryGeneration: 'canonical-2026-shadow-v2', candidates: [ballotVerifiedCandidate], eligibleCandidateIds: ['fec-ballot-verified'] },
  { ...base, id: '2026-CA-governor', office: 'Governor' },
  { ...base, id: 'browser-closed-2026', state: 'Closed State', closeAt: closedCloseAt, closeDate: '2026-01-01T00:00:00Z' },
  RACE_2024_SANDBOX_FIXTURE,
];
const measures: BallotMeasure[] = [{
  id: 'browser-measure-2026', state: 'California', title: 'Measure', description: 'Fixture measure', status: 'upcoming', closeAt: openCloseAt,
  closeDate: '2026-11-03T20:00:00Z', electionYear: 2026, mode: 'live', qualificationStatus: 'on_ballot', sourceAuthority: 'California Secretary of State', sourceUrl: 'https://www.sos.ca.gov/elections/ballot-measures', predictionReady: true, eligibleOptions: ['yes', 'no'],
}, { id: 'browser-measure-catalog-only', state: 'Texas', title: 'Catalog only measure', description: 'Fixture measure', status: 'upcoming', closeAt: openCloseAt, closeDate: '2026-11-03T20:00:00Z', electionYear: 2026, mode: 'live', qualificationStatus: 'filed', sourceAuthority: 'Official fixture', predictionReady: false, eligibleOptions: [] }];

const provenance = { sourceId: 'official-fixture', sourceUrl: 'https://www.fec.gov/data/candidate/H0CA00001/', retrievedAt: '2026-07-31T00:00:00Z', sourceVintage: '2026-Q2', methodology: 'Official source fixture using the certified product contract.' };
const richResearch = { baselineResearch: { fields: { identity: { availability: 'present', value: { fecCandidateId: 'H0CA00001' }, ...provenance }, filing: { availability: 'present', value: { fecCandidateId: 'H0CA00001' }, ...provenance } } }, fecFinance: { availability: 'present', cycle: 2026, filingPeriod: '2026-06-30', values: { totalReceipts: 1_250_000, totalDisbursements: 800_000, cashOnHand: 450_000, debtsOwed: 0 }, ...provenance }, congressDepth: { availability: 'present', bioguideId: 'A000001', profile: { officialName: 'Canonical Candidate', chamber: 'House', state: 'CA', sourceUrl: 'https://api.congress.gov/v3/member/A000001', retrievedAt: '2026-07-31T00:00:00Z' }, sponsored: [{ identifier: 'HR 1', title: 'Official Example Act', sourceUrl: 'https://api.congress.gov/v3/bill/119/hr/1' }], cosponsored: [], votes: [{ chamber: 'House', rollNumber: 1, date: '2026-01-01', title: 'Official example roll call', result: 'Passed', vote: 'Yea', sourceUrl: 'https://clerk.house.gov/Votes/20261' }], methodology: 'Official Congress.gov and House Clerk records.' } };
const richMetrics = { historical: { availability: 'present', electionYear: 2024, totalVotes: 328_805, marginPct: -2.5, ...provenance }, turnout: { availability: 'present', electionYear: 2024, turnoutProxy: 0.61, votes: 328_805, cvapEstimate: 538_816, ...provenance }, demographics: { availability: 'present', cvapEstimate: 538_816, geography: 'congressional-district', estimateVintage: 2024, ...provenance } };

export function ActiveCycleBrowserHarness() {
  const [picked, setPicked] = useState<string | null>(null);
  const catalog = selectContestCatalog({ races, measures, activation: { state: 'active', activeFederalGeneration: 'canonical-2026-shadow-v2' } });
  if (catalog.status !== 'ready') return <main role="alert">Catalog unavailable</main>;
  const activeTargets = catalog.races.filter((target) => target.electionYear === ACTIVE_ELECTION_YEAR && target.mode === ACTIVE_ELECTION_MODE);
  return <main><h1>2026 Live Races</h1><p>Picks lock before Election Day under the current league safety policy.</p>{activeTargets.map((target) => {
    const closed = isPickClosed(target);
    const candidate = target.candidates[0];
    const picksAvailable = !candidate || candidatePickIsEligible(target, candidate);
    return <article key={target.id} data-testid={`race-${target.id}`}><h2>{target.state}</h2><p>{closed ? 'Picking closed' : 'Pick by'}: {formatCloseAt(target)}</p>
      {!picksAvailable && <p data-testid={`picks-unavailable-${target.id}`}>{racePickUnavailableReason(target)}</p>}
      {candidate ? <button data-testid={`pick-${candidate.id}`} disabled={closed || !picksAvailable} onClick={() => setPicked(candidate.id)}>{closed ? 'Picking closed' : !picksAvailable ? 'Picks unavailable' : picked === candidate.id ? 'Pick recorded' : 'Make pick'}</button> : <button disabled={closed}>{closed ? 'Picking closed' : 'Make pick'}</button>}
      {target.id === '2026-CA-senate-class-1' && <CanonicalEvidencePanels research={richResearch} metrics={richMetrics} />}
    </article>;
  })}<section data-testid="unavailable-evidence"><CanonicalEvidencePanels research={{ baselineResearch: { fields: { identity: { availability: 'unavailable', reason: 'Official identity source pending.' } } }, fecFinance: { availability: 'unavailable', reason: 'FEC totals are unavailable.' }, congressDepth: { availability: 'not_applicable', methodology: 'No reviewed Bioguide mapping.' } }} metrics={{ historical: { availability: 'unavailable', reason: 'No comparable return.' }, turnout: { availability: 'unavailable', reason: 'No comparable turnout proxy.' }, demographics: { availability: 'source_error', reason: 'Official source could not be validated.' } }} /></section>{catalog.measures.map((measure) => { const available = measure.eligibleOptions?.some((option) => measurePickIsEligible(measure, option)) === true; return <article key={measure.id} data-testid={`measure-${measure.id}`}><h2>{measure.title}</h2><p data-testid={`measure-source-${measure.id}`}>{measure.sourceAuthority} · {measure.qualificationStatus}</p><p>Choices: {(measure.eligibleOptions ?? []).join(' / ') || 'Not yet published'}</p>{measure.sourceUrl && <a href={measure.sourceUrl}>Official measure source</a>}{!available && <p data-testid={`picks-unavailable-${measure.id}`}>Picks unavailable</p>}<button data-testid={`pick-measure-${measure.id}`} disabled={!available || isPickClosed(measure)} onClick={() => setPicked(measure.id)}>{!available ? 'Picks unavailable' : picked === measure.id ? 'Pick recorded' : 'Make pick'}</button></article>; })}</main>;
}
