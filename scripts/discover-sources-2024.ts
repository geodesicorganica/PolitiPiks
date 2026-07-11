import { existsSync } from 'node:fs';
import process from 'node:process';
import { GoogleGenAI, Type } from '@google/genai';
import { BallotMeasure, Candidate, Race } from '../src/types';
import dotenv from 'dotenv';
import { getArg, hasFlag, bootstrapFirestore } from './lib/firestoreCli.js';

if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
});

// Single knob for which Gemini model all enrichment scripts use.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

async function discoverCandidateSources(race: Race, candidate: Candidate): Promise<{ websiteUrl?: string; ballotpediaUrl?: string }> {
  const raceLabel = `${race.state} ${race.office}${race.district ? ` ${race.district}` : ''}`.trim();
  const query = `Find the official campaign website URL and Ballotpedia profile URL for ${candidate.name}, the ${candidate.party} candidate for ${raceLabel} in the 2024 elections. Return only valid URLs if found, or null if not found.`;
  
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: query,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            websiteUrl: { type: Type.STRING, nullable: true },
            ballotpediaUrl: { type: Type.STRING, nullable: true },
          },
        },
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return data;
    }
  } catch (err) {
    console.error(`Error querying Gemini for candidate ${candidate.name}:`, err);
  }
  return {};
}

async function discoverMeasureSources(measure: BallotMeasure): Promise<{ fullTextUrl?: string; ballotpediaUrl?: string }> {
  const query = `Find the official state government full text URL and Ballotpedia profile URL for the 2024 ballot measure: ${measure.state} ${measure.title}. Return only valid URLs if found, or null if not found.`;
  
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: query,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fullTextUrl: { type: Type.STRING, nullable: true },
            ballotpediaUrl: { type: Type.STRING, nullable: true },
          },
        },
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return data;
    }
  } catch (err) {
    console.error(`Error querying Gemini for measure ${measure.title}:`, err);
  }
  return {};
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const { db } = bootstrapFirestore();

  console.log(`Starting broader source discovery... (Dry Run: ${dryRun})`);

  let batch = db.batch();
  let pendingWrites = 0;
  let candidatesUpdated = 0;
  let measuresUpdated = 0;

  // Process Races/Candidates
  const racesSnap = await db.collection('races').where('electionYear', '==', 2024).get();
  for (const raceDoc of racesSnap.docs) {
    const race = { id: raceDoc.id, ...raceDoc.data() } as Race;
    const candidates = Array.isArray(race.candidates) ? race.candidates : [];
    
    let raceNeedsUpdate = false;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c.websiteUrl || !c.ballotpediaUrl) {
        console.log(`Discovering sources for Candidate: ${c.name} (${race.id})`);
        const sources = await discoverCandidateSources(race, c);
        
        let candidateNeedsUpdate = false;
        if (sources.websiteUrl && !c.websiteUrl && sources.websiteUrl.startsWith('http')) {
          c.websiteUrl = sources.websiteUrl;
          candidateNeedsUpdate = true;
        }
        if (sources.ballotpediaUrl && !c.ballotpediaUrl && sources.ballotpediaUrl.startsWith('http')) {
          c.ballotpediaUrl = sources.ballotpediaUrl;
          candidateNeedsUpdate = true;
        }
        
        if (candidateNeedsUpdate) {
          console.log(`  -> Found: website=${c.websiteUrl}, ballotpedia=${c.ballotpediaUrl}`);
          candidatesUpdated++;
          raceNeedsUpdate = true;
        }
      }
    }
    
    if (raceNeedsUpdate && !dryRun) {
      batch.set(raceDoc.ref, { candidates }, { merge: true });
      pendingWrites++;
    }
  }

  // Process Measures
  const measuresSnap = await db.collection('ballotMeasures').where('electionYear', '==', 2024).get();
  for (const measureDoc of measuresSnap.docs) {
    const measure = { id: measureDoc.id, ...measureDoc.data() } as BallotMeasure;
    
    if (!measure.fullTextUrl || !measure.ballotpediaUrl) {
      console.log(`Discovering sources for Measure: ${measure.title} (${measure.id})`);
      const sources = await discoverMeasureSources(measure);
      
      let measureNeedsUpdate = false;
      const updates: Partial<BallotMeasure> = {};
      
      if (sources.fullTextUrl && !measure.fullTextUrl && sources.fullTextUrl.startsWith('http')) {
        updates.fullTextUrl = sources.fullTextUrl;
        measureNeedsUpdate = true;
      }
      if (sources.ballotpediaUrl && !measure.ballotpediaUrl && sources.ballotpediaUrl.startsWith('http')) {
        updates.ballotpediaUrl = sources.ballotpediaUrl;
        measureNeedsUpdate = true;
      }
      
      if (measureNeedsUpdate) {
        console.log(`  -> Found: fullText=${updates.fullTextUrl}, ballotpedia=${updates.ballotpediaUrl}`);
        measuresUpdated++;
        if (!dryRun) {
          batch.set(measureDoc.ref, updates, { merge: true });
          pendingWrites++;
        }
      }
    }
    
    if (pendingWrites >= 400 && !dryRun) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (pendingWrites > 0 && !dryRun) {
    await batch.commit();
  }

  console.log(`Discovery complete. Candidates updated: ${candidatesUpdated}, Measures updated: ${measuresUpdated}.`);
}

await main();
