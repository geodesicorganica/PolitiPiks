import { Timestamp } from 'firebase/firestore';
import { ACTIVE_ELECTION_MODE, ACTIVE_ELECTION_YEAR, formatCloseAt, isPickClosed } from '../lib/electionCycle';
import type { Race } from '../types';
import { RACE_2024_SANDBOX_FIXTURE } from './fixtures';

const targets: Race[] = [
  { id: 'browser-open-2026', state: 'Open State', office: 'Senate', candidates: [], status: 'upcoming', closeAt: Timestamp.fromDate(new Date('2026-11-03T20:00:00Z')), closeDate: '2026-11-03T20:00:00Z', electionYear: 2026, mode: 'live' },
  { id: 'browser-closed-2026', state: 'Closed State', office: 'Governor', candidates: [], status: 'upcoming', closeAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')), closeDate: '2026-01-01T00:00:00Z', electionYear: 2026, mode: 'live' },
  { id: 'browser-missing-close-at-2026', state: 'Deadline Pending State', office: 'House', candidates: [], status: 'upcoming', closeDate: '2026-11-03T20:00:00Z', electionYear: 2026, mode: 'live' },
  RACE_2024_SANDBOX_FIXTURE,
];

export function ActiveCycleBrowserHarness() {
  const activeTargets = targets.filter((target) => target.electionYear === ACTIVE_ELECTION_YEAR && target.mode === ACTIVE_ELECTION_MODE);
  return <main><h1>2026 Live Races</h1>{activeTargets.map((target) => {
    const closed = isPickClosed(target);
    return <article key={target.id} data-testid={`race-${target.id}`}><h2>{target.state}</h2><p>{closed ? 'Picking closed' : 'Pick by'}: {formatCloseAt(target)}</p><button disabled={closed}>{closed ? 'Picking closed' : 'Make pick'}</button></article>;
  })}</main>;
}
