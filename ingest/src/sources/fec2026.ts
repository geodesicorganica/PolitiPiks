import { SourcePayload } from '../schema.js';
import { normParty, slugId, normDistrictKey, electionDayFor } from './medslCommon.js';

/**
 * Loads upcoming-cycle federal contests (Senate + House) from the FEC API.
 * Free key: https://api.data.gov/signup/ (DEMO_KEY works for smoke tests but is
 * heavily rate-limited).
 *
 * Filters to statutory candidates (candidate_status=C) who have raised funds,
 * which removes most joke/placeholder filings. Race IDs follow the existing
 * convention: 2026-GA-senate, 2026-TX-house-012, 2026-AK-house-al.
 *
 * Env:
 *   FEC_API_KEY        — api.data.gov key (default DEMO_KEY)
 *   FEC_ELECTION_YEAR  — default 2026
 *   FEC_STATES         — optional comma list (e.g. "GA,TX") to limit states
 */

const FEC_API = 'https://api.open.fec.gov/v1';

type FecCandidate = {
  candidate_id: string;
  name: string;
  party_full?: string;
  state?: string;
  district?: string;
  office?: 'S' | 'H' | 'P';
  incumbent_challenge?: 'I' | 'C' | 'O' | null;
  candidate_status?: string;
};

const NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V', 'JR.', 'SR.']);

/** FEC names come as "LAST, FIRST MIDDLE SUFFIX" — flip to display order. */
export function displayNameFromFec(fecName: string): string {
  const commaIdx = fecName.indexOf(',');
  if (commaIdx === -1) return fecName.trim();
  const last = fecName.slice(0, commaIdx).trim();
  const restTokens = fecName.slice(commaIdx + 1).trim().split(/\s+/).filter(Boolean);
  const suffixes = restTokens.filter((t) => NAME_SUFFIXES.has(t.toUpperCase()));
  const given = restTokens.filter((t) => !NAME_SUFFIXES.has(t.toUpperCase()));
  return [...given, last, ...suffixes].join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchAllCandidates(office: 'S' | 'H', electionYear: number, apiKey: string, states: string[]): Promise<FecCandidate[]> {
  const results: FecCandidate[] = [];
  const stateParams = states.map((s) => `&state=${s}`).join('');
  let page = 1;
  let pages = 1;
  do {
    const url = `${FEC_API}/candidates/?election_year=${electionYear}&office=${office}&candidate_status=C&has_raised_funds=true&per_page=100&page=${page}${stateParams}&api_key=${apiKey}`;
    const resp = await fetch(url, { headers: { accept: 'application/json' } });
    if (resp.status === 429) throw new Error('FEC API rate limit hit (429). Use a real FEC_API_KEY instead of DEMO_KEY.');
    if (!resp.ok) throw new Error(`FEC API ${resp.status} for office=${office} page=${page}`);
    const json = (await resp.json()) as { results: FecCandidate[]; pagination: { pages: number } };
    results.push(...json.results);
    pages = json.pagination?.pages ?? 1;
    page += 1;
  } while (page <= pages);
  return results;
}

export async function loadFecFederalContests(): Promise<SourcePayload> {
  const apiKey = process.env.FEC_API_KEY ?? 'DEMO_KEY';
  const electionYear = Number(process.env.FEC_ELECTION_YEAR ?? '2026');
  const stateFilter = (process.env.FEC_STATES ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const closeDate = electionDayFor(electionYear);

  const [senate, house] = await Promise.all([
    fetchAllCandidates('S', electionYear, apiKey, stateFilter),
    fetchAllCandidates('H', electionYear, apiKey, stateFilter),
  ]);

  const byRace = new Map<string, { state: string; office: 'Senate' | 'House'; district: string | null; candidates: SourcePayload['races'][number]['candidates'] }>();

  for (const fec of [...senate, ...house]) {
    const state = (fec.state ?? '').toUpperCase();
    if (!state || state.length !== 2) continue;
    if (stateFilter.length > 0 && !stateFilter.includes(state)) continue;
    const office = fec.office === 'S' ? 'Senate' : 'House';
    let district: string | null = null;
    if (office === 'House') {
      district = normDistrictKey(fec.district);
      if (!district) continue; // unparseable district; skip rather than guess an at-large seat
    }
    const raceId = office === 'Senate'
      ? `${electionYear}-${state}-senate`
      : `${electionYear}-${state}-house-${district!.toLowerCase()}`;

    const name = displayNameFromFec(fec.name);
    const party = normParty(fec.party_full ?? '');
    const entry = byRace.get(raceId) ?? { state, office, district, candidates: [] };
    const candidateId = slugId(`${name}-${party}`);
    if (!entry.candidates.some((c) => c.id === candidateId)) {
      entry.candidates.push({
        id: candidateId,
        name,
        party,
        ...(fec.incumbent_challenge === 'I' ? { incumbent: true } : {}),
        externalIds: { fecCandidateId: fec.candidate_id },
      });
    }
    byRace.set(raceId, entry);
  }

  const races: SourcePayload['races'] = [];
  for (const [raceId, entry] of byRace.entries()) {
    if (entry.candidates.length === 0) continue;
    races.push({
      id: raceId,
      state: entry.state,
      office: entry.office,
      district: entry.district,
      electionYear,
      mode: 'live',
      status: 'upcoming',
      closeDate,
      candidates: entry.candidates,
    });
  }

  return { races, ballotMeasures: [] };
}
