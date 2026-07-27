import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ACTIVE_ELECTION_MODE, ACTIVE_ELECTION_YEAR, formatCloseAt, isPickClosed } from '../lib/electionCycle';
import { selectContestCatalog } from '../lib/contestCatalog';
import type { BallotMeasure, Race } from '../types';
import { RACE_2024_SANDBOX_FIXTURE } from './fixtures';

const openCloseAt = Timestamp.fromDate(new Date('2026-11-03T20:00:00Z'));
const closedCloseAt = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
const base = { state: 'California', office: 'Senate' as const, candidates: [], eligibleCandidateIds: [], status: 'upcoming' as const, closeAt: openCloseAt, closeDate: '2026-11-03T20:00:00Z', electionYear: 2026, mode: 'live' as const };
const canonicalCandidate = { id: 'fec-canonical', name: 'Canonical Candidate', party: 'Democrat' as const };
const ballotVerifiedCandidate = { id: 'fec-ballot-verified', name: 'Ballot Verified Candidate', party: 'Democrat' as const, qualificationStatus: 'on_ballot' as const, pickEligibility: 'eligible' as const };
const races: Race[] = [
  { ...base, id: '2026-CA-senate' },
  { ...base, id: '2026-CA-senate-class-1', catalogScope: 'federal', registryGeneration: 'canonical-2026-shadow-v2', candidates: [canonicalCandidate] },
  { ...base, id: '2026-GA-senate-class-2', state: 'Georgia', catalogScope: 'federal', registryGeneration: 'canonical-2026-shadow-v2', candidates: [ballotVerifiedCandidate], eligibleCandidateIds: ['fec-ballot-verified'] },
  { ...base, id: '2026-CA-governor', office: 'Governor' },
  { ...base, id: 'browser-closed-2026', state: 'Closed State', closeAt: closedCloseAt, closeDate: '2026-01-01T00:00:00Z' },
  RACE_2024_SANDBOX_FIXTURE,
];
const measures: BallotMeasure[] = [{
  id: 'browser-measure-2026', state: 'California', title: 'Measure', description: 'Fixture measure', status: 'upcoming', closeAt: openCloseAt,
  closeDate: '2026-11-03T20:00:00Z', electionYear: 2026, mode: 'live',
}];

export function ActiveCycleBrowserHarness() {
  const [picked, setPicked] = useState<string | null>(null);
  const catalog = selectContestCatalog({ races, measures, activation: { state: 'active', activeFederalGeneration: 'canonical-2026-shadow-v2' } });
  if (catalog.status !== 'ready') return <main role="alert">Catalog unavailable</main>;
  const activeTargets = catalog.races.filter((target) => target.electionYear === ACTIVE_ELECTION_YEAR && target.mode === ACTIVE_ELECTION_MODE);
  return <main><h1>2026 Live Races</h1><p>Picks lock before Election Day under the current league safety policy.</p>{activeTargets.map((target) => {
    const closed = isPickClosed(target);
    const candidate = target.candidates[0];
    const picksAvailable = !candidate || target.eligibleCandidateIds?.includes(candidate.id) === true;
    return <article key={target.id} data-testid={`race-${target.id}`}><h2>{target.state}</h2><p>{closed ? 'Picking closed' : 'Pick by'}: {formatCloseAt(target)}</p>
      {!picksAvailable && <p data-testid={`picks-unavailable-${target.id}`}>Picks not yet available</p>}
      {candidate ? <button data-testid={`pick-${candidate.id}`} disabled={closed || !picksAvailable} onClick={() => setPicked(candidate.id)}>{closed ? 'Picking closed' : !picksAvailable ? 'Picks not yet available' : picked === candidate.id ? 'Pick recorded' : 'Make pick'}</button> : <button disabled={closed}>{closed ? 'Picking closed' : 'Make pick'}</button>}
      {target.id === '2026-CA-senate-class-1' && <><p data-testid="canonical-research">Canonical research available</p><p data-testid="canonical-metrics">Metrics available</p></>}
    </article>;
  })}{catalog.measures.map((measure) => <article key={measure.id} data-testid={`measure-${measure.id}`}><h2>{measure.title}</h2></article>)}</main>;
}
