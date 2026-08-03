import { createHash } from 'node:crypto';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import { buildCongressResearchPlan, validateCongressDepthSnapshot } from './congressDepth.js';
import { validateCanonicalPublicationSnapshot } from './canonicalPublication.js';
import { validateFecBulkFinanceSnapshot } from './fecBulkFinance.js';
import { getCanonical2026HistoricalPlan, marginPct, type PartyTotals } from './contestMetrics.js';

type Json = Record<string, unknown>;
export const ACS_CVAP_VARIABLE = 'B29001_001E';
export const FEC_GA_2020_RUNOFF: PartyTotals = { dem: 2_269_923, rep: 2_214_979, total: 4_484_902 };
export const MEDSL_2024_HOUSE_BASE = 'https://raw.githubusercontent.com/MEDSL/2024-elections-official/main';
export const MEDSL_2022_HOUSE_BASE = 'https://raw.githubusercontent.com/MEDSL/2022-elections-official/main';
export const MEDSL_SENATE_DATASET_DOI = 'doi:10.7910/DVN/PEJ5QU';
export const MEDSL_SENATE_FILENAME = '1976-2024-senate-state.tab';
export const MEDSL_SENATE_METADATA_URL = `https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=${encodeURIComponent(MEDSL_SENATE_DATASET_DOI)}`;
export function censusStateCvapUrl(year: 2020 | 2022 | 2024): string { const url = new URL(`https://api.census.gov/data/${year}/acs/acs5`); url.searchParams.set('get', `NAME,${ACS_CVAP_VARIABLE}`); url.searchParams.set('for', 'state:*'); return url.toString(); }
/** Retained only as a historical-error identifier; G6.4R uses state shards. */
export const CENSUS_2024_CD_URL = `https://api.census.gov/data/2024/acs/acs5?get=NAME,${ACS_CVAP_VARIABLE}&for=congressional%20district:*&in=state:*`;
export const CENSUS_2024_STATE_URL = censusStateCvapUrl(2024);
export const CENSUS_2022_STATE_URL = censusStateCvapUrl(2022);
export const CENSUS_2020_STATE_URL = censusStateCvapUrl(2020);

export type HistoricalAvailability = 'present' | 'unavailable';
export type HistoricalFact = { raceId: string; availability: HistoricalAvailability; electionYear: number; demVotes?: number; repVotes?: number; totalVotes?: number; sourceUrl: string; retrievedAt: string; methodology: string; reason?: string };
export type CvapFact = { raceId: string; availability: HistoricalAvailability; geography: 'congressional-district' | 'state'; state: string; district: string | null; estimateVintage: number; congressVintage: number | null; variable: typeof ACS_CVAP_VARIABLE; cvapEstimate?: number; sourceUrl: string; retrievedAt: string; methodology: string; reason?: string };
export type HistoricalCvapCheckpoint = { schemaVersion: 1; sourceKey: string; sourceUrl: string; retrievedAt: string; responseDigest: string; payload: unknown; digest: string };
export type HistoricalCvapSnapshot = { schemaVersion: 1; capturedAt: string; publicationInputDigest: string; financeInputDigest: string; congressInputDigest: string; sourceDigest: string; inputDigest: string; requestCount: number; maxCalls: number; provenance: { methodology: string; sources: Array<{ sourceKey: string; sourceUrl: string; responseDigest: string; retrievedAt: string }>; rawHouseRows: number; rawSenateRows: number; ignoredRows: number; ignoredCensusDistrictRowsByState?: Array<{ state: string; count: number }>; ignoredCensusStateRows?: Array<{ fips: '11' | '72'; name: string }> }; historical: HistoricalFact[]; cvap: CvapFact[] };

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
export const historicalCvapDigest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const ordered = <T>(items: T[], key: (item: T) => string) => [...items].sort((a, b) => key(a).localeCompare(key(b)));
const date = (value: unknown) => Boolean(text(value)) && Number.isFinite(Date.parse(text(value)));
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const noSecretUrl = (value: unknown) => /^https:\/\//.test(text(value)) && !/[?&](?:key|api[_-]?key|token)=/i.test(text(value));
const stateFips: Record<string, string> = { '01': 'AL','02': 'AK','04': 'AZ','05': 'AR','06': 'CA','08': 'CO','09': 'CT','10': 'DE','11': 'DC','12': 'FL','13': 'GA','15': 'HI','16': 'ID','17': 'IL','18': 'IN','19': 'IA','20': 'KS','21': 'KY','22': 'LA','23': 'ME','24': 'MD','25': 'MA','26': 'MI','27': 'MN','28': 'MS','29': 'MO','30': 'MT','31': 'NE','32': 'NV','33': 'NH','34': 'NJ','35': 'NM','36': 'NY','37': 'NC','38': 'ND','39': 'OH','40': 'OK','41': 'OR','42': 'PA','44': 'RI','45': 'SC','46': 'SD','47': 'TN','48': 'TX','49': 'UT','50': 'VT','51': 'VA','53': 'WA','54': 'WV','55': 'WI','56': 'WY' };

export function censusDistrictToCanonical(value: string): string | null { const cd = text(value); if (cd === '00') return 'AL'; if (/^\d{1,2}$/.test(cd) && Number(cd) > 0) return String(Number(cd)).padStart(3, '0'); return null; }
export function censusStateToAbbreviation(value: string): string | null { return stateFips[text(value)] ?? null; }
export function cvapVintageForRace(race: { id: string; office: string }): number | null { const plan = getCanonical2026HistoricalPlan(race as { id: string; office: 'House' | 'Senate' }); if (!plan) return null; return race.office === 'House' ? 2024 : plan.turnoutElectionYear; }
export function officialHouseSourceUrl(state: string, year: 2022 | 2024): string { return year === 2024 ? `${MEDSL_2024_HOUSE_BASE}/individual_states/${state.toLowerCase()}24.zip` : `${MEDSL_2022_HOUSE_BASE}/individual_states/2022-${state.toLowerCase()}-local-precinct-general.zip`; }

function finiteVote(value: unknown, field: string): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`invalid historical ${field}`); return value; }
function assertNoLeakage(value: unknown, at = 'snapshot'): void { if (Array.isArray(value)) return value.forEach((item, index) => assertNoLeakage(item, `${at}[${index}]`)); if (!isRecord(value)) return; for (const [key, child] of Object.entries(value)) { if (/(winner|post.?lock|future.?result|certified.?result|poll)/i.test(key)) throw new Error(`post-lock or winner leakage rejected: ${at}.${key}`); assertNoLeakage(child, `${at}.${key}`); } }
function validateHistoricalFact(value: unknown): asserts value is HistoricalFact { if (!isRecord(value) || !text(value.raceId) || !['present','unavailable'].includes(text(value.availability)) || !Number.isInteger(value.electionYear) || !noSecretUrl(value.sourceUrl) || !date(value.retrievedAt) || !text(value.methodology)) throw new Error('malformed historical fact'); if (value.availability === 'present') { const dem = finiteVote(value.demVotes, 'Democratic votes'); const rep = finiteVote(value.repVotes, 'Republican votes'); const total = finiteVote(value.totalVotes, 'total votes'); if (total < dem + rep || total === 0 || text(value.reason)) throw new Error('invalid present historical fact'); } else if (!text(value.reason) || value.demVotes !== undefined || value.repVotes !== undefined || value.totalVotes !== undefined) throw new Error('invalid unavailable historical fact'); }
function validateCvapFact(value: unknown): asserts value is CvapFact { if (!isRecord(value) || !text(value.raceId) || !['present','unavailable'].includes(text(value.availability)) || !['congressional-district','state'].includes(text(value.geography)) || !/^[A-Z]{2}$/.test(text(value.state)) || (value.district !== null && typeof value.district !== 'string') || !Number.isInteger(value.estimateVintage) || (value.congressVintage !== null && !Number.isInteger(value.congressVintage)) || value.variable !== ACS_CVAP_VARIABLE || !noSecretUrl(value.sourceUrl) || !date(value.retrievedAt) || !text(value.methodology)) throw new Error('malformed CVAP fact'); if (value.availability === 'present') { if (typeof value.cvapEstimate !== 'number' || !Number.isFinite(value.cvapEstimate) || value.cvapEstimate <= 0 || text(value.reason)) throw new Error('invalid present CVAP fact'); } else if (!text(value.reason) || value.cvapEstimate !== undefined) throw new Error('invalid unavailable CVAP fact'); }
export function buildHistoricalCvapCheckpoint(value: Omit<HistoricalCvapCheckpoint, 'schemaVersion' | 'digest'>): HistoricalCvapCheckpoint { if (!text(value.sourceKey) || !noSecretUrl(value.sourceUrl) || !date(value.retrievedAt) || !digest(value.responseDigest)) throw new Error('malformed historical/CVAP checkpoint'); assertNoLeakage(value.payload, `checkpoint:${value.sourceKey}`); const payload = { sourceKey: value.sourceKey, sourceUrl: value.sourceUrl, retrievedAt: value.retrievedAt, responseDigest: value.responseDigest, payload: value.payload }; return { schemaVersion: 1, ...payload, digest: historicalCvapDigest(payload) }; }
export function validateHistoricalCvapCheckpoint(value: unknown): HistoricalCvapCheckpoint { if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('unsupported historical/CVAP checkpoint version'); const checkpoint = buildHistoricalCvapCheckpoint({ sourceKey: text(value.sourceKey), sourceUrl: text(value.sourceUrl), retrievedAt: text(value.retrievedAt), responseDigest: text(value.responseDigest), payload: value.payload }); if (checkpoint.digest !== value.digest) throw new Error('historical/CVAP checkpoint digest mismatch'); return checkpoint; }

export function buildHistoricalCvapSnapshot(value: Omit<HistoricalCvapSnapshot, 'schemaVersion' | 'sourceDigest' | 'inputDigest'>): HistoricalCvapSnapshot {
  if (!date(value.capturedAt) || !digest(value.publicationInputDigest) || !digest(value.financeInputDigest) || !digest(value.congressInputDigest) || !Number.isInteger(value.requestCount) || !Number.isInteger(value.maxCalls) || value.requestCount < 0 || value.maxCalls <= 0 || value.requestCount > value.maxCalls || value.maxCalls > 200 || !isRecord(value.provenance) || !Array.isArray(value.provenance.sources) || !Array.isArray(value.historical) || !Array.isArray(value.cvap)) throw new Error('invalid historical/CVAP snapshot envelope');
  value.historical.forEach(validateHistoricalFact); value.cvap.forEach(validateCvapFact); assertNoLeakage({ historical: value.historical, cvap: value.cvap });
  const historical = ordered(value.historical, (fact) => fact.raceId); const cvap = ordered(value.cvap, (fact) => fact.raceId); const sources = ordered(value.provenance.sources.map((source) => { if (!isRecord(source) || !text(source.sourceKey) || !noSecretUrl(source.sourceUrl) || !digest(source.responseDigest) || !date(source.retrievedAt)) throw new Error('malformed historical/CVAP provenance'); return { sourceKey: text(source.sourceKey), sourceUrl: text(source.sourceUrl), responseDigest: text(source.responseDigest), retrievedAt: text(source.retrievedAt) }; }), (source) => source.sourceKey);
  const historicalIds = historical.map((fact) => fact.raceId); const cvapIds = cvap.map((fact) => fact.raceId); if (new Set(historicalIds).size !== historicalIds.length || new Set(cvapIds).size !== cvapIds.length) throw new Error('duplicate historical/CVAP race fact');
  const ignoredCensusDistrictRowsByState = ordered((value.provenance.ignoredCensusDistrictRowsByState ?? []).map((item) => { if (!isRecord(item) || !/^[A-Z]{2}$/.test(text(item.state)) || !Number.isInteger(item.count) || (item.count as number) <= 0) throw new Error('malformed ignored Census district provenance'); return { state: text(item.state), count: item.count as number }; }), (item) => item.state); if (new Set(ignoredCensusDistrictRowsByState.map((item) => item.state)).size !== ignoredCensusDistrictRowsByState.length) throw new Error('duplicate ignored Census district provenance');
  const ignoredCensusStateRows = ordered((value.provenance.ignoredCensusStateRows ?? []).map((item) => { if (!isRecord(item) || !['11', '72'].includes(text(item.fips)) || !text(item.name)) throw new Error('malformed ignored Census statewide provenance'); return { fips: text(item.fips) as '11' | '72', name: text(item.name) }; }), (item) => item.fips); if (new Set(ignoredCensusStateRows.map((item) => item.fips)).size !== ignoredCensusStateRows.length) throw new Error('duplicate ignored Census statewide provenance');
  const provenance = { methodology: text(value.provenance.methodology), sources, rawHouseRows: value.provenance.rawHouseRows, rawSenateRows: value.provenance.rawSenateRows, ignoredRows: value.provenance.ignoredRows, ignoredCensusDistrictRowsByState, ignoredCensusStateRows }; if (!provenance.methodology || ![provenance.rawHouseRows, provenance.rawSenateRows, provenance.ignoredRows].every((item) => Number.isInteger(item) && (item as number) >= 0)) throw new Error('malformed historical/CVAP provenance counts');
  const sourceDigest = historicalCvapDigest({ sources, historical, cvap }); const payload = { capturedAt: value.capturedAt, publicationInputDigest: value.publicationInputDigest, financeInputDigest: value.financeInputDigest, congressInputDigest: value.congressInputDigest, sourceDigest, requestCount: value.requestCount, maxCalls: value.maxCalls, provenance, historical, cvap };
  return { schemaVersion: 1, ...payload, inputDigest: historicalCvapDigest(payload) };
}
export function validateHistoricalCvapSnapshot(value: unknown): HistoricalCvapSnapshot { if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('unsupported historical/CVAP snapshot version'); const snapshot = buildHistoricalCvapSnapshot({ capturedAt: text(value.capturedAt), publicationInputDigest: text(value.publicationInputDigest), financeInputDigest: text(value.financeInputDigest), congressInputDigest: text(value.congressInputDigest), requestCount: value.requestCount as number, maxCalls: value.maxCalls as number, provenance: value.provenance as HistoricalCvapSnapshot['provenance'], historical: value.historical as HistoricalFact[], cvap: value.cvap as CvapFact[] }); if (snapshot.sourceDigest !== value.sourceDigest || snapshot.inputDigest !== value.inputDigest) throw new Error('historical/CVAP snapshot digest mismatch'); return snapshot; }

function availability(fact: HistoricalFact | CvapFact): Json { if (fact.availability === 'unavailable') return { availability: 'unavailable', sourceUrl: fact.sourceUrl, retrievedAt: fact.retrievedAt, methodology: fact.methodology, reason: fact.reason }; return { availability: 'present', ...fact }; }
function turnoutField(race: { id: string; office: string }, historical: HistoricalFact, cvap: CvapFact): Json {
  const plan = getCanonical2026HistoricalPlan(race as { id: string; office: 'House' | 'Senate' }); if (!plan || historical.availability === 'unavailable' || cvap.availability === 'unavailable') return { availability: 'unavailable', methodology: 'Votes/CVAP turnout proxy requires reviewed historical vote facts and matching ACS CVAP.', reason: historical.reason ?? cvap.reason ?? 'No comparable source fact.' };
  const ratio = historical.totalVotes! / cvap.cvapEstimate!; if (!Number.isFinite(ratio) || ratio > 1) return { availability: 'unavailable', electionYear: plan.turnoutElectionYear, proxy: 'votes_divided_by_acs_cvap_estimate', methodology: 'The reviewed votes/CVAP ratio was implausible and was withheld; it was not clamped.', reason: 'implausible_votes_to_cvap_ratio', votes: historical.totalVotes, cvapEstimate: cvap.cvapEstimate };
  return { availability: 'present', electionYear: plan.turnoutElectionYear, comparisonElectionYear: plan.turnoutComparisonElectionYear, proxy: 'votes_divided_by_acs_cvap_estimate', votes: historical.totalVotes, cvapEstimate: cvap.cvapEstimate, turnoutProxy: Math.round(ratio * 1000) / 1000, methodology: 'Votes divided by ACS CVAP estimate; a context proxy, not official turnout.' };
}
export function buildHistoricalCvapPlan(publicationValue: unknown, financeValue: unknown, congressValue: unknown, historicalValue: unknown) {
  const publication = validateCanonicalPublicationSnapshot(publicationValue); const finance = validateFecBulkFinanceSnapshot(financeValue); const congress = validateCongressDepthSnapshot(congressValue); const historical = validateHistoricalCvapSnapshot(historicalValue);
  if (historical.publicationInputDigest !== publication.inputDigest || historical.financeInputDigest !== finance.inputDigest || historical.congressInputDigest !== congress.inputDigest) throw new Error('historical/CVAP source digest mismatch');
  const base = buildCongressResearchPlan(publication, finance, congress); const raceIds = new Set(CANONICAL_2026_FEDERAL_CONTESTS.map((race) => race.id)); const historicalByRace = new Map(historical.historical.map((fact) => [fact.raceId, fact])); const cvapByRace = new Map(historical.cvap.map((fact) => [fact.raceId, fact]));
  if (historicalByRace.size !== 470 || cvapByRace.size !== 470 || [...historicalByRace.keys()].some((id) => !raceIds.has(id)) || [...cvapByRace.keys()].some((id) => !raceIds.has(id))) throw new Error('historical/CVAP facts must cover every canonical race exactly once');
  const documents = base.documents.map((document) => {
    const match = /^contestMetrics\/([^/]+)$/.exec(document.path);
    if (!match) return document;
    const race = CANONICAL_2026_FEDERAL_CONTESTS.find((item) => item.id === match[1]);
    if (!race) throw new Error(`orphan historical/CVAP metric: ${document.path}`);
    const h = historicalByRace.get(race.id)!;
    const c = cvapByRace.get(race.id)!;
    const historicalField = h.availability === 'present'
      ? { ...availability(h), marginPct: marginPct({ dem: h.demVotes!, rep: h.repVotes!, total: h.totalVotes! }), denominator: 'all_valid_votes' }
      : availability(h);
    const demographics = c.availability === 'present'
      ? { ...availability(c), label: 'ACS CVAP estimate', methodology: `${c.methodology} Never substitutes voting-age population.` }
      : availability(c);
    const turnout = turnoutField(race, h, c);
    const existingBaseline = isRecord(document.data.baselineMetrics) ? document.data.baselineMetrics : {};
    return {
      ...document,
      data: {
        ...document.data,
        historical: historicalField,
        turnout,
        demographics,
        baselineMetrics: {
          ...existingBaseline,
          fieldAvailability: {
            ...(isRecord(existingBaseline.fieldAvailability) ? existingBaseline.fieldAvailability : {}),
            historical: h.availability,
            turnout: text(turnout.availability) === 'present' ? 'present' : 'unavailable',
            demographicsCvap: c.availability,
          },
        },
        historicalCvap: { sourceDigest: historical.sourceDigest, methodology: 'Canonical 2026 historical-margin, votes/CVAP-proxy, and ACS CVAP snapshot.' },
      },
    };
  });
  const counts = { research: documents.filter((item) => /candidateResearch/.test(item.path)).length, measures: documents.filter((item) => item.path.startsWith('ballotMeasures/')).length, metrics: documents.filter((item) => item.path.startsWith('contestMetrics/')).length }; if (counts.research !== 2384 || counts.measures !== 14 || counts.metrics !== 470) throw new Error('G6.1 cardinality regression');
  const depth = { historical: { present: 0, unavailable: 0 }, turnout: { present: 0, unavailable: 0 }, demographicsCvap: { present: 0, unavailable: 0 } }; for (const document of documents.filter((item) => item.path.startsWith('contestMetrics/'))) { const data = document.data; for (const key of Object.keys(depth) as Array<keyof typeof depth>) { const source = key === 'demographicsCvap' ? data.demographics : data[key]; depth[key][isRecord(source) && source.availability === 'present' ? 'present' : 'unavailable'] += 1; } }
  const audit = { duplicateDocuments: new Set(documents.map((item) => item.path)).size === documents.length ? 0 : 1, orphanDocuments: 0, unresolvedReferences: 0, leakage: 0 }; const evidenceDigest = historicalCvapDigest({ congress: base.evidenceDigest, source: historical.sourceDigest, documents }); const inputDigest = historicalCvapDigest({ congress: base.inputDigest, historical: historical.inputDigest }); const planDigest = historicalCvapDigest({ documents, depth, counts, audit, evidenceDigest }); return { ...base, documents, inputDigest, evidenceDigest, planDigest, historicalCvapDigest: historical.inputDigest, sourceDigest: historical.sourceDigest, historicalCvapCoverage: { ...depth, counts }, audit: { ...base.audit, ...audit } };
}
