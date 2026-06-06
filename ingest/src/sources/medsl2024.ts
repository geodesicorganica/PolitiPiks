import Papa from 'papaparse';
import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';
import { SourcePayload } from '../schema.js';

type Row = Record<string, string>;
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

function requireField(row: Row, key: string) {
  const v = row[key];
  if (!v) throw new Error(`Missing field ${key}`);
  return v;
}

function normParty(party: string) {
  const p = party.trim().toLowerCase();
  if (p.includes('democrat')) return 'Democrat';
  if (p.includes('republican')) return 'Republican';
  if (p.includes('independent')) return 'Independent';
  return 'Other';
}

function slugId(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown';
}

function candidateKey(name: string) {
  return slugId(name);
}

function betterParty(existing: string, next: string) {
  if (existing === 'Other' && next !== 'Other') return next;
  return existing || next;
}

function stateAbbrev(row: Row) {
  const st = (row['state_po'] || row['state'] || row['state_abbrev'] || '').trim();
  if (!st) throw new Error('Missing state');
  return st.toUpperCase();
}

function candidateName(row: Row) {
  return (row['candidate'] || row['candidate_name'] || row['cand'] || '').replace(/\s+/g, ' ').trim();
}

function candidateParty(row: Row) {
  return (row['party_simplified'] || row['party'] || row['party_detailed'] || '').trim();
}

function district(row: Row) {
  return (row['district'] || '').replace(/\s+/g, ' ').trim();
}

function office(row: Row) {
  return (row['office'] || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function mode(row: Row) {
  return (row['mode'] || '').trim().toUpperCase();
}

function parseVotes(raw: string) {
  const normalized = raw.trim().replace(/,/g, '');
  if (!normalized || normalized === '*') return 0;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function isWriteIn(row: Row) {
  const writein = (row['writein'] || '').trim().toLowerCase();
  const candidate = candidateName(row).toLowerCase();
  return writein == 'true' || candidate.includes('write-in') || candidate.includes('write in');
}

function isNonCandidateChoice(name: string) {
  const normalized = name.replace(/[^a-z0-9]+/gi, ' ').trim().toUpperCase();
  return [
    'OVER VOTES',
    'OVERVOTES',
    'UNDER VOTES',
    'UNDERVOTES',
    'TOTAL VOTES CAST',
    'TOTAL VOTES',
    'WRITE IN',
    'WRITE INS',
    'WRITEIN',
  ].includes(normalized);
}

function isSkippableHouseDistrict(state: string, districtName: string) {
  const normalizedDistrict = districtName.toUpperCase();
  return !districtName || (normalizedDistrict === 'STATEWIDE' && !AT_LARGE_HOUSE_STATES.has(state));
}

async function fetchCsv(url: string) {
  const resp = await fetch(url, { headers: { accept: 'text/csv,*/*' } });
  if (!resp.ok) throw new Error(`Fetch failed ${resp.status} for ${url}`);
  const text = await resp.text();
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`CSV parse error: ${parsed.errors[0]?.message ?? 'unknown'}`);
  return parsed.data.filter((r: Row) => Object.keys(r).length > 0);
}

function closeDateForElection(electionDateISO: string) {
  // For post-cert historical imports, exact poll close times don't matter for pick locking.
  // Use end-of-day UTC as a stable placeholder.
  return `${electionDateISO}T23:59:59Z`;
}

async function forEachZipCsvRow(url: string, onRow: (row: Row) => void) {
  const resp = await fetch(url, { headers: { accept: 'application/zip,*/*' } });
  if (!resp.ok) throw new Error(`Fetch failed ${resp.status} for ${url}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const csvStream = extractFirstCsvStreamFromZip(buffer);

  await new Promise<void>((resolve, reject) => {
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: true,
      skipEmptyLines: true,
    });

    parser.on('data', (row: Row) => onRow(row));
    parser.on('error', reject);
    parser.on('finish', resolve);
    csvStream.on('error', reject);
    csvStream.pipe(parser);
  });
}

function extractFirstCsvStreamFromZip(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  let offset = centralDirectoryOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    if (fileName.toLowerCase().endsWith('.csv')) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error('Invalid ZIP local file header');
      }
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return Readable.from(compressed);
      if (compressionMethod === 8) return Readable.from(compressed).pipe(createInflateRaw());
      throw new Error(`Unsupported ZIP compression method ${compressionMethod}`);
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  throw new Error('No CSV file found in ZIP');
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Invalid ZIP: missing end of central directory');
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
