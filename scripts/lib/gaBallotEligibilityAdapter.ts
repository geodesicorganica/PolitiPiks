import { parseOfficialBallotSource, type OfficialBallotSourceInput } from './ballotEligibility.js';

export const GEORGIA_2026_GENERAL_SOURCE_URL = 'https://sos.ga.gov/candidate-qualifying-elected-office';

/**
 * The SOS qualifying page is an authority for filing/qualification process, not a final November ballot.
 * Until an official general-election candidate list is published, this adapter returns no candidate records.
 */
export async function fetchGeorgia2026GeneralBallotSource(fetchImpl: typeof fetch = fetch, now = new Date()): Promise<OfficialBallotSourceInput> {
  const response = await fetchImpl(GEORGIA_2026_GENERAL_SOURCE_URL, { headers: { accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`Georgia ballot authority request failed: ${response.status}`);
  const body = await response.text();
  if (!/2026/i.test(body) || !/qualifying/i.test(body)) throw new Error('Georgia ballot authority response is not the expected qualifying page');
  const observedAt = now.toISOString();
  return parseOfficialBallotSource({ schemaVersion: 1, electionYear: 2026, state: 'GA', election: 'general', sourceStatus: 'not_yet_published',
    sourceAuthority: 'Georgia Secretary of State Elections Division', sourceUrl: GEORGIA_2026_GENERAL_SOURCE_URL, retrievedAt: observedAt, reviewedAt: observedAt, records: [] });
}
