import { SourcePayload } from '../schema.js';
import {
  Row,
  betterParty,
  candidateKey,
  candidateName,
  candidateParty,
  closeDateForElection,
  district,
  fetchCsv,
  forEachZipCsvRow,
  isNonCandidateChoice,
  isWriteIn,
  mode,
  normParty,
  office,
  parseVotes,
  slugId,
  stateAbbrev,
} from './medslCommon.js';

type ContestCandidate = { id: string; name: string; party: string; votes: number };
type CandidateAccumulator = { id: string; name: string; party: string; allVotes: number; totalModeVotes: number };
type MeasureAccumulator = { passAll: number; failAll: number; passTotal: number; failTotal: number; hasTotalMode: boolean };

const MEDSL_BASE = 'https://raw.githubusercontent.com/MEDSL/2024-elections-official/main';
const ELECTION_DATE = '2024-11-05';
const AT_LARGE_HOUSE_STATES = new Set(['AK', 'DE', 'ND', 'SD', 'VT', 'WY']);

const STATE_ZIPS = [
  'ak24.zip',
  'al24.zip',
  'ar24.zip',
  'az24.zip',
  'ca24.zip',
  'co24.zip',
  'ct24.zip',
  'dc24.zip',
  'de24.zip',
  'fl24.zip',
  'ga24.zip',
  'hi24.zip',
  'ia24.zip',
  'id24.zip',
  'il24.zip',
  'in24.zip',
  'ks24.zip',
  'ky24.zip',
  'la24.zip',
  'ma24.zip',
  'md24.zip',
  'me24.zip',
  'mi24.zip',
  'mn24.zip',
  'mo24.zip',
  'ms24.zip',
  'mt24.zip',
  'nc24.zip',
  'nd24.zip',
  'ne24.zip',
  'nh24.zip',
  'nj24.zip',
  'nm24.zip',
  'nv24.zip',
  'ny24.zip',
  'oh24.zip',
  'ok24.zip',
  'or24.zip',
  'pa24.zip',
  'ri24.zip',
  'sc24.zip',
  'sd24.zip',
  'tn24.zip',
  'tx24.zip',
  'ut24.zip',
  'va24.zip',
  'vt24.zip',
  'wa24.zip',
  'wi24.zip',
  'wv24.zip',
  'wy24.zip',
] as const;

function configuredStateZips() {
  const raw = process.env.MEDSL_2024_STATE_ZIPS || process.env.MEDSL_2024_STATES;
  if (!raw) return [...STATE_ZIPS];

  const wanted = new Set(
    raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .map((item) => (item.endsWith('.zip') ? item : `${item.replace(/24$/, '')}24.zip`)),
  );

  return STATE_ZIPS.filter((zip) => wanted.has(zip));
}

function isSkippableHouseDistrict(state: string, districtName: string) {
  const normalizedDistrict = districtName.toUpperCase();
  return !districtName || (normalizedDistrict === 'STATEWIDE' && !AT_LARGE_HOUSE_STATES.has(state));
}

function aggregateCandidateVotes(rows: Row[], includeRow: (row: Row) => boolean) {
  const scopedRows = rows.filter(includeRow);
  const hasTotalMode = scopedRows.some((row) => mode(row) === 'TOTAL');
  const voteRows = hasTotalMode ? scopedRows.filter((row) => mode(row) === 'TOTAL') : scopedRows;
  const byCandidate = new Map<string, { name: string; party: string; votes: number }>();

  for (const row of voteRows) {
    const name = candidateName(row);
    if (!name || isWriteIn(row) || isNonCandidateChoice(name)) continue;
    const party = normParty(candidateParty(row));
    const key = candidateKey(name);
    const existing = byCandidate.get(key) ?? { name, party, votes: 0 };
    existing.party = betterParty(existing.party, party);
    existing.votes += parseVotes(row['votes'] || '');
    byCandidate.set(key, existing);
  }

  return Array.from(byCandidate.entries())
    .map(([, candidate]) => ({ id: slugId(`${candidate.name}-${candidate.party}`), ...candidate }))
    .sort((a, b) => b.votes - a.votes);
}

function winnerId(candidates: ContestCandidate[]) {
  return candidates.length > 0 ? candidates[0].id : undefined;
}

function measureOption(candidate: string) {
  const option = candidate.trim().toUpperCase();
  if (option === 'YES' || option === 'FOR' || option === 'APPROVE' || option === 'APPROVED') return 'pass';
  if (option === 'NO' || option === 'AGAINST' || option === 'REJECT' || option === 'REJECTED') return 'fail';
  return null;
}

function isPotentialStatewideMeasure(row: Row) {
  if (district(row).toUpperCase() !== 'STATEWIDE') return false;
  if (!measureOption(candidateName(row))) return false;
  const officeName = office(row);
  return !['US PRESIDENT', 'US SENATE', 'US HOUSE', 'GOVERNOR'].includes(officeName);
}

function supplementalHouseRaces(): SourcePayload['races'] {
  const races = [
    {
      state: 'FL',
      district: '020',
      winnerName: 'SHEILA CHERFILUS-MCCORMICK',
      party: 'Democrat',
    },
    {
      state: 'OK',
      district: '003',
      winnerName: 'FRANK D. LUCAS',
      party: 'Republican',
    },
  ];

  return races.map((race) => {
    const winnerId = slugId(`${race.winnerName}-${race.party}`);
    return {
      id: `2024-${race.state}-house-${slugId(race.district)}`,
      state: race.state,
      office: 'House',
      district: race.district,
      electionYear: 2024,
      mode: 'sandbox',
      status: 'upcoming',
      winnerId,
      closeDate: closeDateForElection(ELECTION_DATE),
      candidates: [
        {
          id: winnerId,
          name: race.winnerName,
          party: race.party,
          incumbent: true,
        },
      ],
    };
  });
}

async function loadMedsl2024HouseAndMeasures(): Promise<SourcePayload> {
  const races: SourcePayload['races'] = [];
  const ballotMeasures: SourcePayload['ballotMeasures'] = [];

  for (const zipName of configuredStateZips()) {
    const byHouseDistrict = new Map<string, { hasTotalMode: boolean; candidates: Map<string, CandidateAccumulator> }>();
    const byMeasure = new Map<string, MeasureAccumulator>();

    await forEachZipCsvRow(`${MEDSL_BASE}/individual_states/${zipName}`, (row) => {
      if (office(row) === 'US HOUSE') {
        const st = stateAbbrev(row);
        const dist = district(row);
        const name = candidateName(row);
        if (isSkippableHouseDistrict(st, dist)) return;
        if (!name || isWriteIn(row) || isNonCandidateChoice(name)) return;
        const key = `${st}|${dist}`;
        const party = normParty(candidateParty(row));
        const entry = byHouseDistrict.get(key) ?? { hasTotalMode: false, candidates: new Map<string, CandidateAccumulator>() };
        const keyByCandidate = candidateKey(name);
        const candidate = entry.candidates.get(keyByCandidate) ?? {
          id: '',
          name,
          party,
          allVotes: 0,
          totalModeVotes: 0,
        };
        candidate.party = betterParty(candidate.party, party);
        const votes = parseVotes(row['votes'] || '');
        candidate.allVotes += votes;
        if (mode(row) === 'TOTAL') {
          entry.hasTotalMode = true;
          candidate.totalModeVotes += votes;
        }
        entry.candidates.set(keyByCandidate, candidate);
        byHouseDistrict.set(key, entry);
      } else if (isPotentialStatewideMeasure(row)) {
        const st = stateAbbrev(row);
        const key = `${st}|${office(row)}`;
        const option = measureOption(candidateName(row));
        if (!option) return;
        const votes = parseVotes(row['votes'] || '');
        const entry = byMeasure.get(key) ?? {
          passAll: 0,
          failAll: 0,
          passTotal: 0,
          failTotal: 0,
          hasTotalMode: false,
        };
        if (option === 'pass') {
          entry.passAll += votes;
          if (mode(row) === 'TOTAL') entry.passTotal += votes;
        } else {
          entry.failAll += votes;
          if (mode(row) === 'TOTAL') entry.failTotal += votes;
        }
        if (mode(row) === 'TOTAL') entry.hasTotalMode = true;
        byMeasure.set(key, entry);
      }
    });

    for (const [key, contest] of byHouseDistrict.entries()) {
      const [st, dist] = key.split('|');
      const candidates = Array.from(contest.candidates.values())
        .map((candidate) => ({
          id: slugId(`${candidate.name}-${candidate.party}`),
          name: candidate.name,
          party: candidate.party,
          votes: contest.hasTotalMode ? candidate.totalModeVotes : candidate.allVotes,
        }))
        .filter((candidate) => candidate.votes > 0)
        .sort((a, b) => b.votes - a.votes);
      if (candidates.length === 0) continue;
      races.push({
        id: `2024-${st}-house-${slugId(dist)}`,
        state: st,
        office: 'House',
        district: dist,
        electionYear: 2024,
        mode: 'sandbox',
        status: 'upcoming',
        winnerId: winnerId(candidates),
        closeDate: closeDateForElection(ELECTION_DATE),
        candidates: candidates.map(({ id, name, party }) => ({ id, name, party })),
      });
    }

    for (const [key, contest] of byMeasure.entries()) {
      const [st, title] = key.split('|');
      const passVotes = contest.hasTotalMode ? contest.passTotal : contest.passAll;
      const failVotes = contest.hasTotalMode ? contest.failTotal : contest.failAll;
      if (passVotes === 0 && failVotes === 0) continue;

      ballotMeasures.push({
        id: `2024-${st}-measure-${slugId(title)}`,
        state: st,
        title,
        description: `${title} on the 2024 ${st} general election ballot.`,
        electionYear: 2024,
        mode: 'sandbox',
        status: 'upcoming',
        result: passVotes > failVotes ? 'pass' : 'fail',
        closeDate: closeDateForElection(ELECTION_DATE),
      });
    }
  }

  const existingRaceIds = new Set(races.map((race) => race.id));
  for (const race of supplementalHouseRaces()) {
    if (!existingRaceIds.has(race.id)) {
      races.push(race);
    }
  }

  return { races, ballotMeasures };
}

export async function loadMedsl2024StatewideContests(): Promise<SourcePayload> {
  const [pres, senate] = await Promise.all([
    fetchCsv(`${MEDSL_BASE}/2024-president-state.csv`),
    fetchCsv(`${MEDSL_BASE}/2024-senate-state.csv`),
  ]);

  const races: SourcePayload['races'] = [];

  // President (one per state)
  {
    const byState = new Map<string, { candidates: { name: string; party: string }[] }>();
    for (const row of pres) {
      const st = stateAbbrev(row);
      const name = candidateName(row);
      if (!name || isWriteIn(row) || isNonCandidateChoice(name)) continue;
      const party = normParty(candidateParty(row));
      const entry = byState.get(st) ?? { candidates: [] };
      if (!entry.candidates.some((c) => c.name === name && c.party === party)) {
        entry.candidates.push({ name, party });
      }
      byState.set(st, entry);
    }

    for (const [st, entry] of byState.entries()) {
      const candidates = aggregateCandidateVotes(
        pres,
        (row) => stateAbbrev(row) === st && office(row) === 'US PRESIDENT',
      );
      races.push({
        id: `2024-${st}-president`,
        state: st,
        office: 'President',
        district: null,
        electionYear: 2024,
        mode: 'sandbox',
        status: 'upcoming',
        winnerId: winnerId(candidates),
        closeDate: closeDateForElection(ELECTION_DATE),
        candidates: candidates.map(({ id, name, party }) => ({ id, name, party })),
      });
    }
  }

  // Senate (only where contested, one per state in file)
  {
    const byState = new Map<string, { candidates: { name: string; party: string }[] }>();
    for (const row of senate) {
      const st = stateAbbrev(row);
      const name = candidateName(row);
      if (!name || isWriteIn(row) || isNonCandidateChoice(name)) continue;
      const party = normParty(candidateParty(row));
      const entry = byState.get(st) ?? { candidates: [] };
      if (!entry.candidates.some((c) => c.name === name && c.party === party)) {
        entry.candidates.push({ name, party });
      }
      byState.set(st, entry);
    }

    for (const [st, entry] of byState.entries()) {
      const candidates = aggregateCandidateVotes(
        senate,
        (row) => stateAbbrev(row) === st && office(row) === 'US SENATE',
      );
      races.push({
        id: `2024-${st}-senate`,
        state: st,
        office: 'Senate',
        district: null,
        electionYear: 2024,
        mode: 'sandbox',
        status: 'upcoming',
        winnerId: winnerId(candidates),
        closeDate: closeDateForElection(ELECTION_DATE),
        candidates: candidates.map(({ id, name, party }) => ({ id, name, party })),
      });
    }
  }

  const houseAndMeasures = await loadMedsl2024HouseAndMeasures();
  races.push(...houseAndMeasures.races);

  return {
    races,
    ballotMeasures: houseAndMeasures.ballotMeasures,
  };
}
