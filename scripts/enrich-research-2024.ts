import { readFileSync } from 'node:fs';
import process from 'node:process';
import { FieldValue, Firestore } from '@google-cloud/firestore';
import { BallotMeasure, Candidate, CandidateResearch, MeasureResearch, Race, ResearchSource } from '../src/types';

type ServiceAccount = Record<string, unknown>;
type WritePlan = {
  path: string;
  data: CandidateResearch | MeasureResearch;
};

const MEDSL_2024_SOURCE_URL = 'https://github.com/MEDSL/2024-elections-official';

function getArg(name: string) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function getServiceAccountPath() {
  return getArg('--service-account') ?? process.env.FIREBASE_SERVICE_ACCOUNT ?? null;
}

function getServiceAccount() {
  const serviceAccountPath = getServiceAccountPath();
  if (!serviceAccountPath) return null;
  const raw = readFileSync(serviceAccountPath, 'utf8');
  return JSON.parse(raw) as ServiceAccount;
}

function getDatabaseId() {
  const cliDb = getArg('--database') ?? getArg('--database-id');
  if (cliDb) return cliDb;
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;

  try {
    const firebaseJsonRaw = readFileSync('firebase.json', 'utf8');
    const firebaseJson = JSON.parse(firebaseJsonRaw);
    const db = firebaseJson?.firestore?.[0]?.database;
    if (typeof db === 'string' && db.length > 0) return db;
  } catch {
    // ignore
  }

  return '(default)';
}

function getProjectId(serviceAccount: ServiceAccount | null) {
  const cliProject = getArg('--project-id') ?? getArg('--project');
  if (cliProject) return cliProject;
  if (process.env.PROJECT_ID) return process.env.PROJECT_ID;
  if (typeof serviceAccount?.project_id === 'string' && serviceAccount.project_id.length > 0) {
    return serviceAccount.project_id;
  }

  throw new Error('Missing project id. Provide --project-id or set PROJECT_ID.');
}

function createFirestore(projectId: string, databaseId: string, serviceAccount: ServiceAccount | null) {
  if (!serviceAccount) {
    return new Firestore({ projectId, databaseId });
  }

  const clientEmail = serviceAccount.client_email;
  const privateKey = serviceAccount.private_key;
  if (typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
    throw new Error('Invalid service account JSON: expected client_email and private_key.');
  }

  return new Firestore({
    projectId,
    databaseId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function searchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function source(id: string, label: string, url: string, type: ResearchSource['type']): ResearchSource | null {
  if (!url) return null;
  return {
    id,
    label,
    url,
    type,
    retrievedAt: new Date().toISOString(),
  };
}

function uniqueSources(sources: Array<ResearchSource | null>) {
  const seen = new Set<string>();
  return sources.filter((item): item is ResearchSource => {
    if (!item || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function candidateResearchFor(race: Race, candidate: Candidate): CandidateResearch {
  const candidateName = asString(candidate.name);
  const raceLabel = `${race.state} ${race.office}${race.district ? ` ${race.district}` : ''}`.trim();
  const sources = uniqueSources([
    source('medsl-2024', 'MEDSL 2024 Official Election Data', MEDSL_2024_SOURCE_URL, 'civic-data'),
    source('campaign-site', 'Campaign Website', asString(candidate.websiteUrl), 'campaign'),
    source('ballotpedia', 'Ballotpedia Candidate Page', asString(candidate.ballotpediaUrl), 'aggregator'),
    source(
      'web-search',
      'Candidate Research Search',
      searchUrl(`${candidateName} ${raceLabel} 2024 candidate`),
      'other',
    ),
  ]);

  return {
    candidateId: candidate.id,
    raceId: race.id,
    sources,
    updatedAt: new Date().toISOString(),
  };
}

function measureResearchFor(measure: BallotMeasure): MeasureResearch {
  const title = measure.shortTitle || measure.title;
  const sources = uniqueSources([
    source('medsl-2024', 'MEDSL 2024 Official Election Data', MEDSL_2024_SOURCE_URL, 'civic-data'),
    source('official-text', 'Official Measure Text', asString(measure.fullTextUrl), 'official'),
    source('ballotpedia', 'Ballotpedia Measure Page', asString(measure.ballotpediaUrl), 'aggregator'),
    source('measure-search', 'Measure Research Search', searchUrl(`${measure.state} ${title} 2024 ballot measure`), 'other'),
  ]);

  return {
    measureId: measure.id,
    sources,
    updatedAt: new Date().toISOString(),
  };
}

async function existingPathSet(db: Firestore, collectionGroupName: 'candidateResearch' | 'research') {
  const snap = await db.collectionGroup(collectionGroupName).get();
  return new Set(snap.docs.map((doc) => doc.ref.path));
}

async function planCandidateResearch(db: Firestore, force: boolean) {
  const existing = force ? new Set<string>() : await existingPathSet(db, 'candidateResearch');
  const snap = await db.collection('races').where('electionYear', '==', 2024).get();
  const writes: WritePlan[] = [];

  for (const raceDoc of snap.docs) {
    const race = { id: raceDoc.id, ...raceDoc.data() } as Race;
    const candidates = Array.isArray(race.candidates) ? race.candidates : [];
    for (const candidate of candidates) {
      if (!candidate.id || !candidate.name) continue;
      const path = `races/${race.id}/candidateResearch/${candidate.id}`;
      if (existing.has(path)) continue;
      writes.push({
        path,
        data: candidateResearchFor(race, candidate),
      });
    }
  }

  return writes;
}

async function planMeasureResearch(db: Firestore, force: boolean) {
  const existing = force ? new Set<string>() : await existingPathSet(db, 'research');
  const snap = await db.collection('ballotMeasures').where('electionYear', '==', 2024).get();
  const writes: WritePlan[] = [];

  for (const measureDoc of snap.docs) {
    const measure = { id: measureDoc.id, ...measureDoc.data() } as BallotMeasure;
    const path = `ballotMeasures/${measure.id}/research/profile`;
    if (existing.has(path)) continue;
    writes.push({
      path,
      data: measureResearchFor(measure),
    });
  }

  return writes;
}

async function commitWrites(db: Firestore, writes: WritePlan[]) {
  let batch = db.batch();
  let pending = 0;
  let written = 0;

  for (const write of writes) {
    batch.set(
      db.doc(write.path),
      {
        ...write.data,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    pending += 1;
    written += 1;

    if (pending >= 450) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  return written;
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const serviceAccount = getServiceAccount();
  const projectId = getProjectId(serviceAccount);
  const databaseId = getDatabaseId();
  const db = createFirestore(projectId, databaseId, serviceAccount);

  const [candidateWrites, measureWrites] = await Promise.all([
    planCandidateResearch(db, force),
    planMeasureResearch(db, force),
  ]);
  const writes = [...candidateWrites, ...measureWrites];

  if (!dryRun) {
    await commitWrites(db, writes);
  }

  console.log(
    `${dryRun ? 'Planned' : 'Wrote'} research docs: candidate=${candidateWrites.length}, measure=${measureWrites.length}, total=${writes.length}, force=${force}, project=${projectId}, database=${databaseId}.`,
  );
}

await main();
