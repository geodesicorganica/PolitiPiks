/**
 * link-external-ids.ts
 *
 * Populates Candidate.externalIds (bioguideId, fecCandidateId) and refines the
 * incumbent flag for Senate/House candidates by matching them against the free
 * unitedstates/congress-legislators dataset (current + recent historical members).
 *
 * Matching is conservative: state + chamber (+ district for House) + last name,
 * with a first-name check when more than one legislator shares that key. Ambiguous
 * candidates are logged and skipped rather than guessed.
 *
 * Usage:
 *   npm run link-external-ids -- [--year 2024] [--state GA] [--dry-run]
 * Env: PROJECT_ID / FIREBASE_SERVICE_ACCOUNT / FIRESTORE_DATABASE_ID
 */
import process from 'node:process';
import { FieldValue } from '@google-cloud/firestore';
import { Candidate, Race } from '../src/types';
import { getArg, hasFlag, bootstrapFirestore } from './lib/firestoreCli.js';
import { electionDayFor, normDistrictKey } from '../ingest/src/sources/medslCommon.js';

// -----------------------------------------------------------------------------
// congress-legislators dataset
// -----------------------------------------------------------------------------

const LEGISLATORS_BASE = 'https://unitedstates.github.io/congress-legislators';

type LegislatorTerm = {
  type: 'sen' | 'rep';
  start: string;
  end: string;
  state: string;
  district?: number;
  party?: string;
};

type Legislator = {
  id: { bioguide: string; fec?: string[] };
  name: { first: string; last: string; official_full?: string; nickname?: string };
  terms: LegislatorTerm[];
};

const NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);

function normalizeNamePart(part: string) {
  return part.toUpperCase().replace(/[^A-Z]/g, '');
}

function nameTokens(fullName: string): string[] {
  return fullName
    .split(/[\s,]+/)
    .map(normalizeNamePart)
    .filter((t) => t.length > 0 && !NAME_SUFFIXES.has(t));
}

type MatchEntry = {
  bioguideId: string;
  fecIds: string[];
  firstTokens: string[];
  lastName: string;
  incumbentOn: (electionDate: string) => boolean;
};

/**
 * Index key: `${state}|${chamber}` (+ `|${district3}` for House). Values may hold
 * multiple legislators (e.g. two senators per state); disambiguated by name.
 */
async function buildLegislatorIndex(electionYear: number): Promise<Map<string, MatchEntry[]>> {
  const [currentResp, historicalResp] = await Promise.all([
    fetch(`${LEGISLATORS_BASE}/legislators-current.json`),
    fetch(`${LEGISLATORS_BASE}/legislators-historical.json`),
  ]);
  if (!currentResp.ok) throw new Error(`Fetch failed ${currentResp.status} for legislators-current.json`);
  if (!historicalResp.ok) throw new Error(`Fetch failed ${historicalResp.status} for legislators-historical.json`);
  const current = (await currentResp.json()) as Legislator[];
  const historical = (await historicalResp.json()) as Legislator[];

  // Keep historical members whose service overlaps the election cycle, so 2024
  // incumbents who lost (and left) still match.
  const cutoff = `${electionYear - 1}-01-01`;
  const relevantHistorical = historical.filter((l) => l.terms.some((t) => t.end >= cutoff));
  const all = [...current, ...relevantHistorical];

  const index = new Map<string, MatchEntry[]>();
  for (const legislator of all) {
    const recentTerms = legislator.terms.filter((t) => t.end >= cutoff);
    if (recentTerms.length === 0) continue;
    const entry: MatchEntry = {
      bioguideId: legislator.id.bioguide,
      fecIds: legislator.id.fec ?? [],
      firstTokens: [legislator.name.first, legislator.name.nickname ?? '']
        .map(normalizeNamePart)
        .filter(Boolean),
      lastName: normalizeNamePart(legislator.name.last),
      incumbentOn: (electionDate: string) =>
        legislator.terms.some((t) => t.start <= electionDate && t.end >= electionDate),
    };
    const seenKeys = new Set<string>();
    for (const term of recentTerms) {
      const chamber = term.type === 'sen' ? 'Senate' : 'House';
      let key: string;
      if (chamber === 'House') {
        const districtKey = normDistrictKey(term.district);
        if (!districtKey) continue; // unparseable district on authoritative term data; skip rather than guess
        key = `${term.state}|House|${districtKey}`;
      } else {
        key = `${term.state}|Senate`;
      }
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const bucket = index.get(key) ?? [];
      bucket.push(entry);
      index.set(key, bucket);
    }
  }
  return index;
}

function matchCandidate(candidate: Candidate, bucket: MatchEntry[]): MatchEntry | 'ambiguous' | null {
  const tokens = nameTokens(candidate.name);
  if (tokens.length === 0) return null;
  const byLastName = bucket.filter((entry) => tokens.includes(entry.lastName));
  if (byLastName.length === 0) return null;
  if (byLastName.length === 1) return byLastName[0];
  const byFirstName = byLastName.filter((entry) =>
    entry.firstTokens.some((first) => tokens.some((t) => t === first || t.startsWith(first) || first.startsWith(t))),
  );
  if (byFirstName.length === 1) return byFirstName[0];
  return 'ambiguous';
}

function fecIdForOffice(fecIds: string[], office: string): string | null {
  const prefix = office === 'Senate' ? 'S' : 'H';
  return fecIds.find((id) => id.startsWith(prefix)) ?? fecIds[0] ?? null;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const dryRun = hasFlag('--dry-run');
  const targetYear = parseInt(getArg('--year') ?? '2024', 10);
  const targetState = getArg('--state')?.toUpperCase() ?? null;

  const { db } = bootstrapFirestore();

  const index = await buildLegislatorIndex(targetYear);
  console.log(`Built legislator index with ${index.size} state/chamber keys.`);

  let racesQuery: FirebaseFirestore.Query = db.collection('races').where('electionYear', '==', targetYear);
  if (targetState) racesQuery = racesQuery.where('state', '==', targetState);
  const racesSnap = await racesQuery.get();
  console.log(`Found ${racesSnap.size} races.`);

  let batch = db.batch();
  let pending = 0;
  let matched = 0;
  let ambiguous = 0;
  let racesUpdated = 0;
  // The legislator dataset's term start/end are plain YYYY-MM-DD strings (no
  // time component), so compare against the date portion only — the full
  // ISO closeDate (with a T23:59:59Z suffix) would sort after a term that
  // ends exactly on election day and wrongly exclude it.
  const electionDate = electionDayFor(targetYear).slice(0, 10);

  for (const raceDoc of racesSnap.docs) {
    const race = { id: raceDoc.id, ...raceDoc.data() } as Race;
    // President/Governor candidates are not matched: congressional service does
    // not imply incumbency in those contests.
    if (race.office !== 'Senate' && race.office !== 'House') continue;
    const candidates = Array.isArray(race.candidates) ? race.candidates : [];
    let key: string;
    if (race.office === 'House') {
      const districtKey = normDistrictKey(race.district);
      if (!districtKey) continue; // unparseable district; skip rather than guess an at-large match
      key = `${race.state}|House|${districtKey}`;
    } else {
      key = `${race.state}|Senate`;
    }
    const bucket = index.get(key);
    if (!bucket || bucket.length === 0) continue;

    let raceNeedsUpdate = false;
    for (const candidate of candidates) {
      if (candidate.externalIds?.bioguideId) continue;
      const result = matchCandidate(candidate, bucket);
      if (result === 'ambiguous') {
        ambiguous += 1;
        console.warn(`[ambiguous] ${candidate.name} in ${race.id} — multiple legislator matches, skipped.`);
        continue;
      }
      if (!result) continue;
      candidate.externalIds = {
        ...(candidate.externalIds ?? {}),
        bioguideId: result.bioguideId,
        ...(fecIdForOffice(result.fecIds, race.office) ? { fecCandidateId: fecIdForOffice(result.fecIds, race.office)! } : {}),
      };
      if (candidate.incumbent === undefined && result.incumbentOn(electionDate)) {
        candidate.incumbent = true;
      }
      matched += 1;
      raceNeedsUpdate = true;
    }

    if (raceNeedsUpdate) {
      racesUpdated += 1;
      if (!dryRun) {
        batch.set(raceDoc.ref, { candidates, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        pending += 1;
        if (pending >= 400) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }
    }
  }

  if (!dryRun && pending > 0) await batch.commit();

  console.log(
    `${dryRun ? 'Planned' : 'Wrote'} externalIds for ${matched} candidates across ${racesUpdated} races (${ambiguous} ambiguous skipped).`,
  );
  if (!dryRun) {
    await db.collection('pipelineRuns').add({
      script: 'link-external-ids',
      year: targetYear,
      state: targetState,
      matched,
      ambiguous,
      racesUpdated,
      finishedAt: FieldValue.serverTimestamp(),
    });
  }
}

await main();
