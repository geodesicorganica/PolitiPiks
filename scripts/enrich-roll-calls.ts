/**
 * Adds recent official House and Senate roll-call actions to candidate research.
 * House data comes from Congress.gov; Senate data comes from Senate.gov XML.
 *
 * Usage:
 *   npx tsx scripts/enrich-roll-calls.ts --year 2026 [--state GA]
 *     [--chamber house|senate|both] [--max-votes 20] [--dry-run]
 */
import process from 'node:process';
import { FieldValue } from '@google-cloud/firestore';
import { CandidateResearch, Race, ResearchSource } from '../src/types';
import { bootstrapFirestore, getArg, hasFlag } from './lib/firestoreCli.js';
import {
  buildVoteRecordResearch,
  parseSenateVoteMenu,
  parseSenateVoteXml,
  type RollCall,
  type RollCallMember,
} from './lib/rollCalls.js';

const CONGRESS_API = 'https://api.congress.gov/v3';

function congressForYear(year: number) {
  return Math.floor((year - 1789) / 2) + 1;
}

function sessionForYear(year: number) {
  return year % 2 === 1 ? 1 : 2;
}

async function congressGet<T>(path: string, apiKey: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${CONGRESS_API}${path}${separator}format=json&api_key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`Congress.gov ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

type HouseVoteListItem = {
  congress: number;
  sessionNumber: number;
  rollCallNumber: number;
  legislationNumber?: string;
  legislationType?: string;
  result?: string;
  startDate?: string;
  sourceDataURL?: string;
  legislationUrl?: string;
  voteType?: string;
};

type HouseMemberResult = {
  bioguideID?: string;
  firstName?: string;
  lastName?: string;
  voteCast?: string;
  voteState?: string;
};

async function fetchHouseVotes(congress: number, session: number, maxVotes: number, apiKey: string): Promise<RollCall[]> {
  const list = await congressGet<{ houseRollCallVotes?: HouseVoteListItem[] }>(
    `/house-vote/${congress}/${session}?limit=${maxVotes}`,
    apiKey,
  );
  const votes: RollCall[] = [];
  for (const vote of list.houseRollCallVotes ?? []) {
    const details = await congressGet<{ houseRollCallVoteMemberVotes?: { results?: HouseMemberResult[] } }>(
      `/house-vote/${congress}/${session}/${vote.rollCallNumber}/members?limit=500`,
      apiKey,
    );
    const members: RollCallMember[] = (details.houseRollCallVoteMemberVotes?.results ?? []).map((member) => ({
      bioguideId: member.bioguideID,
      firstName: member.firstName,
      lastName: member.lastName,
      state: member.voteState,
      voteCast: member.voteCast,
    }));
    votes.push({
      chamber: 'House', congress, session, rollNumber: vote.rollCallNumber,
      date: vote.startDate,
      issue: vote.legislationType && vote.legislationNumber ? `${vote.legislationType} ${vote.legislationNumber}` : vote.voteType,
      title: vote.voteType,
      result: vote.result,
      sourceUrl: vote.sourceDataURL ?? vote.legislationUrl ?? `https://clerk.house.gov/Votes/${congress}${vote.rollCallNumber}`,
      members,
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return votes;
}

async function fetchSenateVotes(congress: number, session: number, maxVotes: number): Promise<RollCall[]> {
  const menuUrl = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
  const menuResponse = await fetch(menuUrl);
  if (!menuResponse.ok) throw new Error(`Senate.gov ${menuResponse.status} for vote menu.`);
  const menu = parseSenateVoteMenu(await menuResponse.text()).slice(0, maxVotes);
  const votes: RollCall[] = [];
  for (const item of menu) {
    const padded = String(item.rollNumber).padStart(5, '0');
    const sourceUrl = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${padded}.xml`;
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Senate.gov ${response.status} for roll call ${item.rollNumber}.`);
    votes.push(parseSenateVoteXml(await response.text(), sourceUrl));
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return votes;
}

function mergeSources(existing: ResearchSource[] | undefined, added: ResearchSource[]) {
  const sources = new Map<string, ResearchSource>();
  for (const source of [...(existing ?? []), ...added]) {
    const key = source.url || source.id || source.label;
    if (key) sources.set(key, source);
  }
  return Array.from(sources.values());
}

async function main() {
  const year = Number(getArg('--year') ?? new Date().getUTCFullYear());
  const state = getArg('--state')?.toUpperCase() ?? null;
  const chamber = (getArg('--chamber') ?? 'both').toLowerCase();
  const maxVotes = Number(getArg('--max-votes') ?? '20');
  const dryRun = hasFlag('--dry-run');
  if (!['house', 'senate', 'both'].includes(chamber)) throw new Error(`Invalid --chamber: ${chamber}`);
  if (!Number.isFinite(maxVotes) || maxVotes <= 0 || maxVotes > 100) throw new Error(`Invalid --max-votes: ${maxVotes}`);

  const congress = congressForYear(year);
  const session = sessionForYear(year);
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if ((chamber === 'house' || chamber === 'both') && !apiKey) throw new Error('CONGRESS_GOV_API_KEY is required for House votes.');
  const { db, projectId, databaseId } = bootstrapFirestore();

  const [houseVotes, senateVotes] = await Promise.all([
    chamber === 'house' || chamber === 'both' ? fetchHouseVotes(congress, session, maxVotes, apiKey!) : Promise.resolve([]),
    chamber === 'senate' || chamber === 'both' ? fetchSenateVotes(congress, session, maxVotes) : Promise.resolve([]),
  ]);
  console.log(`Loaded official roll calls: House=${houseVotes.length}, Senate=${senateVotes.length}.`);

  let query: FirebaseFirestore.Query = db.collection('races').where('electionYear', '==', year);
  if (state) query = query.where('state', '==', state);
  const racesSnap = await query.get();
  let candidatesUpdated = 0;
  let candidatesWithoutVotes = 0;
  for (const raceDoc of racesSnap.docs) {
    const race = { id: raceDoc.id, ...raceDoc.data() } as Race;
    const votes = race.office === 'House' ? houseVotes : race.office === 'Senate' ? senateVotes : [];
    if (votes.length === 0) continue;
    for (const candidate of race.candidates ?? []) {
      const { section, sources } = buildVoteRecordResearch(candidate, votes);
      if (!section) {
        candidatesWithoutVotes += 1;
        continue;
      }
      const ref = db.doc(`races/${race.id}/candidateResearch/${candidate.id}`);
      const existingSnap = await ref.get();
      const existing = existingSnap.exists ? existingSnap.data() as CandidateResearch : null;
      const update = {
        candidateId: candidate.id,
        raceId: race.id,
        buckets: { voteRecord: [section] },
        sources: mergeSources(existing?.sources, sources),
        rollCallsEnrichedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!dryRun) await ref.set(update, { merge: true });
      candidatesUpdated += 1;
    }
  }
  console.log(`${dryRun ? '[Dry Run] ' : ''}Roll-call enrichment: updated=${candidatesUpdated}, no-matching-votes=${candidatesWithoutVotes}, project=${projectId}, database=${databaseId}.`);
  if (!dryRun) {
    await db.collection('pipelineRuns').add({
      script: 'enrich-roll-calls', year, state, chamber, maxVotes, candidatesUpdated, candidatesWithoutVotes,
      finishedAt: FieldValue.serverTimestamp(),
    });
  }
}

await main();
