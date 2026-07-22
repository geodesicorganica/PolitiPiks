/**
 * build-contest-metrics.ts
 *
 * Builds real ContestMetrics for every race and writes them to the top-level
 * contestMetrics/{raceId} collection that src/lib/researchBundle.ts reads.
 *
 * Data sources (all free):
 *  - President priors/swing/turnout: county-level presidential results
 *    (tonmcg/US_County_Level_Election_Results_08-24) aggregated to state, 2020 + 2024.
 *  - Senate priors: MEDSL constituency-returns 1976-2018-senate.csv (class 1 seats
 *    contested in 2024 were last contested in 2018); 2024 totals from the MEDSL
 *    2024-elections-official statewide senate CSV.
 *  - House priors: MEDSL 2022-elections-official per-state precinct ZIPs aggregated
 *    by district.
 *  - Demographics + turnout rate: Census ACS 2023 5-year profile (requires
 *    CENSUS_API_KEY; skipped gracefully without it) and 2020 Decennial DHC for
 *    urban/rural shares.
 *
 * Units: vote shares, turnout rate/change, and demographic shares are fractions
 * (0-1) — the ResearchDrawer multiplies by 100. priorMargin, swingVsPrevious, and
 * partisanLean are Dem-positive percentage points rounded to 1 decimal, because the
 * drawer renders them raw (e.g. "+2.4").
 *
 * Usage:
 *   npm run build-contest-metrics -- [--year 2024] [--state GA] [--office Senate]
 *     [--dry-run] [--skip-house-historical] [--skip-demographics]
 * Env: PROJECT_ID / FIREBASE_SERVICE_ACCOUNT / FIRESTORE_DATABASE_ID, CENSUS_API_KEY (optional)
 */
import { FieldValue, Firestore } from '@google-cloud/firestore';
import { ContestMetrics, Race, ResearchSource } from '../src/types';
import {
  Row,
  fetchCsv,
  forEachZipCsvRow,
  mode as rowMode,
  normParty,
  normDistrictKey,
  office as rowOffice,
  district as rowDistrict,
  stateAbbrev,
  candidateName,
  candidateParty,
  parseVotes,
  isWriteIn,
  isNonCandidateChoice,
} from '../ingest/src/sources/medslCommon.js';
import { getArg, hasFlag, bootstrapFirestore } from './lib/firestoreCli.js';
import {
  buildMetricsForRace,
  DemographicsRecord,
  getHistoricalPlan,
  marginPct,
  PartyTotals,
} from './lib/contestMetrics.js';

// -----------------------------------------------------------------------------
// Static reference data
// -----------------------------------------------------------------------------

const STATE_NAME_TO_PO: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'District of Columbia': 'DC',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL',
  'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA',
  'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
  'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR',
  'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA',
  'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
};

const STATE_FIPS_TO_PO: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY',
};

const TONMCG_BASE = 'https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master';
const MEDSL_2024_BASE = 'https://raw.githubusercontent.com/MEDSL/2024-elections-official/main';
const MEDSL_2022_BASE = 'https://raw.githubusercontent.com/MEDSL/2022-elections-official/main';
const MEDSL_SENATE_DATASET_DOI = 'doi:10.7910/DVN/PEJ5QU';
const MEDSL_SENATE_FILENAME = '1976-2024-senate-state.tab';
const DATAVERSE_API = 'https://dataverse.harvard.edu/api';

const SOURCE_URLS = {
  president: 'https://github.com/tonmcg/US_County_Level_Election_Results_08-24',
  house2022: 'https://github.com/MEDSL/2022-elections-official',
  house2024: 'https://github.com/MEDSL/2024-elections-official',
  senate: 'https://doi.org/10.7910/DVN/PEJ5QU',
  senateGa2020: 'https://www.fec.gov/resources/cms-content/documents/federalelections2020.pdf',
  censusAcs: 'https://api.census.gov/data/2023/acs/acs5/profile.html',
  censusDhc: 'https://api.census.gov/data/2020/dec/dhc.html',
} as const;

// -----------------------------------------------------------------------------
// Historical results loaders
// -----------------------------------------------------------------------------

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

async function loadPresidentStateTotals(year: 2020 | 2024): Promise<Map<string, PartyTotals>> {
  const rows = await fetchCsv(`${TONMCG_BASE}/${year}_US_County_Level_Presidential_Results.csv`);
  const byState = new Map<string, PartyTotals>();
  for (const row of rows) {
    const po = STATE_NAME_TO_PO[(row['state_name'] || '').trim()];
    if (!po) continue;
    const entry = byState.get(po) ?? { dem: 0, rep: 0, total: 0 };
    entry.dem += parseVotes(row['votes_dem'] || '');
    entry.rep += parseVotes(row['votes_gop'] || '');
    entry.total += parseVotes(row['total_votes'] || '');
    byState.set(po, entry);
  }
  return byState;
}

async function loadSenateTotals(years: Set<number>): Promise<Map<number, Map<string, PartyTotals>>> {
  const byYear = new Map<number, Map<string, PartyTotals>>();
  if (years.size === 0) return byYear;

  const metadataUrl = `${DATAVERSE_API}/datasets/:persistentId/?persistentId=${encodeURIComponent(MEDSL_SENATE_DATASET_DOI)}`;
  const metadataResponse = await fetch(metadataUrl);
  if (!metadataResponse.ok) throw new Error(`Dataverse metadata fetch failed ${metadataResponse.status}`);
  const metadata = await metadataResponse.json() as {
    data?: { latestVersion?: { files?: Array<{ label?: string; dataFile?: { id?: number } }> } };
  };
  const file = metadata.data?.latestVersion?.files?.find((item) => item.label === MEDSL_SENATE_FILENAME);
  if (!file?.dataFile?.id) throw new Error(`Dataverse file not found: ${MEDSL_SENATE_FILENAME}`);

  const rows = await fetchCsv(`${DATAVERSE_API}/access/datafile/${file.dataFile.id}?format=original`);
  const totalVotes = new Map<string, number>();
  for (const row of rows) {
    const year = Number((row['year'] || '').trim());
    if (!years.has(year)) continue;
    if ((row['stage'] || '').trim().toLowerCase() !== 'gen') continue;
    if ((row['special'] || '').trim().toUpperCase() === 'TRUE') continue;
    if ((row['unofficial'] || '').trim().toUpperCase() === 'TRUE') continue;
    const po = stateAbbrev(row);
    const yearMap = byYear.get(year) ?? new Map<string, PartyTotals>();
    const entry = yearMap.get(po) ?? { dem: 0, rep: 0, total: 0 };
    const party = normParty(candidateParty(row));
    const votes = parseVotes(row['candidatevotes'] || '');
    if (party === 'Democrat') entry.dem += votes;
    if (party === 'Republican') entry.rep += votes;
    yearMap.set(po, entry);
    byYear.set(year, yearMap);
    const totalKey = `${year}|${po}`;
    const reportedTotal = parseVotes(row['totalvotes'] || '');
    if (reportedTotal > (totalVotes.get(totalKey) ?? 0)) totalVotes.set(totalKey, reportedTotal);
  }
  for (const [year, yearMap] of byYear.entries()) {
    for (const [po, entry] of yearMap.entries()) {
      entry.total = totalVotes.get(`${year}|${po}`) ?? entry.dem + entry.rep;
    }
  }

  // The MEDSL statewide file records Georgia's November 2020 general round.
  // The regular Class 2 contest was decided in the January 2021 runoff, so use
  // the FEC's certified final totals for the comparable prior election.
  if (years.has(2020)) {
    const map2020 = byYear.get(2020) ?? new Map<string, PartyTotals>();
    map2020.set('GA', { dem: 2_269_923, rep: 2_214_979, total: 4_484_902 });
    byYear.set(2020, map2020);
  }

  return byYear;
}

async function loadHouseTotals(states: Set<string>, year: 2022 | 2024): Promise<Map<string, PartyTotals>> {
  const byDistrict = new Map<string, PartyTotals>();
  for (const st of states) {
    const zipUrl = year === 2022
      ? `${MEDSL_2022_BASE}/individual_states/2022-${st.toLowerCase()}-local-precinct-general.zip`
      : `${MEDSL_2024_BASE}/individual_states/${st.toLowerCase()}24.zip`;
    const districtHasTotalMode = new Set<string>();
    const rowsAll: { key: string; party: string; votes: number; isTotal: boolean }[] = [];
    try {
      await forEachZipCsvRow(zipUrl, (row: Row) => {
        if (rowOffice(row) !== 'US HOUSE') return;
        const name = candidateName(row);
        if (!name || isWriteIn(row) || isNonCandidateChoice(name)) return;
        const dist = normDistrictKey(rowDistrict(row)) ?? (rowDistrict(row).toUpperCase() === 'STATEWIDE' ? 'AL' : null);
        if (!dist) return;
        const key = `${st}|${dist}`;
        const isTotal = rowMode(row) === 'TOTAL';
        if (isTotal) districtHasTotalMode.add(key);
        rowsAll.push({ key, party: normParty(candidateParty(row)), votes: parseVotes(row['votes'] || ''), isTotal });
      });
    } catch (err) {
      console.warn(`[house-${year}] Skipping ${st}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    for (const item of rowsAll) {
      if (districtHasTotalMode.has(item.key) && !item.isTotal) continue;
      const entry = byDistrict.get(item.key) ?? { dem: 0, rep: 0, total: 0 };
      if (item.party === 'Democrat') entry.dem += item.votes;
      if (item.party === 'Republican') entry.rep += item.votes;
      entry.total += item.votes;
      byDistrict.set(item.key, entry);
    }
    console.log(`[house-${year}] ${st}: aggregated ${[...byDistrict.keys()].filter((k) => k.startsWith(`${st}|`)).length} districts.`);
  }
  return byDistrict;
}

// -----------------------------------------------------------------------------
// Census (ACS 2023 5-year profile + 2020 Decennial urban/rural)
// -----------------------------------------------------------------------------

const ACS_VARS = [
  'DP05_0001E',  // total population
  'DP05_0019PE', // % under 18
  'DP05_0024PE', // % 65 and over
  'DP05_0037PE', // % White (one race)
  'DP05_0038PE', // % Black (one race)
  'DP05_0039PE', // % American Indian / Alaska Native (one race)
  'DP05_0047PE', // % Asian (one race)
  'DP05_0055PE', // % Native Hawaiian / Pacific Islander (one race)
  'DP05_0076PE', // % Hispanic or Latino (any race)
  'DP02_0067PE', // % HS grad or higher (25+)
  'DP02_0068PE', // % Bachelor's or higher (25+)
  'DP03_0062E',  // median household income
] as const;

function pct(value: string | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return round3(n / 100);
}

function buildDemographicsFromAcsRow(row: Record<string, string>): DemographicsRecord {
  const totalPop = Number(row['DP05_0001E']);
  const under18 = Number(row['DP05_0019PE']);
  const vap = Number.isFinite(totalPop) && Number.isFinite(under18)
    ? Math.round(totalPop * (1 - under18 / 100))
    : null;
  const racial: Record<string, number> = {};
  const racialPairs: Array<[string, string]> = [
    ['White', 'DP05_0037PE'],
    ['Black', 'DP05_0038PE'],
    ['Hispanic', 'DP05_0076PE'],
    ['Asian', 'DP05_0047PE'],
    ['Native American', 'DP05_0039PE'],
    ['Pacific Islander', 'DP05_0055PE'],
  ];
  for (const [label, varName] of racialPairs) {
    const share = pct(row[varName]);
    if (share !== null) racial[label] = share;
  }
  const age: Record<string, number> = {};
  const under18Share = pct(row['DP05_0019PE']);
  const over65Share = pct(row['DP05_0024PE']);
  if (under18Share !== null) age['Under 18'] = under18Share;
  if (over65Share !== null) age['65 and over'] = over65Share;
  if (under18Share !== null && over65Share !== null) age['18 to 64'] = round3(1 - under18Share - over65Share);
  const education: Record<string, number> = {};
  const hs = pct(row['DP02_0067PE']);
  const ba = pct(row['DP02_0068PE']);
  if (hs !== null) education['HS grad or higher'] = hs;
  if (ba !== null) education["Bachelor's or higher"] = ba;
  const income = Number(row['DP03_0062E']);
  return {
    racialComposition: racial,
    ageComposition: age,
    educationComposition: education,
    incomeProxy: { medianIncome: Number.isFinite(income) && income > 0 ? income : null },
    vap,
  };
}

function acsRowsToRecords(json: string[][]): Array<Record<string, string>> {
  const [header, ...rows] = json;
  return rows.map((row) => Object.fromEntries(header.map((h, i) => [h, row[i]])));
}

async function fetchCensusJson(url: string): Promise<string[][] | null> {
  try {
    const resp = await fetch(url, { redirect: 'manual' });
    if (resp.status !== 200) {
      console.warn(`[census] ${resp.status} for ${url.replace(/key=[^&]+/, 'key=***')}`);
      return null;
    }
    return (await resp.json()) as string[][];
  } catch (err) {
    console.warn(`[census] fetch failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function loadStateDemographics(censusKey: string): Promise<Map<string, DemographicsRecord>> {
  const byState = new Map<string, DemographicsRecord>();
  const url = `https://api.census.gov/data/2023/acs/acs5/profile?get=${ACS_VARS.join(',')}&for=state:*&key=${censusKey}`;
  const json = await fetchCensusJson(url);
  if (!json) return byState;
  for (const row of acsRowsToRecords(json)) {
    const po = STATE_FIPS_TO_PO[row['state']];
    if (!po) continue;
    byState.set(po, buildDemographicsFromAcsRow(row));
  }

  // Urban/rural shares from the 2020 Decennial DHC (state level).
  const urbanUrl = `https://api.census.gov/data/2020/dec/dhc?get=P2_001N,P2_002N,P2_003N&for=state:*&key=${censusKey}`;
  const urbanJson = await fetchCensusJson(urbanUrl);
  if (urbanJson) {
    for (const row of acsRowsToRecords(urbanJson)) {
      const po = STATE_FIPS_TO_PO[row['state']];
      const entry = po ? byState.get(po) : undefined;
      if (!entry) continue;
      const total = Number(row['P2_001N']);
      const urban = Number(row['P2_002N']);
      const rural = Number(row['P2_003N']);
      if (total > 0 && Number.isFinite(urban) && Number.isFinite(rural)) {
        entry.urbanRuralShare = { urban: round3(urban / total), rural: round3(rural / total) };
      }
    }
  }
  return byState;
}

async function loadDistrictDemographics(censusKey: string): Promise<Map<string, DemographicsRecord>> {
  // Key: `${statePO}|${district3}` where district3 matches normDistrictKey output.
  const byDistrict = new Map<string, DemographicsRecord>();
  const url = `https://api.census.gov/data/2023/acs/acs5/profile?get=${ACS_VARS.join(',')}&for=congressional%20district:*&in=state:*&key=${censusKey}`;
  const json = await fetchCensusJson(url);
  if (!json) return byDistrict;
  for (const row of acsRowsToRecords(json)) {
    const po = STATE_FIPS_TO_PO[row['state']];
    const cd = row['congressional district'];
    if (!po || !cd || cd === 'ZZ') continue;
    const key = cd === '00' ? `${po}|AL` : `${po}|${String(Number(cd)).padStart(3, '0')}`;
    byDistrict.set(key, buildDemographicsFromAcsRow(row));
  }
  return byDistrict;
}

function source(id: string, label: string, url: string, retrievedAt: string): ResearchSource {
  return { id, label, url, type: 'civic-data', retrievedAt };
}

function dedupeSources(sources: ResearchSource[]) {
  return Array.from(new Map(sources.map((item) => [item.id ?? item.url, item])).values());
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function writePipelineRun(db: Firestore, dryRun: boolean, summary: Record<string, unknown>) {
  if (dryRun) return;
  await db.collection('pipelineRuns').add({
    script: 'build-contest-metrics',
    ...summary,
    finishedAt: FieldValue.serverTimestamp(),
  });
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const targetYear = parseInt(getArg('--year') ?? '2024', 10);
  const targetState = getArg('--state')?.toUpperCase() ?? null;
  const targetOffice = getArg('--office') ?? null;
  const skipHouseHistorical = hasFlag('--skip-house-historical');
  const skipDemographics = hasFlag('--skip-demographics');
  const censusKey = process.env.CENSUS_API_KEY ?? null;

  const { db, projectId, databaseId } = bootstrapFirestore();

  let racesQuery: FirebaseFirestore.Query = db.collection('races').where('electionYear', '==', targetYear);
  if (targetState) racesQuery = racesQuery.where('state', '==', targetState);
  if (targetOffice) racesQuery = racesQuery.where('office', '==', targetOffice);
  const racesSnap = await racesQuery.get();
  const races = racesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Race);
  console.log(`Found ${races.length} races (year=${targetYear}${targetState ? `, state=${targetState}` : ''}${targetOffice ? `, office=${targetOffice}` : ''}).`);
  if (races.length === 0) return;

  const hasPresident = races.some((r) => r.office === 'President');
  const hasSenate = races.some((r) => r.office === 'Senate');
  const houseStates = new Set(races.filter((r) => r.office === 'House').map((r) => r.state));

  const supportsHistorical = targetYear === 2024 || targetYear === 2026;
  const senateYears = new Set<number>();
  if (hasSenate && targetYear === 2024) {
    senateYears.add(2018);
    senateYears.add(2024);
  } else if (hasSenate && targetYear === 2026) {
    senateYears.add(2020);
  }

  // The national presidential prior is loaded even for House-only runs because
  // partisanLean must not silently become a state-filtered pseudo-national value.
  const [pres2020, pres2024, senateByYear, house2022, house2024] = await Promise.all([
    supportsHistorical && (targetYear === 2024 || hasPresident)
      ? loadPresidentStateTotals(2020)
      : Promise.resolve(new Map<string, PartyTotals>()),
    supportsHistorical && (targetYear === 2026 || hasPresident)
      ? loadPresidentStateTotals(2024)
      : Promise.resolve(new Map<string, PartyTotals>()),
    loadSenateTotals(senateYears),
    supportsHistorical && houseStates.size > 0 && !skipHouseHistorical
      ? loadHouseTotals(houseStates, 2022)
      : Promise.resolve(new Map<string, PartyTotals>()),
    targetYear === 2026 && houseStates.size > 0 && !skipHouseHistorical
      ? loadHouseTotals(houseStates, 2024)
      : Promise.resolve(new Map<string, PartyTotals>()),
  ]);
  const sen2018 = senateByYear.get(2018) ?? new Map<string, PartyTotals>();
  const sen2020 = senateByYear.get(2020) ?? new Map<string, PartyTotals>();
  const sen2024 = senateByYear.get(2024) ?? new Map<string, PartyTotals>();
  console.log(
    `Loaded historical: pres2020=${pres2020.size} states, pres2024=${pres2024.size}, `
      + `senate2018=${sen2018.size}, senate2020=${sen2020.size}, senate2024=${sen2024.size}, `
      + `house2022=${house2022.size}, house2024=${house2024.size} districts.`,
  );

  const nationalPresidentialPrior = targetYear === 2026 ? pres2024 : pres2020;
  let nationalPrior: PartyTotals = { dem: 0, rep: 0, total: 0 };
  for (const t of nationalPresidentialPrior.values()) {
    nationalPrior.dem += t.dem;
    nationalPrior.rep += t.rep;
    nationalPrior.total += t.total;
  }
  const nationalPriorMarginPct = nationalPrior.total > 0 ? marginPct(nationalPrior) : null;

  let stateDemo = new Map<string, DemographicsRecord>();
  let districtDemo = new Map<string, DemographicsRecord>();
  if (!skipDemographics && censusKey) {
    stateDemo = await loadStateDemographics(censusKey);
    if (houseStates.size > 0) districtDemo = await loadDistrictDemographics(censusKey);
    console.log(`Loaded Census demographics: ${stateDemo.size} states, ${districtDemo.size} districts.`);
  } else if (!skipDemographics) {
    console.warn('CENSUS_API_KEY not set — skipping demographics and turnout rate. Get a free key at https://api.census.gov/data/key_signup.html');
  }

  let batch = db.batch();
  let pending = 0;
  let written = 0;
  let withHistorical = 0;
  let withTurnout = 0;
  const retrievedAt = new Date().toISOString();

  for (const race of races) {
    let prior: PartyTotals | undefined;
    let current: PartyTotals | undefined;
    let turnoutBasis: PartyTotals | undefined;
    let turnoutComparison: PartyTotals | undefined;
    let demo: DemographicsRecord | undefined = stateDemo.get(race.state);
    const plan = getHistoricalPlan(targetYear, race.office, race.state);
    const metricSources: ResearchSource[] = [];

    if (plan && targetYear === 2024 && race.office === 'President') {
      prior = pres2020.get(race.state);
      current = pres2024.get(race.state);
      turnoutBasis = current;
      turnoutComparison = prior;
    } else if (plan && targetYear === 2024 && race.office === 'Senate') {
      prior = sen2018.get(race.state);
      current = sen2024.get(race.state);
      turnoutBasis = current;
      turnoutComparison = prior;
    } else if (plan && targetYear === 2024 && race.office === 'House') {
      const districtKey = normDistrictKey(race.district);
      if (districtKey) {
        prior = house2022.get(`${race.state}|${districtKey}`);
        turnoutBasis = prior;
        demo = districtDemo.get(`${race.state}|${districtKey}`) ?? demo;
      }
    } else if (plan && targetYear === 2026 && race.office === 'President') {
      prior = pres2024.get(race.state);
      turnoutBasis = prior;
      turnoutComparison = pres2020.get(race.state);
    } else if (plan && targetYear === 2026 && race.office === 'Senate') {
      prior = sen2020.get(race.state);
      turnoutBasis = prior;
    } else if (plan && targetYear === 2026 && race.office === 'House') {
      const districtKey = normDistrictKey(race.district);
      if (districtKey) {
        prior = house2024.get(`${race.state}|${districtKey}`);
        turnoutBasis = prior;
        turnoutComparison = house2022.get(`${race.state}|${districtKey}`);
        demo = districtDemo.get(`${race.state}|${districtKey}`) ?? demo;
      }
    }

    const metrics = buildMetricsForRace(race, {
      prior,
      current,
      nationalPriorMarginPct,
      demo,
      historicalElectionYear: plan?.historicalElectionYear,
      turnoutBasis,
      turnoutElectionYear: plan?.turnoutElectionYear,
      turnoutComparison,
      turnoutComparisonElectionYear: plan?.turnoutComparisonElectionYear,
    });
    if (metrics.historical) withHistorical += 1;
    if (metrics.turnout) withTurnout += 1;

    if (metrics.historical && plan) {
      if (race.office === 'President') {
        metricSources.push(source(
          `tonmcg-president-${plan.historicalElectionYear}`,
          `${plan.historicalElectionYear} county presidential returns`,
          SOURCE_URLS.president,
          retrievedAt,
        ));
      } else if (race.office === 'House') {
        const url = plan.historicalElectionYear === 2024 ? SOURCE_URLS.house2024 : SOURCE_URLS.house2022;
        metricSources.push(source(
          `medsl-house-${plan.historicalElectionYear}`,
          `MEDSL ${plan.historicalElectionYear} official House returns`,
          url,
          retrievedAt,
        ));
      } else if (race.office === 'Senate') {
        const isGeorgiaRunoff = plan.historicalElectionYear === 2020 && race.state === 'GA';
        metricSources.push(source(
          isGeorgiaRunoff ? 'fec-senate-ga-2020-runoff' : `medsl-senate-${plan.historicalElectionYear}`,
          isGeorgiaRunoff
            ? 'FEC certified 2020 Georgia Senate runoff results'
            : `MEDSL ${plan.historicalElectionYear} statewide Senate returns`,
          isGeorgiaRunoff ? SOURCE_URLS.senateGa2020 : SOURCE_URLS.senate,
          retrievedAt,
        ));
      }
    }
    if (metrics.demographics) {
      metricSources.push(
        source('census-acs-2023-profile', 'Census ACS 2023 5-year profile', SOURCE_URLS.censusAcs, retrievedAt),
        source('census-dhc-2020', 'Census 2020 Decennial DHC', SOURCE_URLS.censusDhc, retrievedAt),
      );
    }
    metrics.sources = dedupeSources(metricSources);

    batch.set(
      db.doc(`contestMetrics/${race.id}`),
      {
        ...metrics,
        historical: metrics.historical ?? FieldValue.delete(),
        turnout: metrics.turnout ?? FieldValue.delete(),
        demographics: metrics.demographics ?? FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    pending += 1;
    written += 1;
    if (pending >= 400 && !dryRun) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
      console.log(`Committed ${written} metrics docs so far...`);
    }
  }

  if (!dryRun && pending > 0) await batch.commit();

  console.log(
    `${dryRun ? 'Planned' : 'Wrote'} ${written} contestMetrics docs (${withHistorical} historical, ${withTurnout} prior-turnout) to project=${projectId}, database=${databaseId}.`,
  );
  await writePipelineRun(db, dryRun, {
    year: targetYear,
    state: targetState,
    office: targetOffice,
    written,
    withHistorical,
    withTurnout,
    demographics: stateDemo.size > 0,
  });
}

await main();
