/**
 * enrich-research.ts
 *
 * Gemini (with Google Search grounding) narrative enrichment for candidates and
 * ballot measures. Part of the hybrid pipeline:
 *   1. link-external-ids   — match candidates to bioguide/FEC IDs
 *   2. enrich-structured   — official facts from Congress.gov (identity,
 *                            publicRecord, legislativeActivity, electionsHistory)
 *   3. enrich-research     — THIS script: narrative buckets via Gemini
 *                            (policyPositions, campaign; plus publicRecord /
 *                            legislativeActivity only where no official data
 *                            exists; measure summary / supportOpposition /
 *                            fiscalEffects / legalHistory)
 *
 * Buckets that already contain Congress.gov-sourced sections are never
 * overwritten by Gemini output.
 *
 * Usage:
 *   npm run enrich-research -- [--year 2024] [--state GA] [--limit N] [--budget N]
 *     [--races-only | --measures-only] [--dry-run] [--force]
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL (default gemini-2.5-flash),
 *      PROJECT_ID / FIREBASE_SERVICE_ACCOUNT / FIRESTORE_DATABASE_ID
 */
import process from 'node:process';
import { FieldValue, Firestore } from '@google-cloud/firestore';
import { GoogleGenAI } from '@google/genai';
import { BallotMeasure, Candidate, CandidateResearch, MeasureResearch, Race, ResearchSection, ResearchSource } from '../src/types';
import { getArg, hasFlag, bootstrapFirestore } from './lib/firestoreCli.js';

// -----------------------------------------------------------------------------
// Gemini
// -----------------------------------------------------------------------------

const ai = new GoogleGenAI(process.env.GEMINI_API_KEY ? { apiKey: process.env.GEMINI_API_KEY } : {});

// Single knob for which Gemini model all enrichment scripts use.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

// Rate limiting: sleep between calls to respect the 15 RPM free-tier limit.
const CALL_SPACING_MS = 4000;

let geminiCallCount = 0;
let geminiBudget = Infinity;

class BudgetExhausted extends Error {}

async function geminiJson(prompt: string): Promise<any> {
  if (geminiCallCount >= geminiBudget) {
    throw new BudgetExhausted(`Gemini call budget (${geminiBudget}) exhausted.`);
  }
  geminiCallCount += 1;
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
    },
  });
  if (!response.text) throw new Error('No response text from Gemini');
  let rawText = response.text.trim();
  if (rawText.startsWith('```json')) rawText = rawText.replace(/^```json\n/, '').replace(/\n```$/, '');
  if (rawText.startsWith('```')) rawText = rawText.replace(/^```\n/, '').replace(/\n```$/, '');
  const parsed = JSON.parse(rawText);
  await new Promise((resolve) => setTimeout(resolve, CALL_SPACING_MS));
  return parsed;
}

async function enrichCandidate(candidate: Candidate, race: Race): Promise<any> {
  const raceLabel = `${race.state} ${race.office}${race.district ? ` District ${race.district}` : ''}`;
  const prompt = `Research the political candidate "${candidate.name}" running for ${raceLabel} in the ${race.electionYear} United States general election.
Extract their specific policy positions, campaign priorities/messaging, recent legislative activity (only if they held office), and public record (past offices or civic roles). Only include facts you can verify via search; use empty arrays when nothing verifiable is found. Provide the source URLs you actually used.

You MUST respond with ONLY a raw JSON object and nothing else. Do not use markdown code blocks. The JSON must exactly match this format:
{
  "policyPositions": ["position 1", "position 2"],
  "campaignSummary": "One-paragraph summary of their campaign message and priorities, or empty string.",
  "legislativeActivity": ["activity 1"],
  "publicRecord": ["record 1"],
  "sources": [{"url": "https...", "title": "Source title"}]
}`;
  console.log(`[Gemini] Candidate: ${candidate.name} (${race.id})`);
  return geminiJson(prompt);
}

async function enrichMeasure(measure: BallotMeasure): Promise<any> {
  const label = measure.shortTitle || measure.title;
  const prompt = `Research the ${measure.electionYear} ${measure.state} statewide ballot measure "${label}".
Summarize in plain English what it does, who supported and opposed it (organizations, officials, campaigns), its fiscal or implementation effects, and any legal or procedural history (how it got on the ballot, litigation, prior related measures). Only include facts you can verify via search; use empty strings/arrays when nothing verifiable is found. Provide the source URLs you actually used.

You MUST respond with ONLY a raw JSON object and nothing else. Do not use markdown code blocks. The JSON must exactly match this format:
{
  "plainSummary": "What the measure does, in plain English.",
  "supporters": ["supporter 1"],
  "opponents": ["opponent 1"],
  "supportOppositionSummary": "One-paragraph summary of the campaign dynamics, or empty string.",
  "fiscalEffects": "Fiscal/implementation effects, or empty string.",
  "legalHistory": "Legal and procedural history, or empty string.",
  "sources": [{"url": "https...", "title": "Source title"}]
}`;
  console.log(`[Gemini] Measure: ${label} (${measure.id})`);
  return geminiJson(prompt);
}

// -----------------------------------------------------------------------------
// Bucket assembly
// -----------------------------------------------------------------------------

function toSources(raw: any): ResearchSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s: any) => typeof s?.url === 'string' && s.url.startsWith('http'))
    .map((s: any) => ({
      id: s.url,
      label: typeof s.title === 'string' && s.title ? s.title : s.url,
      url: s.url,
      type: 'other' as const,
      retrievedAt: new Date().toISOString(),
    }));
}

function mergeSources(existing: ResearchSource[] | undefined, added: ResearchSource[]) {
  const byUrl = new Map<string, ResearchSource>();
  for (const s of [...(existing ?? []), ...added]) {
    if (s.url && !byUrl.has(s.url)) byUrl.set(s.url, s);
  }
  return Array.from(byUrl.values());
}

function stringArray(raw: any): string[] {
  return Array.isArray(raw) ? raw.filter((x: any) => typeof x === 'string' && x.trim().length > 0) : [];
}

/**
 * True if a bucket already holds sections attributed to an official source (the
 * Congress.gov enrich-structured pass). Deliberately excludes 'civic-data': the
 * deterministic MEDSL baseline cites a civic-data source and MUST be replaceable.
 */
function hasOfficialSections(existing: CandidateResearch | null, bucket: keyof NonNullable<CandidateResearch['buckets']>) {
  const sections = existing?.buckets?.[bucket];
  if (!sections || sections.length === 0) return false;
  const officialIds = new Set((existing?.sources ?? []).filter((s) => s.type === 'official').map((s) => s.id ?? s.url));
  return sections.some((section) => (section.sourceIds ?? []).some((id) => officialIds.has(id)));
}

const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(timestamp: string | undefined) {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < FRESHNESS_MS;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function processCandidates(db: Firestore, opts: {
  targetYear: number;
  targetState: string | null;
  force: boolean;
  dryRun: boolean;
  limit: number;
}) {
  let racesQuery: FirebaseFirestore.Query = db.collection('races').where('electionYear', '==', opts.targetYear);
  if (opts.targetState) racesQuery = racesQuery.where('state', '==', opts.targetState);
  const racesSnap = await racesQuery.get();
  console.log(`Found ${racesSnap.size} races.`);

  let enriched = 0;
  let skipped = 0;
  let failures = 0;

  outer: for (const raceDoc of racesSnap.docs) {
    const race = { id: raceDoc.id, ...raceDoc.data() } as Race;
    for (const candidate of race.candidates || []) {
      if (!candidate.id || !candidate.name) continue;
      const researchRef = db.doc(`races/${race.id}/candidateResearch/${candidate.id}`);
      const existingSnap = await researchRef.get();
      const existing = existingSnap.exists
        ? (existingSnap.data() as CandidateResearch & { narrativeEnrichedAt?: string })
        : null;

      if (!opts.force && isFresh(existing?.narrativeEnrichedAt)) {
        skipped += 1;
        continue;
      }

      try {
        const result = await enrichCandidate(candidate, race);
        const sources = toSources(result.sources);
        const sourceIds = sources.map((s) => s.id!);

        const buckets: Partial<Record<string, ResearchSection[]>> = {};
        const policyBullets = stringArray(result.policyPositions);
        if (policyBullets.length > 0) {
          buckets.policyPositions = [{ title: 'Policy Positions', bullets: policyBullets, sourceIds }];
        }
        if (typeof result.campaignSummary === 'string' && result.campaignSummary.trim()) {
          buckets.campaign = [{ title: 'Campaign', body: result.campaignSummary.trim(), sourceIds }];
        }
        // Only fill record/activity buckets when the official Congress.gov pass hasn't.
        const publicRecordBullets = stringArray(result.publicRecord);
        if (publicRecordBullets.length > 0 && !hasOfficialSections(existing, 'publicRecord')) {
          buckets.publicRecord = [{ title: 'Public Record', bullets: publicRecordBullets, sourceIds }];
        }
        const legislativeBullets = stringArray(result.legislativeActivity);
        if (legislativeBullets.length > 0 && !hasOfficialSections(existing, 'legislativeActivity')) {
          buckets.legislativeActivity = [{ title: 'Legislative Activity', bullets: legislativeBullets, sourceIds }];
        }

        if (Object.keys(buckets).length === 0 && sources.length === 0) {
          skipped += 1;
          continue;
        }

        const update = {
          candidateId: candidate.id,
          raceId: race.id,
          buckets,
          sources: mergeSources(existing?.sources, sources),
          narrativeEnrichedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!opts.dryRun) await researchRef.set(update, { merge: true });
        enriched += 1;
        if (enriched >= opts.limit) {
          console.log(`--limit reached (${opts.limit}). Stopping candidates.`);
          break outer;
        }
      } catch (err) {
        if (err instanceof BudgetExhausted) {
          console.log(err.message);
          break outer;
        }
        failures += 1;
        console.error(`Failed to enrich ${candidate.name}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return { enriched, skipped, failures };
}

async function processMeasures(db: Firestore, opts: {
  targetYear: number;
  targetState: string | null;
  force: boolean;
  dryRun: boolean;
  limit: number;
}) {
  let measuresQuery: FirebaseFirestore.Query = db.collection('ballotMeasures').where('electionYear', '==', opts.targetYear);
  if (opts.targetState) measuresQuery = measuresQuery.where('state', '==', opts.targetState);
  const measuresSnap = await measuresQuery.get();
  console.log(`Found ${measuresSnap.size} ballot measures.`);

  let enriched = 0;
  let skipped = 0;
  let failures = 0;

  for (const measureDoc of measuresSnap.docs) {
    const measure = { id: measureDoc.id, ...measureDoc.data() } as BallotMeasure;
    const researchRef = db.doc(`ballotMeasures/${measure.id}/research/profile`);
    const existingSnap = await researchRef.get();
    const existing = existingSnap.exists
      ? (existingSnap.data() as MeasureResearch & { narrativeEnrichedAt?: string })
      : null;

    if (!opts.force && isFresh(existing?.narrativeEnrichedAt)) {
      skipped += 1;
      continue;
    }

    try {
      const result = await enrichMeasure(measure);
      const sources = toSources(result.sources);
      const sourceIds = sources.map((s) => s.id!);

      const buckets: Partial<Record<string, ResearchSection[]>> = {};
      if (typeof result.plainSummary === 'string' && result.plainSummary.trim()) {
        buckets.summary = [{ title: measure.shortTitle || measure.title, body: result.plainSummary.trim(), sourceIds }];
      }
      const supporters = stringArray(result.supporters).map((s) => `Supports: ${s}`);
      const opponents = stringArray(result.opponents).map((s) => `Opposes: ${s}`);
      if (supporters.length + opponents.length > 0 || (typeof result.supportOppositionSummary === 'string' && result.supportOppositionSummary.trim())) {
        buckets.supportOpposition = [{
          title: 'Support and Opposition',
          body: typeof result.supportOppositionSummary === 'string' && result.supportOppositionSummary.trim() ? result.supportOppositionSummary.trim() : undefined,
          bullets: [...supporters, ...opponents],
          sourceIds,
        }];
      }
      if (typeof result.fiscalEffects === 'string' && result.fiscalEffects.trim()) {
        buckets.fiscalEffects = [{ title: 'Fiscal and Implementation Effects', body: result.fiscalEffects.trim(), sourceIds }];
      }
      if (typeof result.legalHistory === 'string' && result.legalHistory.trim()) {
        buckets.legalHistory = [{ title: 'Legal and Procedural History', body: result.legalHistory.trim(), sourceIds }];
      }

      if (Object.keys(buckets).length === 0 && sources.length === 0) {
        skipped += 1;
        continue;
      }

      const update = {
        measureId: measure.id,
        buckets,
        sources: mergeSources(existing?.sources, sources),
        narrativeEnrichedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!opts.dryRun) await researchRef.set(update, { merge: true });
      enriched += 1;
      if (enriched >= opts.limit) {
        console.log(`--limit reached (${opts.limit}). Stopping measures.`);
        break;
      }
    } catch (err) {
      if (err instanceof BudgetExhausted) {
        console.log(err.message);
        break;
      }
      failures += 1;
      console.error(`Failed to enrich measure ${measure.title}:`, err instanceof Error ? err.message : err);
    }
  }

  return { enriched, skipped, failures };
}

async function run() {
  const { db, projectId, databaseId } = bootstrapFirestore();

  const targetYear = parseInt(getArg('--year') ?? '2024', 10);
  const targetState = getArg('--state')?.toUpperCase() ?? null;
  const force = hasFlag('--force');
  const dryRun = hasFlag('--dry-run');
  const limitArg = getArg('--limit');
  const limit = limitArg ? parseInt(limitArg, 10) : Infinity;
  if (limitArg && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid --limit value: ${limitArg}`);
  }
  const budgetArg = getArg('--budget');
  geminiBudget = budgetArg ? parseInt(budgetArg, 10) : Infinity;
  const racesOnly = hasFlag('--races-only');
  const measuresOnly = hasFlag('--measures-only');

  console.log(`Starting narrative enrichment. project=${projectId}, database=${databaseId}, model=${GEMINI_MODEL}, year=${targetYear}${targetState ? `, state=${targetState}` : ''}${Number.isFinite(geminiBudget) ? `, budget=${geminiBudget} calls` : ''}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY environment variable is not set. Gemini API calls will fail.');
  }

  const opts = { targetYear, targetState, force, dryRun, limit };
  const candidateStats = measuresOnly ? { enriched: 0, skipped: 0, failures: 0 } : await processCandidates(db, opts);
  const measureStats = racesOnly ? { enriched: 0, skipped: 0, failures: 0 } : await processMeasures(db, opts);

  console.log(
    `${dryRun ? '[Dry Run] ' : ''}Done. Candidates: ${candidateStats.enriched} enriched, ${candidateStats.skipped} skipped, ${candidateStats.failures} failed. ` +
    `Measures: ${measureStats.enriched} enriched, ${measureStats.skipped} skipped, ${measureStats.failures} failed. ` +
    `Gemini calls: ${geminiCallCount}.`,
  );

  if (!dryRun) {
    await db.collection('pipelineRuns').add({
      script: 'enrich-research',
      year: targetYear,
      state: targetState,
      model: GEMINI_MODEL,
      candidates: candidateStats,
      measures: measureStats,
      geminiCalls: geminiCallCount,
      finishedAt: FieldValue.serverTimestamp(),
    });
  }
}

run().catch(console.error);
