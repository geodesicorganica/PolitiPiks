export type CivicLookupResult = {
  status?: string;
  election: { id?: string; name?: string; electionDay?: string } | null;
  otherElections: Array<{ id?: string; name?: string; electionDay?: string; ocdDivisionId?: string }>;
  contests: Array<{
    type?: string;
    primaryParty?: string;
    ballotTitle?: string;
    office?: string;
    level?: string[];
    roles?: string[];
    district?: { name?: string; scope?: string; id?: string };
    numberElected?: number;
    numberVotingFor?: number;
    referendumTitle?: string;
    referendumSubtitle?: string;
    referendumUrl?: string;
    referendumBrief?: string;
    referendumText?: string;
    referendumProStatement?: string;
    referendumConStatement?: string;
    candidates: Array<{
      name?: string;
      party?: string;
      candidateUrl?: string;
      phone?: string;
      email?: string;
      channels?: unknown[];
    }>;
    sources?: unknown[];
  }>;
  pollingLocations: Array<{ address?: unknown; pollingHours?: string; notes?: string; sources?: unknown }>;
  earlyVoteSites: Array<{ address?: unknown; pollingHours?: string; notes?: string; sources?: unknown }>;
  dropOffLocations: Array<{ address?: unknown; pollingHours?: string; notes?: string; sources?: unknown }>;
  stateElectionAdministrationBodies: unknown[];
  normalizedInput: unknown;
  mailOnly?: boolean;
};

export async function lookupCivicVoterInfo(params: {
  address: string;
  electionId?: string;
  officialSourcesOnly?: boolean;
  apiKey: string;
}): Promise<CivicLookupResult> {
  const query = new URLSearchParams({
    address: params.address,
    key: params.apiKey,
    returnAllAvailableData: 'true',
    officialOnly: params.officialSourcesOnly === false ? 'false' : 'true',
  });
  if (params.electionId) query.set('electionId', params.electionId);
  const response = await fetch(`https://www.googleapis.com/civicinfo/v2/voterinfo?${query}`);
  if (response.status === 400 || response.status === 404) {
    const body = await response.text();
    throw new Error(`Civic Information lookup rejected the address/election: ${body.slice(0, 400)}`);
  }
  if (!response.ok) throw new Error(`Civic Information API ${response.status}`);
  const data = await response.json() as any;
  return {
    status: data.status,
    election: data.election ?? null,
    otherElections: data.otherElections ?? [],
    contests: (data.contests ?? []).map((contest: any) => ({
      type: contest.type,
      primaryParty: contest.primaryParty,
      ballotTitle: contest.ballotTitle,
      office: contest.office,
      level: contest.level,
      roles: contest.roles,
      district: contest.district,
      numberElected: contest.numberElected,
      numberVotingFor: contest.numberVotingFor,
      referendumTitle: contest.referendumTitle,
      referendumSubtitle: contest.referendumSubtitle,
      referendumUrl: contest.referendumUrl,
      referendumBrief: contest.referendumBrief,
      referendumText: contest.referendumText,
      referendumProStatement: contest.referendumProStatement,
      referendumConStatement: contest.referendumConStatement,
      candidates: (contest.candidates ?? []).map((candidate: any) => ({
        name: candidate.name,
        party: candidate.party,
        candidateUrl: candidate.candidateUrl,
        phone: candidate.phone,
        email: candidate.email,
        channels: candidate.channels,
      })),
      sources: contest.sources,
    })),
    pollingLocations: data.pollingLocations ?? [],
    earlyVoteSites: data.earlyVoteSites ?? [],
    dropOffLocations: data.dropOffLocations ?? [],
    stateElectionAdministrationBodies: (data.state ?? []).map((state: any) => state.electionAdministrationBody).filter(Boolean),
    normalizedInput: data.normalizedInput ?? null,
    mailOnly: data.mailOnly,
  };
}

export async function listCivicElections(apiKey: string) {
  const response = await fetch(`https://www.googleapis.com/civicinfo/v2/elections?key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`Civic Information API ${response.status}`);
  const data = await response.json() as { elections?: Array<{ id?: string; name?: string; electionDay?: string; ocdDivisionId?: string }> };
  return data.elections ?? [];
}
