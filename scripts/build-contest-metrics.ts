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
import { ContestMetrics, Race } from '../src/types';
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

// 2024 presidential home states (Trump: FL, Harris: CA).
const PRESIDENT_HOME_STATES_2024 = new Set(['FL', 'CA']);

const TONMCG_BASE = 'https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master';
const CONSTITUENCY_RETURNS_SENATE_URL = 'https://raw.githubusercontent.com/MEDSL/constituency-returns/master/1976-2018-senate.csv';
const MEDSL_2024_BASE = 'https://raw.githubusercontent.com/MEDSL/2024-elections-official/main';
const MEDSL_2022_BASE = 'https://raw.githubusercontent.com/MEDSL/2022-elections-official/main';

// -----------------------------------------------------------------------------
// Historical results loaders
// -----------------------------------------------------------------------------

type PartyTotals = { dem: number; rep: number; total: number };

function marginPct(t: PartyTotals): number | null {
  if (t.total <= 0) return null;
  return round1(((t.dem - t.rep) / t.total) * 100);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

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

async function loadSenate2018Totals(): Promise<Map<string, PartyTotals>> {
  const rows = await fetchCsv(CONSTITUENCY_RETURNS_SENATE_URL);
  const byState = new Map<string, PartyTotals>();
  const totalVotesByState = new Map<string, number>();
  for (const row of rows) {
    if ((row['year'] || '').trim() !== '2018') continue;
    if ((row['stage'] || '').trim().toLowerCase() !== 'gen') continue;
    if ((row['special'] || '').trim().toUpperCase() === 'TRUE') continue;
    const po = stateAbbrev(row);
    const entry = byState.get(po) ?? { dem: 0, rep: 0, total: 0 };
    const party = normParty(candidateParty(row));
    const votes = parseVotes(row['candidatevotes'] || '');
    if (party === 'Democrat') entry.dem += votes;
    if (party === 'Republican') entry.rep += votes;
    byState.set(po, entry);
    const tv = parseVotes(row['totalvotes'] || '');
    if (tv > (totalVotesByState.get(po) ?? 0)) totalVotesByState.set(po, tv);
  }
  for (const [po, entry] of byState.entries()) {
    entry.total = totalVotesByState.get(po) ?? entry.dem + entry.rep;
  }
  return byState;
}

async function loadSenate2024Totals(): Promise<Map<string, PartyTotals>> {
  const rows = await fetchCsv(`${MEDSL_2024_BASE}/2024-senate-state.csv`);
  const byState = new Map<string, PartyTotals>();
  const scoped = rows.filter((row) => rowOffice(row) === 'US SENATE');
  const statesWithTotalMode = new Set(scoped.filter((row) => rowMode(row) === 'TOTAL').map((row) => stateAbbrev(row)));
  for (const row of scoped) {
    const po = stateAbbrev(row);
    if (statesWithTotalMode.has(po) && rowMode(row) !== 'TOTAL') continue;
    const name = candidateName(row);
    if (!name || isWriteIn(row) || isNonCandidateChoice(name)) continue;
    const entry = byState.get(po) ?? { dem: 0, rep: 0, total: 0 };
    const party = normParty(candidateParty(row));
    const votes = parseVotes(row['votes'] || '');
    if (party === 'Democrat') entry.dem += votes;
    if (party === 'Republican') entry.rep += votes;
    entry.total += votes;
    byState.set(po, entry);
  }
  return byState;
}

async function loadHouse2022Totals(states: Set<string>): Promise<Map<string, PartyTotals>> {
  const byDistrict = new Map<string, PartyTotals>();
  for (const st of states) {
    const zipUrl = `${MEDSL_2022_BASE}/individual_states/2022-${st.toLowerCase()}-local-precinct-general.zip`;
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
      console.warn(`[house-2022] Skipping ${st}: ${err instanceof Error ? err.message : err}`);
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
    console.log(`[house-2022] ${st}: aggregated ${[...byDistrict.keys()].filter((k) => k.startsWith(`${st}|`)).length} districts.`);
  }
  return byDistrict;
}

// -----------------------------------------------------------------------------
// Census (ACS 2023 5-year profile + 2020 Decennial urban/rural)
// -----------------------------------------------------------------------------

type DemographicsRecord = NonNullable<ContestMetrics['demographics']> & { vap?: number | null };

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

// -----------------------------------------------------------------------------
// Metrics assembly
// -----------------------------------------------------------------------------

function stripVap(demo: DemographicsRecord | undefined): ContestMetrics['demographics'] | undefined {
  if (!demo) return undefined;
  const { vap: _vap, ...rest } = demo;
  return rest;
}

function winnerParty(race: Race): string | null {
  if (!race.winnerId) return null;
  const winner = (race.candidates || []).find((c) => c.id === race.winnerId);
  return winner?.party ?? null;
}

function buildMetricsForRace(
  race: Race,
  prior: PartyTotals | undefined,
  current: PartyTotals | undefined,
  nationalPriorMarginPct: number | null,
  demo: DemographicsRecord | undefined,
): ContestMetrics {
  const metrics: ContestMetrics = { id: race.id, raceId: race.id };

  if (prior && prior.total > 0) {
    const priorMargin = marginPct(prior);
    const currentMargin = current && current.total > 0 ? marginPct(current) : null;
    metrics.historical = {
      priorVoteShareDem: round3(prior.dem / prior.total),
      priorVoteShareRep: round3(prior.rep / prior.total),
      priorMargin,
      swingVsPrevious: priorMargin !== null && currentMargin !== null ? round1(currentMargin - priorMargin) : null,
      partisanLean: priorMargin !== null && nationalPriorMarginPct !== null ? round1(priorMargin - nationalPriorMarginPct) : null,
    };
  }

  const priorMarginForFundamentals = metrics.historical?.priorMargin ?? null;
  const winner = winnerParty(race);
  metrics.fundamentals = {
    incumbencyFlag: (race.candidates || []).some((c) => c.incumbent === true),
    homeStateAdvantageFlag: race.office === 'President' && race.electionYear === 2024
      ? PRESIDENT_HOME_STATES_2024.has(race.state)
      : false,
    nationalHeadwindTailwind: null,
    priorCycleBaseline: priorMarginForFundamentals,
    partyContinuity: winner && priorMarginForFundamentals !== null
      ? (winner === 'Democrat') === (priorMarginForFundamentals > 0)
      : undefined,
    economicDirectionIndicator: null,
  };

  const turnout: NonNullable<ContestMetrics['turnout']> = {
    turnoutRate: current && current.total > 0 && demo?.vap ? round3(Math.min(1, current.total / demo.vap)) : null,
    turnoutChange: current && current.total > 0 && prior && prior.total > 0
      ? round3((current.total - prior.total) / prior.total)
      : null,
    earlyVoteShare: null,
  };
  if (turnout.turnoutRate !== null || turnout.turnoutChange !== null) {
    metrics.turnout = turnout;
  }

  const demographics = stripVap(demo);
  if (demographics) metrics.demographics = demographics;

  // Polling is intentionally absent: there is no free polling API. The drawer's
  // confidence model treats the missing section honestly.
  return metrics;
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

  // Historical loaders only apply to the 2024 sandbox cycle; other cycles (e.g.
  // 2026 live) still get fundamentals/demographics.
  const isHistorical2024 = targetYear === 2024;
  const [pres2020, pres2024, sen2018, sen2024, house2022] = await Promise.all([
    isHistorical2024 && hasPresident ? loadPresidentStateTotals(2020) : Promise.resolve(new Map<string, PartyTotals>()),
    isHistorical2024 && hasPresident ? loadPresidentStateTotals(2024) : Promise.resolve(new Map<string, PartyTotals>()),
    isHistorical2024 && hasSenate ? loadSenate2018Totals() : Promise.resolve(new Map<string, PartyTotals>()),
    isHistorical2024 && hasSenate ? loadSenate2024Totals() : Promise.resolve(new Map<string, PartyTotals>()),
    isHistorical2024 && houseStates.size > 0 && !skipHouseHistorical
      ? loadHouse2022Totals(houseStates)
      : Promise.resolve(new Map<string, PartyTotals>()),
  ]);
  console.log(`Loaded historical: pres2020=${pres2020.size} states, pres2024=${pres2024.size}, senate2018=${sen2018.size}, senate2024=${sen2024.size}, house2022=${house2022.size} districts.`);

  // National 2020 presidential margin, for partisanLean.
  let nationalPrior: PartyTotals = { dem: 0, rep: 0, total: 0 };
  for (const t of pres2020.values()) {
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

  for (const race of races) {
    let prior: PartyTotals | undefined;
    let current: PartyTotals | undefined;
    let demo: DemographicsRecord | undefined = stateDemo.get(race.state);

    if (race.office === 'President') {
      prior = pres2020.get(race.state);
      current = pres2024.get(race.state);
    } else if (race.office === 'Senate') {
      prior = sen2018.get(race.state);
      current = sen2024.get(race.state);
    } else if (race.office === 'House') {
      const districtKey = normDistrictKey(race.district);
      if (districtKey) {
        prior = house2022.get(`${race.state}|${districtKey}`);
        demo = districtDemo.get(`${race.state}|${districtKey}`) ?? demo;
      }
    }

    const metrics = buildMetricsForRace(race, prior, current, nationalPriorMarginPct, demo);
    if (metrics.historical) withHistorical += 1;

    batch.set(
      db.doc(`contestMetrics/${race.id}`),
      { ...metrics, updatedAt: FieldValue.serverTimestamp() },
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
    `${dryRun ? 'Planned' : 'Wrote'} ${written} contestMetrics docs (${withHistorical} with historical data) to project=${projectId}, database=${databaseId}.`,
  );
  await writePipelineRun(db, dryRun, {
    year: targetYear,
    state: targetState,
    office: targetOffice,
    written,
    withHistorical,
    demographics: stateDemo.size > 0,
  });
}

await main();
