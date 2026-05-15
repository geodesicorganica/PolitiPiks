import { Candidate, CandidateActivity, DataSource, Race, VoteRecord } from '../types';

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'congress-gov',
    label: 'Congress.gov',
    kind: 'official',
    baseUrl: 'https://api.congress.gov',
    supports: ['bills', 'votes', 'candidates'],
  },
  {
    id: 'house-clerk',
    label: 'House Clerk Roll Call XML',
    kind: 'official',
    baseUrl: 'https://clerk.house.gov',
    supports: ['votes'],
  },
  {
    id: 'senate-roll-call',
    label: 'U.S. Senate Roll Call Votes',
    kind: 'official',
    baseUrl: 'https://www.senate.gov',
    supports: ['votes'],
  },
  {
    id: 'open-states',
    label: 'Open States / Plural',
    kind: 'aggregator',
    baseUrl: 'https://v3.openstates.org',
    supports: ['candidates', 'bills', 'votes', 'activities'],
  },
  {
    id: 'gemini',
    label: 'Gemini enrichment',
    kind: 'ai',
    supports: ['activities'],
  },
];

const isOfficialVote = (vote: NonNullable<Candidate['keyVotes']>[number]) =>
  vote.vote === 'Yea' || vote.vote === 'Nay' || vote.vote === 'Present';

export const isLegislativeOffice = (race?: Pick<Race, 'office'> | null) =>
  race?.office === 'Senate' || race?.office === 'House';

export function normalizeCandidateRecords(candidate: Candidate, race?: Pick<Race, 'office'> | null): Candidate {
  const legacyVotes = candidate.keyVotes || [];
  const candidateId = candidate.id;

  const votes: VoteRecord[] = candidate.votes || legacyVotes
    .filter(isOfficialVote)
    .map((vote, index) => ({
      id: `${candidateId}-vote-${index}`,
      candidateId,
      bill: vote.bill,
      vote: vote.vote as VoteRecord['vote'],
      impact: vote.impact,
      url: vote.url,
      date: vote.date || '1970-01-01',
      source: isLegislativeOffice(race) ? 'seed-migrated' : 'legacy-migrated',
      sourceUrl: vote.url,
      verificationLevel: isLegislativeOffice(race) ? 'derived' : 'seed',
      refreshStatus: 'stale',
    }));

  const activities: CandidateActivity[] = candidate.activities || legacyVotes
    .filter((vote) => !isOfficialVote(vote))
    .map((vote, index) => ({
      id: `${candidateId}-activity-${index}`,
      candidateId,
      type: 'public_position',
      title: vote.bill,
      stance: vote.vote as CandidateActivity['stance'],
      impact: vote.impact,
      url: vote.url,
      date: vote.date,
      source: 'seed-migrated',
      sourceUrl: vote.url,
      verificationLevel: 'derived',
      refreshStatus: 'stale',
    }));

  return {
    ...candidate,
    votes,
    activities,
  };
}

export function sortVotesRecentFirst(votes: VoteRecord[] = []) {
  return [...votes].sort((a, b) => {
    const bTime = Date.parse(b.date);
    const aTime = Date.parse(a.date);
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

export function sortActivitiesRecentFirst(activities: CandidateActivity[] = []) {
  return [...activities].sort((a, b) => {
    const bTime = b.date ? Date.parse(b.date) : 0;
    const aTime = a.date ? Date.parse(a.date) : 0;
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}
