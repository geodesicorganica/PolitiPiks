import express from "express";
import path from "path";
import { randomUUID } from "crypto";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { Candidate, Jurisdiction, Office, Race, RefreshJob } from "./src/types";
import { DATA_SOURCES, normalizeCandidateRecords, sortActivitiesRecentFirst, sortVotesRecentFirst } from "./src/lib/dataPlatform";

dotenv.config();

if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch {
    console.warn("Firebase Admin failed to initialize with default credentials. Some backend features may be limited.");
  }
}

const db = admin.apps.length ? admin.firestore() : null;
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
});
const refreshJobs = new Map<string, RefreshJob>();

function emptyCounts(): RefreshJob["counts"] {
  return {
    candidates: 0,
    races: 0,
    ballotMeasures: 0,
    bills: 0,
    votes: 0,
    activities: 0,
    raceStats: 0,
    offices: 0,
    jurisdictions: 0,
  };
}

async function readRaces(): Promise<Race[]> {
  if (!db) return [];
  const snapshot = await db.collection("races").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Race));
}

type CongressMemberItem = {
  bioguideId: string;
  name: string;
  partyName?: string;
  state?: string;
  district?: number;
  terms?: {
    item?: Array<{
      chamber?: string;
      stateCode?: string;
      district?: number;
      startYear?: number;
      endYear?: number;
    }>;
  };
  updateDate?: string;
  url?: string;
};

function normalizeParty(partyName?: string): Candidate["party"] {
  if (partyName === "Democratic") return "Democrat";
  if (partyName === "Republican") return "Republican";
  if (partyName === "Independent") return "Independent";
  return "Other";
}

async function fetchCongressMembers(): Promise<CongressMemberItem[]> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) return [];

  const members: CongressMemberItem[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL("https://api.congress.gov/v3/member");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "250");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Congress.gov member request failed: ${response.status}`);
    const payload = await response.json() as { members?: CongressMemberItem[]; pagination?: { next?: string } };
    members.push(...(payload.members || []));
    hasMore = Boolean(payload.pagination?.next);
    offset += 250;
  }

  return members;
}

async function syncFederalRoster(job: RefreshJob) {
  if (!db) return;
  const members = await fetchCongressMembers();
  if (!members.length) {
    job.failures.push({ source: "congress-gov", message: "CONGRESS_API_KEY missing or no federal members returned" });
    return;
  }

  const federalJurisdiction: Jurisdiction = {
    id: "jurisdiction-us",
    name: "United States",
    level: "federal",
    source: "congress-gov",
    sourceUrl: "https://api.congress.gov",
    lastRefreshedAt: new Date().toISOString(),
    refreshStatus: "fresh",
    verificationLevel: "official",
  };

  await db.collection("jurisdictions").doc(federalJurisdiction.id).set(federalJurisdiction, { merge: true });
  job.counts.jurisdictions += 1;

  const batch = db.batch();
  let officeCount = 0;
  let candidateCount = 0;

  for (const member of members) {
    const latestTerm = member.terms?.item?.find((term) => !term.endYear || term.endYear >= new Date().getFullYear());
    if (!latestTerm?.chamber) continue;

    const officeId = latestTerm.chamber === "House"
      ? `office-house-${latestTerm.stateCode || member.state}-${latestTerm.district ?? member.district ?? "at-large"}`
      : `office-senate-${latestTerm.stateCode || member.state}`;

    const office: Office = {
      id: officeId,
      title: latestTerm.chamber === "House" ? "House" : "Senate",
      jurisdictionId: federalJurisdiction.id,
      chamber: latestTerm.chamber === "House" ? "lower" : "upper",
      district: latestTerm.chamber === "House" ? String(latestTerm.district ?? member.district ?? "") : undefined,
      source: "congress-gov",
      sourceUrl: member.url,
      sourceUpdatedAt: member.updateDate,
      lastRefreshedAt: new Date().toISOString(),
      refreshStatus: "fresh",
      verificationLevel: "official",
    };

    const candidate: Candidate = {
      id: `candidate-${member.bioguideId}`,
      externalIds: { bioguideId: member.bioguideId },
      officeId,
      name: member.name,
      party: normalizeParty(member.partyName),
      source: "congress-gov",
      sourceUrl: member.url,
      sourceUpdatedAt: member.updateDate,
      lastRefreshedAt: new Date().toISOString(),
      refreshStatus: "fresh",
      verificationLevel: "official",
      isCurrentOfficeholder: true,
    };

    batch.set(db.collection("offices").doc(office.id), office, { merge: true });
    batch.set(db.collection("candidates").doc(candidate.id), candidate, { merge: true });
    officeCount += 1;
    candidateCount += 1;
  }

  await batch.commit();
  job.counts.offices += officeCount;
  job.counts.candidates += candidateCount;
}

async function runGlobalRefresh(jobId: string) {
  const job = refreshJobs.get(jobId);
  if (!job) return;

  job.status = "running";
  job.startedAt = new Date().toISOString();

  try {
    await syncFederalRoster(job);
    const races = await readRaces();
    job.counts.races = races.length;

    for (const race of races) {
      const normalizedCandidates = race.candidates.map((candidate) => normalizeCandidateRecords(candidate, race));
      job.counts.candidates += normalizedCandidates.length;
      job.counts.votes += normalizedCandidates.reduce((total, candidate) => total + (candidate.votes?.length || 0), 0);
      job.counts.activities += normalizedCandidates.reduce((total, candidate) => total + (candidate.activities?.length || 0), 0);

      if (db) {
        await db.collection("races").doc(race.id).set(
          {
            candidates: normalizedCandidates,
            lastRefreshedAt: new Date().toISOString(),
            refreshStatus: "fresh",
            source: race.source || "seed-normalized",
            verificationLevel: race.verificationLevel || "derived",
          },
          { merge: true },
        );
      }
    }

    if (db) {
      const measures = await db.collection("measures").get();
      job.counts.ballotMeasures = measures.size;
    }

    job.status = job.failures.length ? "partial" : "complete";
  } catch (error: any) {
    job.failures.push({ source: "global-refresh", message: error?.message || "Unknown refresh failure" });
    job.status = "failed";
  } finally {
    job.completedAt = new Date().toISOString();
    if (db) {
      await db.collection("refreshJobs").doc(job.id).set(job, { merge: true });
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/data-sources", (_req, res) => {
    res.json(DATA_SOURCES);
  });

  app.get("/api/races", async (_req, res) => {
    try {
      res.json(await readRaces());
    } catch {
      res.status(500).json({ error: "Failed to load races" });
    }
  });

  app.get("/api/ballot-measures", async (_req, res) => {
    try {
      if (!db) return res.json([]);
      const snapshot = await db.collection("measures").get();
      res.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } catch {
      res.status(500).json({ error: "Failed to load ballot measures" });
    }
  });

  app.get("/api/candidates/:id/votes", async (req, res) => {
    try {
      const races = await readRaces();
      for (const race of races) {
        const candidate = race.candidates.find((item) => item.id === req.params.id);
        if (candidate) {
          return res.json(sortVotesRecentFirst(normalizeCandidateRecords(candidate, race).votes));
        }
      }
      res.status(404).json({ error: "Candidate not found" });
    } catch {
      res.status(500).json({ error: "Failed to load candidate votes" });
    }
  });

  app.get("/api/candidates/:id/activities", async (req, res) => {
    try {
      const races = await readRaces();
      for (const race of races) {
        const candidate = race.candidates.find((item) => item.id === req.params.id);
        if (candidate) {
          return res.json(sortActivitiesRecentFirst(normalizeCandidateRecords(candidate, race).activities));
        }
      }
      res.status(404).json({ error: "Candidate not found" });
    } catch {
      res.status(500).json({ error: "Failed to load candidate activities" });
    }
  });

  app.post("/api/refresh/global", async (_req, res) => {
    const job: RefreshJob = {
      id: randomUUID(),
      status: "queued",
      requestedAt: new Date().toISOString(),
      counts: emptyCounts(),
      failures: [],
    };
    refreshJobs.set(job.id, job);
    if (db) await db.collection("refreshJobs").doc(job.id).set(job);
    void runGlobalRefresh(job.id);
    res.status(202).json(job);
  });

  app.get("/api/refresh/jobs/:id", async (req, res) => {
    const localJob = refreshJobs.get(req.params.id);
    if (localJob) return res.json(localJob);

    if (db) {
      const snapshot = await db.collection("refreshJobs").doc(req.params.id).get();
      if (snapshot.exists) return res.json(snapshot.data());
    }

    res.status(404).json({ error: "Refresh job not found" });
  });

  // AI is now enrichment-only. It no longer fabricates canonical vote history.
  app.post("/api/enrich-candidate", async (req, res) => {
    const { candidateName, currentOffice, state } = req.body;
    if (!candidateName) return res.status(400).json({ error: "Candidate name is required" });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Create an updated short biography and sentiment analysis for ${candidateName}, a candidate for ${currentOffice} in ${state || "the US"}. Do not invent votes or official legislative records.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              biography: { type: Type.STRING },
              sentimentData: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    value: { type: Type.NUMBER },
                  },
                  required: ["category", "value"],
                },
              },
            },
            required: ["biography", "sentimentData"],
          },
        },
      });

      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error("Gemini enrichment error:", error);
      if (error?.status === 429 || error?.code === 429 || error?.message?.includes("429")) {
        return res.status(429).json({ error: "Gemini API rate limit exceeded. Please try again later." });
      }
      res.status(500).json({ error: "Failed to enrich candidate data" });
    }
  });

  app.get("/api/verify-session", async (req, res) => {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) return res.status(401).json({ error: "No token provided" });
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      res.json({ uid: decodedToken.uid });
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
