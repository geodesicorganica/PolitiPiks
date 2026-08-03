import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../ingest/src/federalRegistry.js';
import { candidateName, candidateParty, forEachZipCsvBuffer, isNonCandidateChoice, isWriteIn, mode as rowMode, normDistrictKey, normParty, office as rowOffice, district as rowDistrict, parseMedslDelimited, parseVotes, type Row } from '../ingest/src/sources/medslCommon.js';
import { buildCongressResearchPlan, validateCongressDepthSnapshot } from './lib/congressDepth.js';
import { validateCanonicalPublicationSnapshot } from './lib/canonicalPublication.js';
import { validateFecBulkFinanceSnapshot } from './lib/fecBulkFinance.js';
import { getCanonical2026HistoricalPlan, type PartyTotals } from './lib/contestMetrics.js';
import { ACS_CVAP_VARIABLE, CENSUS_2020_STATE_URL, CENSUS_2022_STATE_URL, CENSUS_2024_STATE_URL, FEC_GA_2020_RUNOFF, MEDSL_SENATE_FILENAME, MEDSL_SENATE_METADATA_URL, buildHistoricalCvapCheckpoint, buildHistoricalCvapPlan, buildHistoricalCvapSnapshot, censusDistrictToCanonical, censusStateToAbbreviation, historicalCvapDigest, officialHouseSourceUrl, type CvapFact, type HistoricalCvapCheckpoint, type HistoricalFact } from './lib/historicalCvapDepth.js';
import { censusDistrictShards, censusFailureReceipt, validateCensusDistrictGeometry, validateCensusDistrictResponse, validateCensusStateResponse, versionedCensusFailureReceiptName } from './lib/historicalCvapCensus.js';
import { parseHistoricalCvapArgs } from './lib/historicalCvapCaptureCli.js';
import { censusTransportUrl, loadCensusApiKey, sanitizeCensusLocation } from './lib/historicalCvapCensusTransport.js';

type Json = Record<string, unknown>;
const root = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const writeExclusive = (path: string, content: string) => { mkdirSync(root, { recursive: true }); writeFileSync(path, content, { flag: 'wx' }); };
const checkpointPath = (directory: string, key: string) => resolve(directory, `${key.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`);
const noKeyUrl = (url: string) => { if (/[?&](?:key|api[_-]?key|token)=/i.test(url)) throw new Error('secret-bearing source URL rejected'); return url; };
const ledgerPath = () => resolve(root, 'g6-4-census-request-ledger.jsonl');
const writeFailureReceipt = (directory: string, receipt: unknown) => { const state = (receipt as { state: string }).state; const name = versionedCensusFailureReceiptName(state, readdirSync(directory)); writeExclusive(resolve(directory, name), `${JSON.stringify(receipt, null, 2)}\n`); return name; };
const writeFailureBody = (directory: string, state: string, body: Buffer) => { const existing = readdirSync(directory); for (let version = 2; version < 10_000; version += 1) { const name = `census-response-${state}-v${version}.json`; if (!existing.includes(name)) { writeExclusive(resolve(directory, name), body.toString('utf8')); return name; } } throw new Error('Census failure-body versions exhausted'); };
const appendLedger = (value: unknown) => appendFileSync(ledgerPath(), `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'a' });
const RECOVERED_2024_STATE_DIGEST = 'd36f1915d45bd9d68f0f7d63207f8e8a38fbf5b63de711818528a0aaa2f0f3a9';

function totalKey(state: string, district: string) { return `${state}|${district}`; }
function addTotals(map: Map<string, PartyTotals>, key: string, party: string, votes: number) { const entry = map.get(key) ?? { dem: 0, rep: 0, total: 0 }; if (party === 'Democrat') entry.dem += votes; if (party === 'Republican') entry.rep += votes; entry.total += votes; map.set(key, entry); }
async function houseTotals(buffer: Buffer, state: string) {
  const totalModes = new Set<string>(); const rows: Array<{ key: string; party: string; votes: number; total: boolean }> = []; let rawRows = 0;
  await forEachZipCsvBuffer(buffer, (row: Row) => { rawRows += 1; if (rowOffice(row) !== 'US HOUSE') return; const name = candidateName(row); if (!name || isWriteIn(row) || isNonCandidateChoice(name)) return; const district = normDistrictKey(rowDistrict(row)) ?? (rowDistrict(row).toUpperCase() === 'STATEWIDE' ? 'AL' : null); if (!district) return; const key = totalKey(state, district); const total = rowMode(row) === 'TOTAL'; if (total) totalModes.add(key); rows.push({ key, party: normParty(candidateParty(row)), votes: parseVotes(row['votes'] || ''), total }); });
  const totals = new Map<string, PartyTotals>(); for (const row of rows) if (!totalModes.has(row.key) || row.total) addTotals(totals, row.key, row.party, row.votes);
  return { rawRows, totals: [...totals.entries()].map(([key, value]) => ({ key, ...value })).sort((a, b) => a.key.localeCompare(b.key)) };
}
function senateTotals(contents: string) {
  const parsed = parseMedslDelimited(contents, '\t');
  const regular = new Map<string, PartyTotals>(); const special = new Map<string, PartyTotals>(); const totals = new Map<string, number>(); let rawRows = 0;
  for (const row of parsed) { rawRows += 1; const year = Number(text(row.year)); if (year !== 2020 && year !== 2022 || text(row.stage).toLowerCase() !== 'gen' || text(row.unofficial).toUpperCase() === 'TRUE') continue; const state = text(row.state_po).toUpperCase(); if (!/^[A-Z]{2}$/.test(state)) throw new Error('malformed MEDSL Senate state'); const specialElection = text(row.special).toUpperCase() === 'TRUE'; const key = `${year}|${state}|${specialElection ? 'special' : 'regular'}`; const map = specialElection ? special : regular; addTotals(map, key, normParty(candidateParty(row)), parseVotes(row.candidatevotes || '')); const reported = parseVotes(row.totalvotes || ''); totals.set(key, Math.max(totals.get(key) ?? 0, reported)); }
  for (const [key, entry] of [...regular, ...special]) entry.total = totals.get(key) ?? entry.dem + entry.rep;
  regular.set('2020|GA|regular', { ...FEC_GA_2020_RUNOFF });
  return { rawRows, regular: [...regular.entries()].map(([key, value]) => ({ key, ...value })).sort((a,b) => a.key.localeCompare(b.key)), special: [...special.entries()].map(([key, value]) => ({ key, ...value })).sort((a,b) => a.key.localeCompare(b.key)) };
}
function censusRows(contents: string, geography: 'congressional-district' | 'state') {
  const body = JSON.parse(contents) as unknown; if (!Array.isArray(body) || body.length < 2 || !Array.isArray(body[0])) throw new Error('malformed Census response'); const header = body[0].map(text); const cvap = header.indexOf(ACS_CVAP_VARIABLE); const state = header.indexOf('state'); const district = header.indexOf('congressional district'); if (cvap < 0 || state < 0 || (geography === 'congressional-district' && district < 0)) throw new Error('unexpected Census CVAP schema'); const output: Array<{ state: string; district: string | null; cvapEstimate: number }> = [];
  for (const raw of body.slice(1)) {
    if (!Array.isArray(raw)) throw new Error('malformed Census record');
    const po = censusStateToAbbreviation(text(raw[state]));
    const canonicalDistrict = geography === 'congressional-district' ? censusDistrictToCanonical(text(raw[district])) : null;
    // The all-CD endpoint includes territory and non-district rows. They are
    // outside the canonical voting-contest registry, not a matchable fallback.
    if (!po || (geography === 'congressional-district' && !canonicalDistrict)) continue;
    const estimate = Number(text(raw[cvap]));
    if (!Number.isFinite(estimate) || estimate <= 0) throw new Error('malformed Census CVAP record');
    output.push({ state: po, district: canonicalDistrict, cvapEstimate: estimate });
  }
  if (new Set(output.map((row) => totalKey(row.state, row.district ?? 'STATE'))).size !== output.length) throw new Error('duplicate Census CVAP geography'); return output.sort((a,b) => totalKey(a.state, a.district ?? 'STATE').localeCompare(totalKey(b.state, b.district ?? 'STATE')));
}

function recoverSaved2024StateCheckpoint(directory: string, sourceUrl: string): void {
  const key = 'census-2024-state-cvap'; const destination = checkpointPath(directory, key);
  if (existsSync(destination)) return;
  const receiptPath = resolve(directory, 'census-failure-US-v2.json'); const bodyPath = resolve(directory, 'census-response-US-v2.json');
  if (!existsSync(receiptPath) || !existsSync(bodyPath) || !existsSync(ledgerPath())) throw new Error('saved 2024 Census statewide recovery evidence is absent');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as { sourceUrl?: unknown; status?: unknown; contentType?: unknown; location?: unknown; responseDigest?: unknown; bodyArtifact?: unknown; createdAt?: unknown };
  const body = readFileSync(bodyPath); const responseDigest = hash(body);
  if (responseDigest !== RECOVERED_2024_STATE_DIGEST || receipt.responseDigest !== RECOVERED_2024_STATE_DIGEST || receipt.bodyArtifact !== 'census-response-US-v2.json' || receipt.sourceUrl !== sourceUrl || receipt.status !== 200 || receipt.location !== null || !/^application\/json(?:;|$)/i.test(String(receipt.contentType ?? ''))) throw new Error('saved 2024 Census statewide receipt evidence mismatch');
  const ledger = readFileSync(ledgerPath(), 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  const ledgerMatch = ledger.find((entry) => entry.sourceKey === key && entry.state === 'US' && entry.sourceUrl === sourceUrl && entry.status === 200 && entry.location === null && entry.responseDigest === RECOVERED_2024_STATE_DIGEST && /^application\/json(?:;|$)/i.test(String(entry.contentType ?? '')));
  if (!ledgerMatch) throw new Error('saved 2024 Census statewide ledger evidence mismatch');
  noKeyUrl(sourceUrl); const payload = validateCensusStateResponse({ status: 200, redirected: false, contentType: String(receipt.contentType), body });
  const checkpoint = buildHistoricalCvapCheckpoint({ sourceKey: key, sourceUrl, retrievedAt: String(receipt.createdAt), responseDigest, payload });
  writeExclusive(destination, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

async function main() {
  const options = parseHistoricalCvapArgs(process.argv.slice(2));
  const publication = validateCanonicalPublicationSnapshot(JSON.parse(readFileSync(options.publicationSnapshot, 'utf8')));
  const finance = validateFecBulkFinanceSnapshot(JSON.parse(readFileSync(options.financeSnapshot, 'utf8')));
  const congress = validateCongressDepthSnapshot(JSON.parse(readFileSync(options.congressSnapshot, 'utf8')));
  if (finance.capture.sourceSnapshotInputDigest !== publication.inputDigest || congress.publicationInputDigest !== publication.inputDigest || congress.financeInputDigest !== finance.inputDigest) throw new Error('source snapshots are not a certified G6.2/G6.3 chain');
  if (options.snapshotIn) {
    const snapshot = JSON.parse(readFileSync(options.snapshotIn, 'utf8')); const first = buildHistoricalCvapPlan(publication, finance, congress, snapshot); const second = buildHistoricalCvapPlan(publication, finance, congress, snapshot); if (options.verifyReplay && JSON.stringify(first) !== JSON.stringify(second)) throw new Error('nondeterministic historical/CVAP replay');
    console.log(JSON.stringify({ operation: 'offline-historical-cvap-replay', dryRun: true, firebaseInitialized: false, httpCalls: 0, snapshotDigest: first.historicalCvapDigest, sourceDigest: first.sourceDigest, inputDigest: first.inputDigest, evidenceDigest: first.evidenceDigest, planDigest: first.planDigest, coverage: first.historicalCvapCoverage, audit: first.audit }, null, 2)); return;
  }
  const houseStates = [...new Set(CANONICAL_2026_FEDERAL_CONTESTS.filter((race) => race.office === 'House').map((race) => race.state))].sort();
  const shards = censusDistrictShards();
  const preserved = [...houseStates.flatMap((state) => [
    { key: `house-2024-${state}`, sourceUrl: officialHouseSourceUrl(state, 2024) },
    { key: `house-2022-${state}`, sourceUrl: officialHouseSourceUrl(state, 2022) },
  ]), { key: 'senate-metadata', sourceUrl: MEDSL_SENATE_METADATA_URL }];
  const checkpointDirectory = options.checkpointDir!;
  const preservedCheckpoint = <T>(key: string, sourceUrl: string): T => {
    const path = checkpointPath(checkpointDirectory, key);
    if (!existsSync(path)) throw new Error(`required preserved checkpoint is absent: ${key}`);
    const saved = JSON.parse(readFileSync(path, 'utf8')) as HistoricalCvapCheckpoint;
    if (saved.sourceUrl !== sourceUrl) throw new Error(`checkpoint source mismatch: ${key}`);
    const valid = buildHistoricalCvapCheckpoint({ sourceKey: saved.sourceKey, sourceUrl: saved.sourceUrl, retrievedAt: saved.retrievedAt, responseDigest: saved.responseDigest, payload: saved.payload });
    if (valid.digest !== saved.digest) throw new Error(`checkpoint digest mismatch: ${key}`);
    return valid.payload as T;
  };
  const metadata = preservedCheckpoint<{ fileId: number }>('senate-metadata', MEDSL_SENATE_METADATA_URL);
  const senateUrl = `https://dataverse.harvard.edu/api/access/datafile/${metadata.fileId}?format=original`;
  preserved.push({ key: 'senate-results', sourceUrl: senateUrl });
  if (!options.resume) throw new Error('G6.4R requires --resume to protect preserved checkpoints');
  if (preserved.length !== 102 || new Set(preserved.map((item) => item.key)).size !== 102) throw new Error('expected exactly 102 preserved checkpoints');
  for (const item of preserved) preservedCheckpoint(item.key, item.sourceUrl);
  recoverSaved2024StateCheckpoint(checkpointDirectory, CENSUS_2024_STATE_URL);
  const existingDistrictCheckpoints = readdirSync(checkpointDirectory).filter((name) => /^census-2024-cd-[A-Z]{2}\.json$/.test(name)).sort(); const existingStateCheckpoints = readdirSync(checkpointDirectory).filter((name) => /^census-20(?:20|22|24)-state-cvap\.json$/.test(name)).sort(); const nextShard = shards.find((shard) => !existingDistrictCheckpoints.includes(`census-2024-cd-${shard.state}.json`)); const newSources = [...shards.map((item) => item.sourceUrl), CENSUS_2024_STATE_URL, CENSUS_2022_STATE_URL, CENSUS_2020_STATE_URL];
  const censusKey = loadCensusApiKey();
  if (options.preflight) { console.log(JSON.stringify({ operation: 'historical-cvap-keyed-preflight', dryRun: true, CENSUS_API_KEY_PRESENT: censusKey.present, checkpointDir: checkpointDirectory, snapshotOut: options.snapshotOut, finalSnapshotAbsent: !existsSync(options.snapshotOut!), pathsPrivateAndIgnored: true, successfulCheckpoints: 102 + existingDistrictCheckpoints.length + existingStateCheckpoints.length, historicalCheckpoints: 102, censusDistrictCheckpoints: existingDistrictCheckpoints.length, censusStateCheckpoints: existingStateCheckpoints.length, nextState: nextShard?.state ?? null, plannedRemainingSources: (nextShard ? shards.length - existingDistrictCheckpoints.length : 0) + (3 - existingStateCheckpoints.length), newCallCap: options.maxCalls, sourceUrls: newSources, firebaseInitialized: false, fecApiCalls: 0, httpCalls: 0 }, null, 2)); return; }
  if (options.diagnostic) throw new Error('redirect diagnostic is retired; keyed Census requests must be direct');
  if (!censusKey.present || !process.env.CENSUS_API_KEY) throw new Error('CENSUS_API_KEY is required before Census network access');
  const apiKey = process.env.CENSUS_API_KEY;
  mkdirSync(checkpointDirectory, { recursive: true }); let calls = 0; const sources: Array<{ sourceKey: string; sourceUrl: string; responseDigest: string; retrievedAt: string }> = [];
  const reuse = <T>(key: string, sourceUrl: string): T => { const saved = preservedCheckpoint<T>(key, sourceUrl); const checkpoint = JSON.parse(readFileSync(checkpointPath(checkpointDirectory, key), 'utf8')) as HistoricalCvapCheckpoint; sources.push({ sourceKey: checkpoint.sourceKey, sourceUrl: checkpoint.sourceUrl, responseDigest: checkpoint.responseDigest, retrievedAt: checkpoint.retrievedAt }); return saved; };
  const captureCensus = async <T>(key: string, state: string, sourceUrl: string, normalize: (response: Response, body: Buffer) => T): Promise<T> => {
    const path = checkpointPath(checkpointDirectory, key);
    if (existsSync(path)) return reuse<T>(key, sourceUrl);
    if (calls >= options.maxCalls) throw new Error(`new Census call budget exhausted at ${calls}/${options.maxCalls}`);
    calls += 1; let response: Response | undefined; let body = Buffer.alloc(0);
    try { response = await fetch(censusTransportUrl(noKeyUrl(sourceUrl), apiKey), { redirect: 'manual' }); body = Buffer.from(await response.arrayBuffer()); const location = sanitizeCensusLocation(response.headers.get('location')); appendLedger({ operation: 'census-keyed-direct-capture', sourceKey: key, state, sourceUrl, attempt: calls, status: response.status, contentType: response.headers.get('content-type'), location, responseDigest: hash(body), requestedAt: new Date().toISOString() }); const payload = normalize(response, body); const saved = buildHistoricalCvapCheckpoint({ sourceKey: key, sourceUrl, retrievedAt: new Date().toISOString(), responseDigest: hash(body), payload }); writeExclusive(path, `${JSON.stringify(saved, null, 2)}\n`); sources.push({ sourceKey: saved.sourceKey, sourceUrl: saved.sourceUrl, responseDigest: saved.responseDigest, retrievedAt: saved.retrievedAt }); return payload; } catch (error) { const location = sanitizeCensusLocation(response?.headers.get('location') ?? null); const bodyArtifact = response?.status === 200 && body.length ? writeFailureBody(checkpointDirectory, state, body) : undefined; const receipt = censusFailureReceipt({ state, sourceUrl, status: response?.status ?? null, contentType: response?.headers.get('content-type') ?? null, location, body, createdAt: new Date().toISOString(), bodyArtifact }); const receiptName = writeFailureReceipt(checkpointDirectory, receipt); const detail = response ? (error instanceof Error ? error.message : 'Census response validation failed') : 'Census transport request failed'; throw new Error(`Census ${state} failed; receipt=${receiptName}: ${detail}`); }
  };
  const house2024 = new Map<string, PartyTotals>(); const house2022 = new Map<string, PartyTotals>(); let rawHouseRows = 0;
  for (const state of houseStates) for (const year of [2024, 2022] as const) { const data = reuse<{ rawRows: number; totals: Array<{ key: string; dem: number; rep: number; total: number }> }>(`house-${year}-${state}`, officialHouseSourceUrl(state, year)); rawHouseRows += data.rawRows; for (const row of data.totals) (year === 2024 ? house2024 : house2022).set(row.key, { dem: row.dem, rep: row.rep, total: row.total }); }
  const senate = reuse<{ rawRows: number; regular: Array<{ key: string; dem: number; rep: number; total: number }>; special: Array<{ key: string; dem: number; rep: number; total: number }> }>('senate-results', senateUrl);
  const regular = new Map(senate.regular.map((row) => [row.key, { dem: row.dem, rep: row.rep, total: row.total }]));
  const special = new Map(senate.special.map((row) => [row.key, { dem: row.dem, rep: row.rep, total: row.total }]));
  const directShards = shards;
  const districtCvap = new Map<string, number>(); const ignoredDistrictRowsByState = new Map<string, number>();
  for (const shard of directShards) {
    const captured = await captureCensus(`census-2024-cd-${shard.state}`, shard.state, shard.sourceUrl, (response, body) => validateCensusDistrictResponse({ requestedState: shard.state, requestedFips: shard.fips, status: response.status, redirected: response.redirected, contentType: response.headers.get('content-type'), body }));
    const result = Array.isArray(captured) ? { rows: validateCensusDistrictGeometry(shard.state, captured), ignoredNonDistrictRows: 0 } : captured;
    for (const row of result.rows) districtCvap.set(totalKey(row.state, row.district), row.cvapEstimate); if (result.ignoredNonDistrictRows) ignoredDistrictRowsByState.set(shard.state, result.ignoredNonDistrictRows);
  }
  const stateCvap = new Map<number, Map<string, number>>(); const ignoredStateRows = new Map<string, { fips: '11' | '72'; name: string }>();
  for (const [year, url] of [[2024, CENSUS_2024_STATE_URL], [2022, CENSUS_2022_STATE_URL], [2020, CENSUS_2020_STATE_URL]] as const) {
    const captured = await captureCensus(`census-${year}-state-cvap`, 'US', url, (response, body) => validateCensusStateResponse({ status: response.status, redirected: response.redirected, contentType: response.headers.get('content-type'), body }));
    const result: { rows: Array<{ state: string; cvapEstimate: number }>; excludedJurisdictions: Array<{ fips: '11' | '72'; name: string }> } = Array.isArray(captured) ? { rows: captured as Array<{ state: string; cvapEstimate: number }>, excludedJurisdictions: [] } : captured;
    for (const item of result.excludedJurisdictions) ignoredStateRows.set(item.fips, item);
    stateCvap.set(year, new Map(result.rows.map((row) => [row.state, row.cvapEstimate])));
  }
  const historical: HistoricalFact[] = []; const cvap: CvapFact[] = [];
  for (const race of CANONICAL_2026_FEDERAL_CONTESTS) { const plan = getCanonical2026HistoricalPlan(race); if (!plan) throw new Error(`unrecognized canonical historical plan: ${race.id}`); let votes: PartyTotals | undefined; let sourceUrl: string; if (race.office === 'House') { const key = totalKey(race.state, race.district!); votes = house2024.get(key); sourceUrl = officialHouseSourceUrl(race.state, 2024); } else if (race.id.endsWith('special-class-3')) { votes = special.get(`2022|${race.state}|special`); sourceUrl = senateUrl; } else { votes = regular.get(`2020|${race.state}|regular`); sourceUrl = race.state === 'GA' ? 'https://www.fec.gov/resources/cms-content/documents/federalelections2020.pdf' : senateUrl; }
    const retrievedAt = sources.find((source) => source.sourceUrl === sourceUrl)?.retrievedAt ?? new Date().toISOString(); const historicalFact: HistoricalFact = votes && votes.total > 0 ? { raceId: race.id, availability: 'present', electionYear: plan.historicalElectionYear, demVotes: votes.dem, repVotes: votes.rep, totalVotes: votes.total, sourceUrl, retrievedAt, methodology: race.office === 'House' ? 'MEDSL curated official general-election returns aggregated only at the canonical district.' : race.state === 'GA' ? 'Certified FEC 2020 Georgia Senate runoff override.' : 'MEDSL curated official statewide general-election returns for the canonical same-seat contest.' } : { raceId: race.id, availability: 'unavailable', electionYear: plan.historicalElectionYear, sourceUrl, retrievedAt, methodology: 'No safely matched official same-seat historical return was published in this snapshot.', reason: 'missing_comparable_official_return' }; historical.push(historicalFact);
    const estimateVintage = race.office === 'House' ? 2024 : plan.turnoutElectionYear; const geography = race.office === 'House' ? 'congressional-district' as const : 'state' as const; const estimate = race.office === 'House' ? districtCvap.get(totalKey(race.state, race.district!)) : stateCvap.get(estimateVintage)?.get(race.state); const censusUrl = race.office === 'House' ? directShards.find((shard) => shard.state === race.state)!.sourceUrl : estimateVintage === 2020 ? CENSUS_2020_STATE_URL : estimateVintage === 2022 ? CENSUS_2022_STATE_URL : CENSUS_2024_STATE_URL; const censusRetrievedAt = sources.find((source) => source.sourceUrl === censusUrl)?.retrievedAt ?? new Date().toISOString(); cvap.push(estimate ? { raceId: race.id, availability: 'present', geography, state: race.state, district: race.office === 'House' ? race.district : null, estimateVintage, congressVintage: race.office === 'House' ? 119 : null, variable: ACS_CVAP_VARIABLE, cvapEstimate: estimate, sourceUrl: censusUrl, retrievedAt: censusRetrievedAt, methodology: 'Census ACS 5-year B29001_001E citizen voting-age population estimate; never voting-age population.' } : { raceId: race.id, availability: 'unavailable', geography, state: race.state, district: race.office === 'House' ? race.district : null, estimateVintage, congressVintage: race.office === 'House' ? 119 : null, variable: ACS_CVAP_VARIABLE, sourceUrl: censusUrl, retrievedAt: censusRetrievedAt, methodology: 'Census ACS CVAP estimate was not available for this canonical geography.', reason: 'missing_acs_cvap_geography' });
  }
  const capturedAt = new Date().toISOString(); const snapshot = buildHistoricalCvapSnapshot({ capturedAt, publicationInputDigest: publication.inputDigest, financeInputDigest: finance.inputDigest, congressInputDigest: congress.inputDigest, requestCount: calls, maxCalls: options.maxCalls, provenance: { methodology: 'Firebase-free, source-backed historical margin, votes/CVAP context, and ACS CVAP capture.', sources, rawHouseRows, rawSenateRows: senate.rawRows, ignoredRows: 0, ignoredCensusDistrictRowsByState: [...ignoredDistrictRowsByState.entries()].map(([state, count]) => ({ state, count })), ignoredCensusStateRows: [...ignoredStateRows.values()] }, historical, cvap }); const first = buildHistoricalCvapPlan(publication, finance, congress, snapshot); const second = buildHistoricalCvapPlan(publication, finance, congress, snapshot); if (options.verifyReplay && JSON.stringify(first) !== JSON.stringify(second)) throw new Error('nondeterministic historical/CVAP capture replay'); writeExclusive(options.snapshotOut!, `${JSON.stringify(snapshot, null, 2)}\n`); console.log(JSON.stringify({ operation: 'official-historical-cvap-capture', firebaseInitialized: false, fecApiCalls: 0, httpCalls: calls, snapshotDigest: snapshot.inputDigest, sourceDigest: snapshot.sourceDigest, inputDigest: first.inputDigest, evidenceDigest: first.evidenceDigest, planDigest: first.planDigest, coverage: first.historicalCvapCoverage, ignoredCensusDistrictRowsByState: snapshot.provenance.ignoredCensusDistrictRowsByState, ignoredCensusStateRows: snapshot.provenance.ignoredCensusStateRows, audit: first.audit }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
