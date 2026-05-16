import express from "express";
import path from "path";
import { randomUUID } from "crypto";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { Candidate, Jurisdiction, Office, Race, RefreshCursor, RefreshJob, UnmatchedVoteRow } from "./src/types";
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
    billsScanned: 0,
    recordedVotesDiscovered: 0,
    unmatchedVoteRows: 0,
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

type RecordedVoteRef = {
  url: string;
  chamber: "House" | "Senate";
  congress: number;
  rollNumber: number;
  date: string;
  billId?: string;
  billTitle?: string;
};

type CongressBillItem = {
  congress: number;
  type: string;
  number: string;
  title?: string;
  actions?: { url?: string };
};

type CongressActionItem = {
  recordedVotes?: Array<{
    rollNumber: number;
    url: string;
    chamber: "House" | "Senate";
    congress: number;
    date: string;
  }>;
};

type BallotMeasureInput = {
  id: string;
  state: string;
  title: string;
  shortTitle?: string;
  description: string;
  status?: "upcoming" | "live" | "called";
  qualificationStatus?: "filed" | "circulating" | "qualified" | "on_ballot" | "withdrawn" | "failed";
  result?: "pass" | "fail";
  closeDate: string;
  electionDate?: string;
  measureNumber?: string;
  yesVotes?: number;
  noVotes?: number;
  fullTextUrl?: string;
  ballotpediaUrl?: string;
  externalIds?: {
    ballotpediaMeasureId?: string;
    stateMeasureId?: string;
  };
  source: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
};

function textValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]?.trim();
}

function extractSenateMembers(xml: string) {
  return [...xml.matchAll(/<member>([\s\S]*?)<\/member>/gi)].map((match) => {
    const fragment = match[1];
    return {
      memberName: textValue(fragment, "member_full"),
      state: textValue(fragment, "state"),
      vote: textValue(fragment, "vote_cast"),
    };
  });
}

function extractHouseMembers(xml: string) {
  return [...xml.matchAll(/<recorded-vote>([\s\S]*?)<\/recorded-vote>/gi)].map((match) => {
    const fragment = match[1];
    return {
      memberName: textValue(fragment, "legislator"),
      vote: textValue(fragment, "vote"),
    };
  });
}

function normalizeOfficialVote(rawVote?: string): "Yea" | "Nay" | "Present" | null {
  const vote = rawVote?.toLowerCase();
  if (!vote) return null;
  if (vote.includes("yea") || vote === "aye") return "Yea";
  if (vote.includes("nay") || vote === "no") return "Nay";
  if (vote.includes("present")) return "Present";
  return null;
}

function normalizePersonName(value?: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getCandidateIndex() {
  if (!db) return new Map<string, Candidate>();
  const snapshot = await db.collection("candidates").get();
  const index = new Map<string, Candidate>();
  snapshot.docs.forEach((doc) => {
    const candidate = { id: doc.id, ...doc.data() } as Candidate;
    [candidate.name, ...(candidate.aliases || [])]
      .map(normalizePersonName)
      .filter(Boolean)
      .forEach((key) => index.set(key, candidate));
  });
  return index;
}

async function recordUnmatchedVote(ref: RecordedVoteRef, member: { memberName?: string; state?: string; vote?: string }, reason: UnmatchedVoteRow["reason"]) {
  if (!db) return false;
  const normalizedName = normalizePersonName(member.memberName);
  const id = `${ref.chamber.toLowerCase()}-${ref.congress}-${ref.rollNumber}-${normalizedName || "missing-name"}-${reason}`;
  const record: UnmatchedVoteRow = {
    id,
    chamber: ref.chamber,
    congress: ref.congress,
    rollNumber: ref.rollNumber,
    memberName: member.memberName,
    state: member.state,
    rawVote: member.vote,
    normalizedName,
    reason,
    voteUrl: ref.url,
    source: ref.chamber === "House" ? "house-clerk" : "senate-roll-call",
    sourceUrl: ref.url,
    sourceUpdatedAt: ref.date,
    lastRefreshedAt: new Date().toISOString(),
    refreshStatus: "partial",
    verificationLevel: "official",
  };
  await db.collection("unmatchedVoteRows").doc(id).set(record, { merge: true });
  return true;
}

async function ingestRecordedVote(ref: RecordedVoteRef) {
  if (!db) return { written: 0, unmatched: 0 };
  const response = await fetch(ref.url);
  if (!response.ok) throw new Error(`Official vote fetch failed: ${response.status}`);
  const xml = await response.text();
  const members = ref.chamber === "Senate" ? extractSenateMembers(xml) : extractHouseMembers(xml);
  const candidateIndex = await getCandidateIndex();
  let written = 0;
  let unmatched = 0;

  for (const member of members) {
    const normalizedVote = normalizeOfficialVote(member.vote);
    if (!member.memberName) {
      if (await recordUnmatchedVote(ref, member, "missing_name")) unmatched += 1;
      continue;
    }

    const candidate = candidateIndex.get(normalizePersonName(member.memberName));
    if (!candidate) {
      if (await recordUnmatchedVote(ref, member, "unmatched_candidate")) unmatched += 1;
      continue;
    }

    if (!normalizedVote) {
      if (await recordUnmatchedVote(ref, member, "unsupported_vote")) unmatched += 1;
      continue;
    }

    const voteId = `${ref.chamber.toLowerCase()}-${ref.congress}-${ref.rollNumber}-${candidate.id}`;
    const record = {
      id: voteId,
      candidateId: candidate.id,
      billId: ref.billId,
      bill: ref.billTitle || ref.billId || `Roll Call ${ref.rollNumber}`,
      vote: normalizedVote,
      impact: `Official ${ref.chamber} roll call vote ${ref.rollNumber}.`,
      url: ref.url,
      date: ref.date,
      chamber: ref.chamber,
      congress: ref.congress,
      rollNumber: ref.rollNumber,
      source: ref.chamber === "House" ? "house-clerk" : "senate-roll-call",
      sourceUrl: ref.url,
      sourceUpdatedAt: ref.date,
      lastRefreshedAt: new Date().toISOString(),
      refreshStatus: "fresh",
      verificationLevel: "official",
    };

    await db.collection("votes").doc(voteId).set(record, { merge: true });
    written += 1;
  }

  return { written, unmatched };
}

async function getBillDiscoveryCursor(): Promise<RefreshCursor | null> {
  if (!db) return null;
  const snapshot = await db.collection("refreshCursors").doc("bill-discovery").get();
  return snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as RefreshCursor) : null;
}

async function saveBillDiscoveryCursor(lastProcessedAt: string) {
  if (!db) return;
  const cursor: RefreshCursor = {
    id: "bill-discovery",
    cursorType: "bill-discovery",
    lastProcessedAt,
    source: "congress-gov",
    lastRefreshedAt: new Date().toISOString(),
    refreshStatus: "fresh",
    verificationLevel: "official",
  };
  await db.collection("refreshCursors").doc(cursor.id).set(cursor, { merge: true });
}

async function fetchRecentBills(limit = 25): Promise<CongressBillItem[]> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) return [];
  const url = new URL("https://api.congress.gov/v3/bill");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("api_key", apiKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Congress.gov bill request failed: ${response.status}`);
  const payload = await response.json() as { bills?: CongressBillItem[] };
  return payload.bills || [];
}

async function fetchBillActions(actionsUrl?: string): Promise<CongressActionItem[]> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!actionsUrl || !apiKey) return [];
  const url = new URL(actionsUrl);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "250");
  url.searchParams.set("api_key", apiKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Congress.gov bill actions request failed: ${response.status}`);
  const payload = await response.json() as { actions?: CongressActionItem[] };
  return payload.actions || [];
}

async function discoverRecentRecordedVotes(job: RefreshJob) {
  const bills = await fetchRecentBills();
  const cursor = await getBillDiscoveryCursor();
  const previousCutoff = cursor?.lastProcessedAt ? Date.parse(cursor.lastProcessedAt) : 0;
  let discovered = 0;
  let newestActionDate = previousCutoff;

  for (const bill of bills) {
    const billId = `${bill.congress}-${bill.type}-${bill.number}`.toLowerCase();
    const actions = await fetchBillActions(bill.actions?.url);
    job.counts.billsScanned += 1;
    for (const action of actions) {
      for (const recordedVote of action.recordedVotes || []) {
        const recordedVoteTime = Date.parse(recordedVote.date);
        if (!Number.isNaN(recordedVoteTime) && recordedVoteTime <= previousCutoff) continue;
        const result = await ingestRecordedVote({
          url: recordedVote.url,
          chamber: recordedVote.chamber,
          congress: recordedVote.congress,
          rollNumber: recordedVote.rollNumber,
          date: recordedVote.date,
          billId,
          billTitle: bill.title,
        });
        job.counts.votes += result.written;
        job.counts.unmatchedVoteRows += result.unmatched;
        job.counts.recordedVotesDiscovered += 1;
        discovered += 1;
        if (!Number.isNaN(recordedVoteTime)) newestActionDate = Math.max(newestActionDate, recordedVoteTime);
      }
    }
  }

  if (newestActionDate > previousCutoff) {
    await saveBillDiscoveryCursor(new Date(newestActionDate).toISOString());
  }

  return discovered;
}

async function upsertBallotMeasures(measures: BallotMeasureInput[]) {
  if (!db) return 0;
  const batch = db.batch();
  for (const measure of measures) {
    batch.set(db.collection("measures").doc(measure.id), {
      ...measure,
      status: measure.status || "upcoming",
      category: "Statewide",
      lastRefreshedAt: new Date().toISOString(),
      refreshStatus: "fresh",
      verificationLevel: measure.source === "official-state" ? "official" : "derived",
    }, { merge: true });
  }
  await batch.commit();
  return measures.length;
}

async function runGlobalRefresh(jobId: string) {
  const job = refreshJobs.get(jobId);
  if (!job) return;

  job.status = "running";
  job.startedAt = new Date().toISOString();

  try {
    await syncFederalRoster(job);
    try {
      await discoverRecentRecordedVotes(job);
    } catch (error: any) {
      job.failures.push({ source: "recorded-vote-discovery", message: error?.message || "Recorded vote discovery failed" });
    }
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

  app.post("/api/ingest/recorded-vote", async (req, res) => {
    try {
      const ref = req.body as RecordedVoteRef;
      if (!ref?.url || !ref?.chamber || !ref?.congress || !ref?.rollNumber || !ref?.date) {
        return res.status(400).json({ error: "url, chamber, congress, rollNumber, and date are required" });
      }
      const result = await ingestRecordedVote(ref);
      res.json({ votesWritten: result.written, unmatchedVoteRows: result.unmatched });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Failed to ingest recorded vote" });
    }
  });

  app.post("/api/ingest/ballot-measures", async (req, res) => {
    try {
      const measures = req.body?.measures as BallotMeasureInput[] | undefined;
      if (!Array.isArray(measures) || measures.length === 0) {
        return res.status(400).json({ error: "measures array is required" });
      }
      const written = await upsertBallotMeasures(measures);
      res.json({ measuresWritten: written });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Failed to ingest ballot measures" });
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
