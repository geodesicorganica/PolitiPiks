import { SourcePayload } from '../schema.js';
import {
  CANONICAL_2026_FEDERAL_CONTESTS,
  canonicalFederalContestId,
  isValidFecHouseDistrict,
  normalizeFecFederalCandidate,
} from '../federalRegistry.js';
import { normDistrictKey } from './medslCommon.js';

const FEC_API = 'https://api.open.fec.gov/v1';

export { isValidFecHouseDistrict } from '../federalRegistry.js';

type FecCandidate = {
  candidate_id: string;
  name: string;
  party_full?: string;
  state?: string;
  district?: string;
  office?: 'S' | 'H' | 'P';
  incumbent_challenge?: 'I' | 'C' | 'O' | null;
  candidate_status?: string;
  candidate_inactive?: boolean;
};

async function fetchAllCandidates(office: 'S' | 'H', electionYear: number, apiKey: string, states: string[], scope: 'funded' | 'all-filed'): Promise<FecCandidate[]> {
  const results: FecCandidate[] = [];
  const stateParams = states.map((state) => `&state=${state}`).join('');
  let page = 1;
  let pages = 1;
  do {
    const scopeParams = scope === 'funded' ? '&candidate_status=C&has_raised_funds=true' : '';
    const url = `${FEC_API}/candidates/?election_year=${electionYear}&office=${office}${scopeParams}&per_page=100&page=${page}${stateParams}&api_key=${apiKey}`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (response.status === 429) throw new Error('FEC API rate limit hit (429). Use a real FEC_API_KEY instead of DEMO_KEY.');
    if (!response.ok) throw new Error(`FEC API ${response.status} for office=${office} page=${page}`);
    const json = await response.json() as { results: FecCandidate[]; pagination: { pages: number } };
    results.push(...json.results);
    pages = json.pagination?.pages ?? 1;
    page += 1;
  } while (page <= pages);
  return results;
}

/**
 * The registry, rather than filings, creates voting federal seats. FEC only
 * attaches finance filers to those seats and never promotes them to a ballot
 * verified or pick-eligible candidate.
 */
export async function loadFecFederalContests(): Promise<SourcePayload> {
  const apiKey = process.env.FEC_API_KEY ?? 'DEMO_KEY';
  const electionYear = Number(process.env.FEC_ELECTION_YEAR ?? '2026');
  if (electionYear !== 2026) throw new Error('The canonical federal registry currently supports election year 2026 only.');
  const candidateScope = (process.env.FEC_CANDIDATE_SCOPE ?? 'funded').toLowerCase();
  if (candidateScope !== 'funded' && candidateScope !== 'all-filed') throw new Error(`Invalid FEC_CANDIDATE_SCOPE: ${candidateScope}`);
  const stateFilter = (process.env.FEC_STATES ?? '').split(',').map((state) => state.trim().toUpperCase()).filter(Boolean);
  const refreshedAt = new Date().toISOString();
  const [senate, house] = await Promise.all([
    fetchAllCandidates('S', electionYear, apiKey, stateFilter, candidateScope),
    fetchAllCandidates('H', electionYear, apiKey, stateFilter, candidateScope),
  ]);

  const byRace = new Map(CANONICAL_2026_FEDERAL_CONTESTS
    .filter((contest) => stateFilter.length === 0 || stateFilter.includes(contest.state))
    .map((contest) => [contest.id, { ...contest, candidates: [] as SourcePayload['races'][number]['candidates'] }]));
  let invalidHouseFilings = 0;

  for (const fec of [...senate, ...house]) {
    const state = (fec.state ?? '').toUpperCase();
    if (!state || state.length !== 2) continue;
    let district: string | null = null;
    if (fec.office === 'H') {
      district = normDistrictKey(fec.district);
      if (!isValidFecHouseDistrict(state, district)) {
        invalidHouseFilings += 1;
        continue;
      }
    }
    const raceId = canonicalFederalContestId(fec.office === 'S' ? 'S' : 'H', state, district);
    const race = raceId ? byRace.get(raceId) : undefined;
    if (!race) continue;
    const candidate = { ...normalizeFecFederalCandidate(fec), lastRefreshedAt: refreshedAt, refreshStatus: 'fresh' as const };
    if (!race.candidates.some((existing) => existing.id === candidate.id)) race.candidates.push(candidate);
  }

  if (invalidHouseFilings > 0) console.warn(`Skipped ${invalidHouseFilings} FEC House filing records with invalid state/district combinations.`);
  return {
    races: Array.from(byRace.values()).map((race) => ({ ...race, lastRefreshedAt: refreshedAt, refreshStatus: 'fresh' as const })),
    ballotMeasures: [],
  };
}
