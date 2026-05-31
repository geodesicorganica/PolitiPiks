import Papa from 'papaparse';
import { SourcePayload } from '../schema.js';

type Row = Record<string, string>;

function requireField(row: Row, key: string) {
  const v = row[key];
  if (!v) throw new Error(`Missing field ${key}`);
  return v;
}

function normParty(party: string) {
  const p = party.trim();
  if (!p) return 'Unknown';
  return p;
}

function slugId(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown';
}

function stateAbbrev(row: Row) {
  const st = (row['state_po'] || row['state'] || row['state_abbrev'] || '').trim();
  if (!st) throw new Error('Missing state');
  return st.toUpperCase();
}

function candidateName(row: Row) {
  return (row['candidate'] || row['candidate_name'] || row['cand'] || '').trim();
}

function candidateParty(row: Row) {
  return (row['party_simplified'] || row['party'] || row['party_detailed'] || '').trim();
}

async function fetchCsv(url: string) {
  const resp = await fetch(url, { headers: { accept: 'text/csv,*/*' } });
  if (!resp.ok) throw new Error(`Fetch failed ${resp.status} for ${url}`);
  const text = await resp.text();
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`CSV parse error: ${parsed.errors[0]?.message ?? 'unknown'}`);
  return parsed.data.filter((r) => Object.keys(r).length > 0);
}

function closeDateForElection(electionDateISO: string) {
  // For post-cert historical imports, exact poll close times don't matter for pick locking.
  // Use end-of-day UTC as a stable placeholder.
  return `${electionDateISO}T23:59:59Z`;
}

export async function loadMedsl2024StatewideContests(): Promise<SourcePayload> {
  const base = 'https://raw.githubusercontent.com/MEDSL/2024-elections-official/main';
  const electionDate = '2024-11-05';

  const [pres, senate] = await Promise.all([
    fetchCsv(`${base}/2024-president-state.csv`),
    fetchCsv(`${base}/2024-senate-state.csv`),
  ]);

  const races: SourcePayload['races'] = [];

  // President (one per state)
  {
    const byState = new Map<string, { candidates: { name: string; party: string }[] }>();
    for (const row of pres) {
      const st = stateAbbrev(row);
      const name = candidateName(row);
      if (!name) continue;
      const party = normParty(candidateParty(row));
      const entry = byState.get(st) ?? { candidates: [] };
      if (!entry.candidates.some((c) => c.name === name && c.party === party)) {
        entry.candidates.push({ name, party });
      }
      byState.set(st, entry);
    }

    for (const [st, entry] of byState.entries()) {
      races.push({
        id: `2024-${st}-president`,
        state: st,
        office: 'President',
        district: null,
        closeDate: closeDateForElection(electionDate),
        candidates: entry.candidates.map((c) => ({
          id: slugId(`${c.name}-${c.party}`),
          name: c.name,
          party: c.party,
        })),
      });
    }
  }

  // Senate (only where contested, one per state in file)
  {
    const byState = new Map<string, { candidates: { name: string; party: string }[] }>();
    for (const row of senate) {
      const st = stateAbbrev(row);
      const name = candidateName(row);
      if (!name) continue;
      const party = normParty(candidateParty(row));
      const entry = byState.get(st) ?? { candidates: [] };
      if (!entry.candidates.some((c) => c.name === name && c.party === party)) {
        entry.candidates.push({ name, party });
      }
      byState.set(st, entry);
    }

    for (const [st, entry] of byState.entries()) {
      races.push({
        id: `2024-${st}-senate`,
        state: st,
        office: 'Senate',
        district: null,
        closeDate: closeDateForElection(electionDate),
        candidates: entry.candidates.map((c) => ({
          id: slugId(`${c.name}-${c.party}`),
          name: c.name,
          party: c.party,
        })),
      });
    }
  }

  return {
    races,
    ballotMeasures: [],
  };
}

