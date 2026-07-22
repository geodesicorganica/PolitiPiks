/**
 * Source-backed federal campaign-finance enrichment. This script deliberately
 * stores aggregate FEC facts and links, not contributor-level records.
 *
 * Usage:
 *   npx tsx scripts/enrich-fec-finance.ts --year 2026 [--state GA]
 *     [--limit 25] [--max-calls 900] [--dry-run] [--force]
 */
import process from 'node:process';
import { FieldValue } from '@google-cloud/firestore';
import { CandidateResearch, Race, ResearchSource } from '../src/types';
import { bootstrapFirestore, getArg, hasFlag } from './lib/firestoreCli.js';
import {
  buildFecFilingResearch,
  buildFecFinanceResearch,
  type FecCandidateTotal,
  type FecCommittee,
  type FecFinanceResult,
  type FecIndependentExpenditure,
} from './lib/fecFinance.js';

const FEC_API = 'https://api.open.fec.gov/v1';
const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;
const CALL_SPACING_MS = Number(process.env.FEC_CALL_SPACING_MS ?? '3700');

let calls = 0;
let maxCalls = Infinity;
let lastCallAt = 0;

class CallBudgetExhausted extends Error {}

async function fecGetAll<T>(path: string, apiKey: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let pages = 1;
  do {
    if (calls >= maxCalls) throw new CallBudgetExhausted(`FEC call budget (${maxCalls}) exhausted.`);
    const wait = lastCallAt + CALL_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    calls += 1;
    lastCallAt = Date.now();
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${FEC_API}${path}${separator}api_key=${encodeURIComponent(apiKey)}&page=${page}&per_page=100`);
    if (response.status === 429) throw new Error('FEC API rate limit hit (429); re-run after the hourly window resets.');
    if (!response.ok) throw new Error(`FEC ${response.status} for ${path}`);
    const json = await response.json() as { results?: T[]; pagination?: { pages?: number } };
    results.push(...(json.results ?? []));
    pages = json.pagination?.pages ?? 1;
    page += 1;
  } while (page <= pages);
  return results;
}

async function fetchFinance(candidateId: string, cycle: number, apiKey: string): Promise<FecFinanceResult> {
  // Sequential calls keep the process under the ordinary api.data.gov hourly
  // allocation. Parallel requests would defeat CALL_SPACING_MS.
  const committees = await fecGetAll<FecCommittee>(`/candidate/${encodeURIComponent(candidateId)}/committees/?cycle=${cycle}`, apiKey);
  const totals = await fecGetAll<FecCandidateTotal>(`/candidate/${encodeURIComponent(candidateId)}/totals/?cycle=${cycle}&election_full=true`, apiKey);
  const independentExpenditures = await fecGetAll<FecIndependentExpenditure>(`/schedules/schedule_e/by_candidate/?candidate_id=${encodeURIComponent(candidateId)}&cycle=${cycle}`, apiKey);
  return { committees, totals, independentExpenditures };
}

function mergeSources(existing: ResearchSource[] | undefined, ...added: ResearchSource[]) {
  const sources = new Map<string, ResearchSource>();
  for (const source of [...(existing ?? []), ...added]) {
    const key = source.url || source.id || source.label;
    if (key) sources.set(key, source);
  }
  return Array.from(sources.values());
}

function isFresh(timestamp: string | undefined) {
  if (!timestamp) return false;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) && Date.now() - parsed < FRESHNESS_MS;
}

async function main() {
  const year = Number(getArg('--year') ?? '2026');
  const state = getArg('--state')?.toUpperCase() ?? null;
  const limit = Number(getArg('--limit') ?? 'Infinity');
  maxCalls = Number(getArg('--max-calls') ?? 'Infinity');
  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const apiKey = process.env.FEC_API_KEY;
  if (!apiKey) throw new Error('FEC_API_KEY is required.');
  if (!Number.isFinite(year) || year < 2000) throw new Error(`Invalid --year: ${year}`);
  if (!(Number.isFinite(limit) || limit === Infinity) || limit <= 0) throw new Error(`Invalid --limit: ${limit}`);
  if (!(Number.isFinite(maxCalls) || maxCalls === Infinity) || maxCalls <= 0) throw new Error(`Invalid --max-calls: ${maxCalls}`);

  const { db, projectId, databaseId } = bootstrapFirestore();
  let query: FirebaseFirestore.Query = db.collection('races').where('electionYear', '==', year);
  if (state) query = query.where('state', '==', state);
  const snap = await query.get();
  console.log(`Found ${snap.size} races. project=${projectId}, database=${databaseId}, year=${year}${state ? `, state=${state}` : ''}.`);

  let enriched = 0;
  let profileOnly = 0;
  let skippedFresh = 0;
  let noFecId = 0;
  let failures = 0;
  let stoppedForBudget = false;

  outer: for (const raceDoc of snap.docs) {
    const race = { id: raceDoc.id, ...raceDoc.data() } as Race;
    for (const candidate of race.candidates ?? []) {
      const fecCandidateId = candidate.externalIds?.fecCandidateId;
      if (!fecCandidateId) {
        noFecId += 1;
        continue;
      }
      const ref = db.doc(`races/${race.id}/candidateResearch/${candidate.id}`);
      const existingSnap = await ref.get();
      const existing = existingSnap.exists
        ? existingSnap.data() as CandidateResearch & { fecFinanceEnrichedAt?: string; fecProfileEnrichedAt?: string }
        : null;
      const financeFresh = isFresh(existing?.fecFinanceEnrichedAt);
      const profileFresh = isFresh(existing?.fecProfileEnrichedAt);
      if (!force && financeFresh && profileFresh) {
        skippedFresh += 1;
        continue;
      }

      if (!force && financeFresh && !profileFresh) {
        const filing = buildFecFilingResearch(candidate, race);
        const update = {
          candidateId: candidate.id,
          raceId: race.id,
          buckets: { campaign: [filing.section] },
          sources: mergeSources(existing?.sources, filing.source),
          fecProfileEnrichedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!dryRun) await ref.set(update, { merge: true });
        profileOnly += 1;
        if ((enriched + profileOnly) % 25 === 0) {
          console.log(`${dryRun ? 'Planned' : 'Enriched'} ${enriched + profileOnly} candidates...`);
        }
        if (enriched + profileOnly >= limit) break outer;
        continue;
      }

      try {
        const finance = await fetchFinance(fecCandidateId, year, apiKey);
        const financeResearch = buildFecFinanceResearch(candidate, race, finance);
        const filingResearch = buildFecFilingResearch(candidate, race, finance.committees);
        const update = {
          candidateId: candidate.id,
          raceId: race.id,
          buckets: {
            campaign: [filingResearch.section],
            campaignFinance: [financeResearch.section],
          },
          sources: mergeSources(existing?.sources, financeResearch.source, filingResearch.source),
          fecFinanceEnrichedAt: new Date().toISOString(),
          fecProfileEnrichedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!dryRun) await ref.set(update, { merge: true });
        enriched += 1;
        if (enriched % 25 === 0) console.log(`${dryRun ? 'Planned' : 'Enriched'} ${enriched} candidates...`);
        if (enriched + profileOnly >= limit) break outer;
      } catch (error) {
        if (error instanceof CallBudgetExhausted) {
          console.log(error.message);
          stoppedForBudget = true;
          break outer;
        }
        failures += 1;
        console.error(`Failed FEC enrichment for ${candidate.name} (${fecCandidateId}):`, error instanceof Error ? error.message : error);
      }
    }
  }

  console.log(`${dryRun ? '[Dry Run] ' : ''}FEC finance: enriched=${enriched}, profile-only=${profileOnly}, fresh-skipped=${skippedFresh}, no-fec-id=${noFecId}, failures=${failures}, calls=${calls}, budget-stop=${stoppedForBudget}.`);
  if (!dryRun) {
    await db.collection('pipelineRuns').add({
      script: 'enrich-fec-finance', year, state, enriched, profileOnly, skippedFresh, noFecId, failures, calls, stoppedForBudget,
      finishedAt: FieldValue.serverTimestamp(),
    });
  }
}

await main();
