import { createHash } from 'node:crypto';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import { ACS_CVAP_VARIABLE, censusDistrictToCanonical, censusStateToAbbreviation } from './historicalCvapDepth.js';

export const CENSUS_STATE_FIPS: Readonly<Record<string, string>> = Object.freeze({
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
});
export const CENSUS_2024_DISTRICT_HEADER = ['NAME', ACS_CVAP_VARIABLE, 'congressional district', 'state'] as const;
export const CENSUS_STATE_HEADER = ['NAME', ACS_CVAP_VARIABLE, 'state'] as const;
export type CensusDistrictShard = { state: string; fips: string; sourceUrl: string };
export type CensusDistrictRow = { state: string; district: string; cvapEstimate: number };
export type CensusDistrictValidation = { rows: CensusDistrictRow[]; ignoredNonDistrictRows: number };
export type CensusFailureReceipt = { schemaVersion: 2; state: string; sourceUrl: string; status: number | null; contentType: string | null; location: string | null; responseDigest: string; prefix: string; bodyArtifact?: string; createdAt: string };
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const noSecrets = (value: string) => value.replace(/([?&](?:key|api[_-]?key|token)=)[^&]*/gi, '$1***');

export function censusDistrictShardUrl(fips: string): string {
  if (!/^(?:0[1-9]|[1-5][0-9])$/.test(fips) || !Object.values(CENSUS_STATE_FIPS).includes(fips)) throw new Error(`unsupported Census state FIPS: ${fips}`);
  const url = new URL('https://api.census.gov/data/2024/acs/acs5');
  url.searchParams.set('get', `NAME,${ACS_CVAP_VARIABLE}`);
  url.searchParams.set('for', 'congressional district:*');
  url.searchParams.set('in', `state:${fips}`);
  return url.toString();
}
export function censusDistrictShards(): CensusDistrictShard[] { return Object.entries(CENSUS_STATE_FIPS).map(([state, fips]) => ({ state, fips, sourceUrl: censusDistrictShardUrl(fips) })).sort((a, b) => a.state.localeCompare(b.state)); }
export function expectedCanonicalDistricts(state: string): string[] { return CANONICAL_2026_FEDERAL_CONTESTS.filter((race) => race.office === 'House' && race.state === state).map((race) => race.district).filter((district): district is string => Boolean(district)).sort(); }
export function versionedCensusFailureReceiptName(state: string, existingNames: readonly string[]): string { if (!/^[A-Z]{2}$/.test(state)) throw new Error('invalid Census failure receipt state'); for (let version = 2; version < 10_000; version += 1) { const name = `census-failure-${state}-v${version}.json`; if (!existingNames.includes(name)) return name; } throw new Error('Census failure receipt versions exhausted'); }
export function sanitizeCensusUrl(value: string): string { const url = new URL(value); if (url.protocol !== 'https:' || url.hostname !== 'api.census.gov' || url.username || url.password) throw new Error('unsupported Census URL'); return noSecrets(url.toString()); }
export function censusFailureReceipt(input: { state: string; sourceUrl: string; status: number | null; contentType: string | null; location?: string | null; body: Buffer; bodyArtifact?: string; createdAt: string }): CensusFailureReceipt {
  if (!/^[A-Z]{2}$/.test(input.state) || !Number.isFinite(Date.parse(input.createdAt))) throw new Error('invalid Census failure receipt');
  const prefix = input.body.subarray(0, 160).toString('utf8').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().replace(/([?&](?:key|api[_-]?key|token)=)[^&\s]*/gi, '$1***');
  if (input.bodyArtifact !== undefined && (!/^census-response-[A-Z]{2}-v\d+\.json$/.test(input.bodyArtifact) || input.bodyArtifact.includes('key'))) throw new Error('invalid Census failure body artifact');
  return { schemaVersion: 2, state: input.state, sourceUrl: sanitizeCensusUrl(input.sourceUrl), status: input.status, contentType: input.contentType?.trim() || null, location: input.location ?? null, responseDigest: digest(input.body), prefix, ...(input.bodyArtifact ? { bodyArtifact: input.bodyArtifact } : {}), createdAt: input.createdAt };
}
function exactHeaderBinding(value: unknown, required: readonly string[], label: string): Record<string, number> {
  if (!Array.isArray(value) || value.length !== required.length || value.some((column) => typeof column !== 'string')) throw new Error(`unexpected Census ${label} header`);
  const header = value as string[]; if (new Set(header).size !== header.length || new Set(required).size !== required.length || header.some((column) => !required.includes(column)) || required.some((column) => !header.includes(column))) throw new Error(`unexpected Census ${label} header`);
  return Object.fromEntries(header.map((column, index) => [column, index]));
}
export function validateCensusRedirect(input: { sourceUrl: string; location: string | null; requestedFips: string; redirectCount: number }): string {
  if (input.redirectCount !== 1) throw new Error('Census redirect chain rejected');
  const source = new URL(input.sourceUrl); if (source.protocol !== 'https:' || source.hostname !== 'api.census.gov' || source.username || source.password || source.hash) throw new Error('invalid Census redirect source');
  if (!input.location) throw new Error('Census redirect missing Location');
  const destination = new URL(input.location, source);
  if (destination.protocol !== 'https:' || destination.hostname !== 'api.census.gov' || destination.username || destination.password || destination.hash) throw new Error('unsafe Census redirect destination');
  if (destination.pathname !== '/data/2024/acs/acs5') throw new Error('Census redirect dataset path changed');
  const allowed = new Set(['get', 'for', 'in']); const params = [...destination.searchParams.entries()];
  if (params.length !== 3 || params.some(([key]) => !allowed.has(key)) || new Set(params.map(([key]) => key)).size !== 3) throw new Error('Census redirect query changed');
  if (destination.searchParams.get('get') !== `NAME,${ACS_CVAP_VARIABLE}` || destination.searchParams.get('for') !== 'congressional district:*' || destination.searchParams.get('in') !== `state:${input.requestedFips}`) throw new Error('Census redirect geography or variable changed');
  return destination.toString();
}
export function validateCensusDistrictGeometry(state: string, rows: CensusDistrictRow[]): CensusDistrictRow[] { const expected = expectedCanonicalDistricts(state); const actual = rows.map((row) => row.district).sort(); if (actual.length !== expected.length || actual.some((district, index) => district !== expected[index])) throw new Error('incomplete or extra canonical Census district geometry'); return rows.sort((a, b) => `${a.state}|${a.district}`.localeCompare(`${b.state}|${b.district}`)); }
export function validateCensusDistrictResponse(input: { requestedState: string; requestedFips: string; status: number; redirected: boolean; contentType: string | null; body: Buffer }): CensusDistrictValidation {
  const expectedState = CENSUS_STATE_FIPS[input.requestedState]; if (!expectedState || expectedState !== input.requestedFips) throw new Error('requested Census state/FIPS mismatch');
  if (input.status !== 200) throw new Error(`Census HTTP ${input.status}`); if (input.redirected) throw new Error('Census redirect rejected'); if (!/^application\/json(?:;|$)/i.test(input.contentType ?? '')) throw new Error('Census JSON content type required'); if (input.body.toString('utf8').trimStart().charAt(0) !== '[') throw new Error('Census JSON array required');
  let value: unknown; try { value = JSON.parse(input.body.toString('utf8')); } catch { throw new Error('malformed Census JSON'); }
  if (!Array.isArray(value) || value.length < 2) throw new Error('unexpected Census district header');
  const columns = exactHeaderBinding(value[0], CENSUS_2024_DISTRICT_HEADER, 'district');
  const expected = new Set(expectedCanonicalDistricts(input.requestedState)); const rows: CensusDistrictRow[] = []; const identities = new Set<string>(); let ignoredNonDistrictRows = 0;
  for (const row of value.slice(1)) { if (!Array.isArray(row) || row.length !== CENSUS_2024_DISTRICT_HEADER.length) throw new Error('malformed Census district record'); const cvap = row[columns[ACS_CVAP_VARIABLE]!]; const districtCode = String(row[columns['congressional district']!] ?? ''); const fips = row[columns.state!]; if (typeof fips !== 'string' || fips !== input.requestedFips) throw new Error('Census district response state mismatch'); const state = censusStateToAbbreviation(fips); if (!state || state !== input.requestedState) throw new Error('malformed Census district geography'); if (districtCode === 'ZZ') { ignoredNonDistrictRows += 1; continue; } const canonicalDistrict = districtCode === '00' ? 'AL' : /^(?:0[1-9]|[1-9]\d)$/.test(districtCode) ? censusDistrictToCanonical(districtCode) : null; const estimate = Number(cvap); if (!canonicalDistrict || !expected.has(canonicalDistrict)) throw new Error('malformed Census district geography'); if (!Number.isFinite(estimate) || estimate <= 0) throw new Error('invalid Census CVAP estimate'); const key = `${state}|${canonicalDistrict}`; if (identities.has(key)) throw new Error('duplicate Census district geography'); identities.add(key); rows.push({ state, district: canonicalDistrict, cvapEstimate: estimate }); }
  return { rows: validateCensusDistrictGeometry(input.requestedState, rows), ignoredNonDistrictRows };
}
export type CensusStateValidation = { rows: Array<{ state: string; cvapEstimate: number }>; excludedJurisdictions: Array<{ fips: '11' | '72'; name: string }> };
export function validateCensusStateResponse(input: { status: number; redirected: boolean; contentType: string | null; body: Buffer }): CensusStateValidation {
  if (input.status !== 200) throw new Error(`Census HTTP ${input.status}`); if (input.redirected) throw new Error('Census redirect rejected'); if (!/^application\/json(?:;|$)/i.test(input.contentType ?? '')) throw new Error('Census JSON content type required'); if (input.body.toString('utf8').trimStart().charAt(0) !== '[') throw new Error('Census JSON array required');
  let value: unknown; try { value = JSON.parse(input.body.toString('utf8')); } catch { throw new Error('malformed Census JSON'); }
  if (!Array.isArray(value) || value.length < 2) throw new Error('unexpected Census state header'); const columns = exactHeaderBinding(value[0], CENSUS_STATE_HEADER, 'state');
  const states = new Set<string>(); const fipsValues = new Set<string>(); const rows: Array<{ state: string; cvapEstimate: number }> = []; const excludedJurisdictions: Array<{ fips: '11' | '72'; name: string }> = [];
  for (const row of value.slice(1)) {
    if (!Array.isArray(row) || row.length !== CENSUS_STATE_HEADER.length) throw new Error('malformed Census state record');
    const fips = String(row[columns.state!] ?? ''); const estimate = Number(row[columns[ACS_CVAP_VARIABLE]!]); const name = String(row[columns.NAME] ?? '');
    if (!/^\d{2}$/.test(fips)) throw new Error('unsupported Census statewide jurisdiction');
    if (fipsValues.has(fips)) throw new Error('duplicate Census state geography'); fipsValues.add(fips);
    if (!Number.isFinite(estimate) || estimate <= 0) throw new Error('invalid Census state CVAP estimate');
    if (fips === '11' || fips === '72') { excludedJurisdictions.push({ fips, name }); continue; }
    const state = censusStateToAbbreviation(fips); if (!state || !Object.prototype.hasOwnProperty.call(CENSUS_STATE_FIPS, state)) throw new Error('unsupported Census statewide jurisdiction');
    if (states.has(state)) throw new Error('duplicate Census state geography'); states.add(state); rows.push({ state, cvapEstimate: estimate });
  }
  const expectedStates = Object.keys(CENSUS_STATE_FIPS).sort(); const actualStates = [...states].sort();
  if (actualStates.length !== expectedStates.length || actualStates.some((state, index) => state !== expectedStates[index])) throw new Error('incomplete canonical Census state geometry');
  return { rows: rows.sort((a, b) => a.state.localeCompare(b.state)), excludedJurisdictions: excludedJurisdictions.sort((a, b) => a.fips.localeCompare(b.fips)) };
}
