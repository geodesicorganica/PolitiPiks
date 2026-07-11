/**
 * enrich-structured.ts
 *
 * Deterministic (non-LLM) research enrichment from official sources for
 * candidates whose externalIds.bioguideId is populated (run link-external-ids
 * first). Pulls member details and recent sponsored legislation from the
 * Congress.gov API and writes verifiable, source-attributed research buckets:
 *
 *   - identity: who they are (chamber, party, state, serving-since)
 *   - publicRecord: offices held, from term history
 *   - legislativeActivity: recent sponsored bills with latest actions
 *   - electionsHistory: service summary derived from term history
 *
 * Writes merge into races/{raceId}/candidateResearch/{candidateId}, preserving
 * buckets owned by other scripts (policyPositions/campaign from the Gemini pass).
 *
 * Usage:
 *   npm run enrich-structured -- [--year 2024] [--state GA] [--limit N] [--dry-run] [--force]
 * Env: CONGRESS_GOV_API_KEY (required; free at https://api.congress.gov/sign-up/),
 *      PROJECT_ID / FIREBASE_SERVICE_ACCOUNT / FIRESTORE_DATABASE_ID
 */
import process from 'node:process';
import { FieldValue } from '@google-cloud/firestore';
import { Candidate, CandidateResearch, Race, ResearchSection, ResearchSource } from '../src/types';
import { getArg, hasFlag, bootstrapFirestore } from './lib/firestoreCli.js';

// -----------------------------------------------------------------------------
// Congress.gov API
// -----------------------------------------------------------------------------

const CONGRESS_API = 'https://api.congress.gov/v3';

type MemberTerm = {
  chamber: string;
  startYear?: number;
  endYear?: number;
  stateName?: string;
  district?: number;
};

type MemberDetails = {
  directOrderName?: string;
  partyHistory?: Array<{ partyName?: string; startYear?: number }>;
  terms?: MemberTerm[];
  state?: string;
  officialWebsiteUrl?: string;
};

type SponsoredBill = {
  congress?: number;
  type?: string;
  number?: string | number;
  title?: string;
  introducedDate?: string;
  latestAction?: { text?: string; actionDate?: string };
};

async function congressGet<T>(path: string, apiKey: string): Promise<T | null> {
  const url = `${CONGRESS_API}${path}${path.includes('?') ? '&' : '?'}format=json&api_key=${apiKey}`;
  const resp = await fetch(url);
  if (resp.status === 404) return null;
  if (resp.status === 429) throw new Error('Congress.gov rate limit hit (429) — re-run later or lower volume.');
  if (!resp.ok) throw new Error(`Congress.gov ${resp.status} for ${path}`);
  return (await resp.json()) as T;
}

async function fetchMember(bioguideId: string, apiKey: string): Promise<MemberDetails | null> {
  const json = await congressGet<{ member?: MemberDetails }>(`/member/${bioguideId}`, apiKey);
  return json?.member ?? null;
}

async function fetchSponsoredBills(bioguideId: string, apiKey: string): Promise<{ bills: SponsoredBill[]; total: number }> {
  const json = await congressGet<{ sponsoredLegislation?: SponsoredBill[]; pagination?: { count?: number } }>(
    `/member/${bioguideId}/sponsored-legislation?limit=5`,
    apiKey,
  );
  return { bills: json?.sponsoredLegislation ?? [], total: json?.pagination?.count ?? 0 };
}

// -----------------------------------------------------------------------------
// Bucket construction
// -----------------------------------------------------------------------------

function chamberLabel(chamber: string) {
  return chamber.toLowerCase().includes('senate') ? 'U.S. Senate' : 'U.S. House of Representatives';
}

function memberSourceId(bioguideId: string) {
  return `congress-gov-${bioguideId}`;
}

function buildBuckets(
  candidate: Candidate,
  member: MemberDetails,
  sponsored: { bills: SponsoredBill[]; total: number },
): { buckets: Partial<Record<string, ResearchSection[]>>; sources: ResearchSource[] } {
  const bioguideId = candidate.externalIds!.bioguideId!;
  const sourceId = memberSourceId(bioguideId);
  const memberUrl = `https://www.congress.gov/member/${bioguideId}`;
  const now = new Date().toISOString();
  const sources: ResearchSource[] = [
    { id: sourceId, label: `Congress.gov — ${member.directOrderName ?? candidate.name}`, url: memberUrl, type: 'official', retrievedAt: now },
  ];

  const terms = member.terms ?? [];
  const firstYear = terms.reduce<number | null>((min, t) => (t.startYear && (!min || t.startYear < min) ? t.startYear : min), null);
  const currentParty = member.partyHistory?.[member.partyHistory.length - 1]?.partyName ?? candidate.party;

  const identity: ResearchSection[] = [{
    title: 'Congressional Profile',
    body: `${member.directOrderName ?? candidate.name} is a ${currentParty} member of Congress from ${member.state ?? candidate.name}${firstYear ? `, serving since ${firstYear}` : ''}.`,
    links: [{ label: 'Congress.gov Member Page', url: memberUrl, sourceId }],
    sourceIds: [sourceId],
  }];

  const officesHeld = terms.map((t) => {
    const range = t.startYear ? `${t.startYear}–${t.endYear ?? 'present'}` : '';
    const seat = t.district ? ` (District ${t.district})` : '';
    return `${chamberLabel(t.chamber)}${seat}, ${t.stateName ?? ''} ${range}`.replace(/\s+/g, ' ').trim();
  });
  const publicRecord: ResearchSection[] = officesHeld.length > 0 ? [{
    title: 'Offices Held',
    bullets: dedupe(officesHeld),
    sourceIds: [sourceId],
  }] : [];

  const billBullets = sponsored.bills
    .filter((b) => b.title)
    .map((b) => {
      const label = b.type && b.number ? `${b.type.toUpperCase()} ${b.number} (${b.congress}th Congress)` : 'Bill';
      const action = b.latestAction?.text ? ` Latest action: ${b.latestAction.text}` : '';
      return `Sponsored ${label}: ${b.title}.${action}`;
    });
  const legislativeActivity: ResearchSection[] = billBullets.length > 0 ? [{
    title: 'Recent Sponsored Legislation',
    body: sponsored.total > sponsored.bills.length
      ? `${sponsored.total} bills sponsored in total; the most recent are listed below.`
      : undefined,
    bullets: billBullets,
    sourceIds: [sourceId],
  }] : [];

  const chambers = dedupe(terms.map((t) => chamberLabel(t.chamber)));
  const electionsHistory: ResearchSection[] = firstYear ? [{
    title: 'Service History',
    body: `First elected to Congress in ${firstYear}; has served ${terms.length} term${terms.length === 1 ? '' : 's'} in the ${chambers.join(' and ')}.`,
    sourceIds: [sourceId],
  }] : [];

  const buckets: Partial<Record<string, ResearchSection[]>> = {};
  if (identity.length) buckets.identity = identity;
  if (publicRecord.length) buckets.publicRecord = publicRecord;
  if (legislativeActivity.length) buckets.legislativeActivity = legislativeActivity;
  if (electionsHistory.length) buckets.electionsHistory = electionsHistory;
  return { buckets, sources };
}

function dedupe(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function mergeSources(existing: ResearchSource[] | undefined, added: ResearchSource[]) {
  const byUrl = new Map<string, ResearchSource>();
  for (const s of [...(existing ?? []), ...added]) {
    if (s.url && !byUrl.has(s.url)) byUrl.set(s.url, s);
  }
  return Array.from(byUrl.values());
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

async function main() {
  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const targetYear = parseInt(getArg('--year') ?? '2024', 10);
  const targetState = getArg('--state')?.toUpperCase() ?? null;
  const limitArg = getArg('--limit');
  const limit = limitArg ? parseInt(limitArg, 10) : Infinity;

  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) {
    throw new Error('CONGRESS_GOV_API_KEY is required. Get a free key at https://api.congress.gov/sign-up/');
  }

  const { db } = bootstrapFirestore();

  let racesQuery: FirebaseFirestore.Query = db.collection('races').where('electionYear', '==', targetYear);
  if (targetState) racesQuery = racesQuery.where('state', '==', targetState);
  const racesSnap = await racesQuery.get();
  console.log(`Found ${racesSnap.size} races.`);

  let enriched = 0;
  let skippedFresh = 0;
  let noBioguide = 0;
  let failures = 0;
  const memberCache = new Map<string, { member: MemberDetails; sponsored: { bills: SponsoredBill[]; total: number } } | null>();

  outer: for (const raceDoc of racesSnap.docs) {
    const race = { id: raceDoc.id, ...raceDoc.data() } as Race;
    for (const candidate of race.candidates ?? []) {
      const bioguideId = candidate.externalIds?.bioguideId;
      if (!bioguideId) {
        noBioguide += 1;
        continue;
      }

      const researchRef = db.doc(`races/${race.id}/candidateResearch/${candidate.id}`);
      const existingSnap = await researchRef.get();
      const existing = existingSnap.exists ? (existingSnap.data() as CandidateResearch & { structuredEnrichedAt?: string }) : null;
      if (!force && existing?.structuredEnrichedAt) {
        const age = Date.now() - new Date(existing.structuredEnrichedAt).getTime();
        if (age < FRESHNESS_MS) {
          skippedFresh += 1;
          continue;
        }
      }

      try {
        let data = memberCache.get(bioguideId);
        if (data === undefined) {
          const member = await fetchMember(bioguideId, apiKey);
          if (!member) {
            memberCache.set(bioguideId, null);
            continue;
          }
          const sponsored = await fetchSponsoredBills(bioguideId, apiKey);
          data = { member, sponsored };
          memberCache.set(bioguideId, data);
          // Congress.gov allows 5000 req/hour; stay well under it.
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        if (!data) continue;

        const { buckets, sources } = buildBuckets(candidate, data.member, data.sponsored);
        const update: Record<string, unknown> = {
          candidateId: candidate.id,
          raceId: race.id,
          buckets,
          sources: mergeSources(existing?.sources, sources),
          structuredEnrichedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!dryRun) {
          await researchRef.set(update, { merge: true });
        }
        enriched += 1;
        if (enriched % 25 === 0) console.log(`Enriched ${enriched} candidates...`);
        if (enriched >= limit) {
          console.log(`--limit reached (${limit}). Stopping.`);
          break outer;
        }
      } catch (err) {
        failures += 1;
        console.error(`Failed for ${candidate.name} (${bioguideId}):`, err instanceof Error ? err.message : err);
        if (err instanceof Error && err.message.includes('429')) break outer;
      }
    }
  }

  console.log(
    `${dryRun ? 'Planned' : 'Wrote'} structured research for ${enriched} candidates (fresh-skipped=${skippedFresh}, no-bioguide=${noBioguide}, failures=${failures}).`,
  );
  if (!dryRun) {
    await db.collection('pipelineRuns').add({
      script: 'enrich-structured',
      year: targetYear,
      state: targetState,
      enriched,
      skippedFresh,
      noBioguide,
      failures,
      finishedAt: FieldValue.serverTimestamp(),
    });
  }
}

await main();
