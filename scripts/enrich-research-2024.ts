import { readFileSync } from 'node:fs';
import process from 'node:process';
import { FieldValue, Firestore } from '@google-cloud/firestore';
import { BallotMeasure, Candidate, CandidateResearch, MeasureResearch, Race, ResearchSection, ResearchSource } from '../src/types';

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

function link(label: string, url: string, sourceId?: string) {
  return url ? [{ label, url, sourceId }] : undefined;
}

function nonEmpty<T>(items: Array<T | null | undefined>) {
  return items.filter((item): item is T => Boolean(item));
}

function candidateIdentitySections(race: Race, candidate: Candidate): ResearchSection[] {
  const candidateName = asString(candidate.name);
  const raceLabel = `${race.state} ${race.office}${race.district ? ` ${race.district}` : ''}`.trim();
  const bullets = nonEmpty([
    `Party: ${candidate.party}`,
    `Office: ${raceLabel}`,
    race.electionYear ? `Election year: ${race.electionYear}` : null,
    candidate.incumbent ? 'Listed as incumbent in the contest data.' : null,
  ]);

  return [{
    title: 'Ballot Identity',
    body: `${candidateName} is listed as a ${candidate.party} candidate for ${raceLabel} in the 2024 sandbox contest data.`,
    bullets,
    sourceIds: ['medsl-2024'],
  }];
}

function candidateCampaignSections(candidate: Candidate): ResearchSection[] {
  const websiteUrl = asString(candidate.websiteUrl);
  const ballotpediaUrl = asString(candidate.ballotpediaUrl);
  const sections: ResearchSection[] = [];

  if (websiteUrl) {
    sections.push({
      title: 'Campaign Website',
      body: 'A campaign website URL is available from the candidate record.',
      links: link('Campaign Website', websiteUrl, 'campaign-site'),
      sourceIds: ['campaign-site'],
    });
  }

  if (ballotpediaUrl) {
    sections.push({
      title: 'Candidate Profile',
      body: 'A Ballotpedia candidate profile URL is available as an aggregator reference.',
      links: link('Ballotpedia Candidate Page', ballotpediaUrl, 'ballotpedia'),
      sourceIds: ['ballotpedia'],
    });
  }

  return sections;
}

function candidateElectionSections(race: Race): ResearchSection[] {
  const raceLabel = `${race.state} ${race.office}${race.district ? ` ${race.district}` : ''}`.trim();
  return [{
    title: 'Contest Context',
    body: `This candidate appears in the ${raceLabel} contest loaded from the 2024 official returns dataset for sandbox gameplay.`,
    bullets: nonEmpty([
      race.mode ? `Mode: ${race.mode}` : null,
      race.closeDate ? `Election date: ${race.closeDate}` : null,
    ]),
    sourceIds: ['medsl-2024'],
  }];
}

function measureSummarySections(measure: BallotMeasure): ResearchSection[] {
  const body = asString(measure.overview) || asString(measure.description);
  if (!body) return [];

  return [{
    title: measure.shortTitle || measure.title,
    body,
    sourceIds: ['medsl-2024'],
  }];
}

function measureOfficialTextSections(measure: BallotMeasure): ResearchSection[] {
  const fullTextUrl = asString(measure.fullTextUrl);
  const ballotpediaUrl = asString(measure.ballotpediaUrl);
  const sections: ResearchSection[] = [];

  if (fullTextUrl) {
    sections.push({
      title: 'Official Text',
      body: 'An official text URL is available from the measure record.',
      links: link('Official Measure Text', fullTextUrl, 'official-text'),
      sourceIds: ['official-text'],
    });
  }

  if (ballotpediaUrl) {
    sections.push({
      title: 'Measure Profile',
      body: 'A Ballotpedia measure profile URL is available as an aggregator reference.',
      links: link('Ballotpedia Measure Page', ballotpediaUrl, 'ballotpedia'),
      sourceIds: ['ballotpedia'],
    });
  }

  return sections;
}

function measureFiscalSections(measure: BallotMeasure): ResearchSection[] {
  const metrics = Array.isArray(measure.impactMetrics) ? measure.impactMetrics : [];
  if (metrics.length === 0) return [];

  return [{
    title: 'Impact Metrics',
    bullets: metrics.map((metric) => `${metric.label}: current ${metric.current}, projected ${metric.projected}`),
    sourceIds: ['medsl-2024'],
  }];
}

function measureLegalHistorySections(measure: BallotMeasure): ResearchSection[] {
  const bullets = nonEmpty([
    measure.measureNumber ? `Measure number: ${measure.measureNumber}` : null,
    measure.qualificationStatus ? `Qualification status: ${measure.qualificationStatus}` : null,
    measure.electionDate ? `Election date: ${measure.electionDate}` : measure.closeDate ? `Election date: ${measure.closeDate}` : null,
  ]);
  const body = asString(measure.history);
  if (!body && bullets.length === 0) return [];

  const section: ResearchSection = {
    title: 'Legal And Ballot Context',
    bullets,
    sourceIds: ['medsl-2024'],
  };
  if (body) section.body = body;
  return [section];
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
    buckets: {
      identity: candidateIdentitySections(race, candidate),
      campaign: candidateCampaignSections(candidate),
      electionsHistory: candidateElectionSections(race),
    },
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
    buckets: {
      summary: measureSummarySections(measure),
      officialText: measureOfficialTextSections(measure),
      fiscalEffects: measureFiscalSections(measure),
      legalHistory: measureLegalHistorySections(measure),
    },
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
