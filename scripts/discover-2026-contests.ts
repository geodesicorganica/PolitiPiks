/**
 * discover-2026-contests.ts
 *
 * Drafts the 2026 contests that have no free structured API — governor races and
 * statewide ballot measures — using Gemini with Google Search grounding, and
 * writes them to a HUMAN-REVIEWABLE JSON file (data/2026/curated-contests.json)
 * in the ingest SourcePayload shape. Nothing is written to Firestore by this
 * script: review/edit the file, then seed it with
 *
 *   npm run seed-2026-curated
 *
 * (Paid upgrade path: a Ballotpedia API key with the existing ballotpedia_state
 * ingest source replaces this curation flow entirely.)
 *
 * Usage:
 *   npm run discover-2026-contests -- [--states GA,TX] [--governors-only | --measures-only]
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL (default gemini-2.5-flash)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { getArg, hasFlag } from './lib/firestoreCli.js';
import { electionDayFor } from '../ingest/src/sources/medslCommon.js';

if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Single knob for which Gemini model all enrichment scripts use.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

const ELECTION_YEAR = 2026;
const CLOSE_DATE = electionDayFor(ELECTION_YEAR);
const OUTPUT_FILE = path.join('data', '2026', 'curated-contests.json');

// States electing governors in the 2026 cycle (regular four-year seats plus VT/NH two-year seats).
const GOVERNOR_STATES_2026 = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'FL', 'GA', 'HI', 'ID', 'IL', 'IA', 'KS',
  'ME', 'MD', 'MA', 'MI', 'MN', 'NE', 'NV', 'NH', 'NM', 'NY', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'VT', 'WI', 'WY',
];

const ALL_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID',
  'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC',
  'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
  'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY',
];

function slugId(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown';
}

function normPartyName(party: string) {
  const p = party.trim().toLowerCase();
  if (p.includes('democrat')) return 'Democrat';
  if (p.includes('republican')) return 'Republican';
  if (p.includes('independent')) return 'Independent';
  return 'Other';
}

const CALL_SPACING_MS = 4000;

async function geminiStructured(prompt: string, schema: object): Promise<any | null> {
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: schema as any,
        temperature: 0.1,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, CALL_SPACING_MS));
    if (!response.text) return null;
    return JSON.parse(response.text);
  } catch (err) {
    console.error(`Gemini error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function discoverGovernorRace(state: string) {
  const prompt = `List the declared major candidates in the ${ELECTION_YEAR} ${state} governor's race (United States midterm election, November ${ELECTION_YEAR}). Include only real, declared or officially filed candidates you can verify via search — primarily Democratic and Republican candidates, plus significant independents. If the field is not yet settled, list the declared candidates so far. Mark the sitting governor with isIncumbent only if they are running for re-election.`;
  const schema = {
    type: Type.OBJECT,
    properties: {
      candidates: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            party: { type: Type.STRING },
            isIncumbent: { type: Type.BOOLEAN },
          },
          required: ['name', 'party'],
        },
      },
      notes: { type: Type.STRING, nullable: true },
    },
    required: ['candidates'],
  };
  return geminiStructured(prompt, schema);
}

async function discoverMeasures(state: string) {
  const prompt = `List the statewide ballot measures certified or likely to appear on the ${state} ballot in the November ${ELECTION_YEAR} United States general election. Only include measures you can verify via search (certified by the state, referred by the legislature, or with qualified signatures). For each: official title or number, a one-sentence plain-English description, and its qualification status ("qualified" if certified for the ballot, "circulating" if still gathering signatures, "filed" otherwise). Return an empty list if none are verified yet.`;
  const schema = {
    type: Type.OBJECT,
    properties: {
      measures: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            qualificationStatus: { type: Type.STRING },
          },
          required: ['title', 'description'],
        },
      },
    },
    required: ['measures'],
  };
  return geminiStructured(prompt, schema);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required.');
  }
  const statesArg = getArg('--states');
  const stateFilter = statesArg ? statesArg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null;
  const governorsOnly = hasFlag('--governors-only');
  const measuresOnly = hasFlag('--measures-only');

  // Merge into the existing curated file so states can be discovered incrementally.
  let existing: { races: any[]; ballotMeasures: any[] } = { races: [], ballotMeasures: [] };
  if (existsSync(OUTPUT_FILE)) {
    existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
  }
  const racesById = new Map<string, any>(existing.races.map((r) => [r.id, r]));
  const measuresById = new Map<string, any>(existing.ballotMeasures.map((m) => [m.id, m]));

  if (!measuresOnly) {
    const states = GOVERNOR_STATES_2026.filter((s) => !stateFilter || stateFilter.includes(s));
    for (const state of states) {
      console.log(`[governor] ${state}...`);
      const result = await discoverGovernorRace(state);
      const candidates = (result?.candidates ?? [])
        .filter((c: any) => typeof c?.name === 'string' && c.name.trim() && typeof c?.party === 'string')
        .map((c: any) => {
          const party = normPartyName(c.party);
          return {
            id: slugId(`${c.name}-${party}`),
            name: c.name.trim(),
            party,
            ...(c.isIncumbent === true ? { incumbent: true } : {}),
          };
        });
      if (candidates.length === 0) {
        console.warn(`[governor] ${state}: no verified candidates found yet — skipped.`);
        continue;
      }
      const id = `${ELECTION_YEAR}-${state}-governor`;
      racesById.set(id, {
        id,
        state,
        office: 'Governor',
        district: null,
        electionYear: ELECTION_YEAR,
        mode: 'live',
        status: 'upcoming',
        closeDate: CLOSE_DATE,
        candidates,
      });
    }
  }

  if (!governorsOnly) {
    const states = ALL_STATES.filter((s) => !stateFilter || stateFilter.includes(s));
    for (const state of states) {
      console.log(`[measures] ${state}...`);
      const result = await discoverMeasures(state);
      for (const m of result?.measures ?? []) {
        if (typeof m?.title !== 'string' || !m.title.trim() || typeof m?.description !== 'string') continue;
        const id = `${ELECTION_YEAR}-${state}-measure-${slugId(m.title)}`;
        measuresById.set(id, {
          id,
          state,
          title: m.title.trim(),
          description: m.description.trim(),
          electionYear: ELECTION_YEAR,
          mode: 'live',
          status: 'upcoming',
          closeDate: CLOSE_DATE,
        });
      }
    }
  }

  const payload = {
    races: Array.from(racesById.values()).sort((a, b) => a.id.localeCompare(b.id)),
    ballotMeasures: Array.from(measuresById.values()).sort((a, b) => a.id.localeCompare(b.id)),
  };
  mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(
    `Wrote ${OUTPUT_FILE}: ${payload.races.length} governor races, ${payload.ballotMeasures.length} measures. ` +
    `REVIEW THE FILE, then seed with: npm run seed-2026-curated`,
  );
}

await main();
