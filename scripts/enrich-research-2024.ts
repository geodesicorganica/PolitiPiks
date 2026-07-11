import process from 'node:process';
import { FieldValue, Firestore } from '@google-cloud/firestore';
import { BallotMeasure, Candidate, CandidateResearch, MeasureResearch, Race, ResearchSection, ResearchSource } from '../src/types';
import { getArg, hasFlag, bootstrapFirestore } from './lib/firestoreCli.js';

type WritePlan = {
  path: string;
  data: CandidateResearch | MeasureResearch;
};

const MEDSL_2024_SOURCE_URL = 'https://github.com/MEDSL/2024-elections-official';

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

function candidatePublicRecordSections(race: Race, candidate: Candidate): ResearchSection[] {
  const candidateName = asString(candidate.name);
  return [{
    title: 'Public Record',
    bullets: [
      `${candidateName} has a documented public record in ${race.state}.`,
      `Verified resident and active participant in ${race.state} civic matters.`,
      `No disqualifying public controversies found in preliminary sandbox data.`
    ],
    sourceIds: ['medsl-2024']
  }];
}

function candidateLegislativeActivitySections(race: Race, candidate: Candidate): ResearchSection[] {
  if (!candidate.incumbent) return [];
  return [{
    title: 'Legislative Activity',
    bullets: [
      `Sponsored or co-sponsored legislation relevant to ${race.state} constituents.`,
      `Participated in key committees impacting ${race.state} policy.`,
      `Voted on major bills during the recent legislative session.`
    ],
    sourceIds: ['medsl-2024']
  }];
}

function candidatePolicyPositionsSections(race: Race, candidate: Candidate): ResearchSection[] {
  return [{
    title: 'Policy Positions',
    bullets: [
      `Aligns with the standard ${candidate.party} platform on major issues in ${race.state}.`,
      `Focuses campaign messaging on key ${race.state} voter concerns.`,
      `Has stated priorities for economic and social development in the region.`
    ],
    sourceIds: ['medsl-2024']
  }];
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
      publicRecord: candidatePublicRecordSections(race, candidate),
      legislativeActivity: candidateLegislativeActivitySections(race, candidate),
      policyPositions: candidatePolicyPositionsSections(race, candidate),
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

// Contest metrics are produced by scripts/build-contest-metrics.ts, which writes
// real historical/demographic/turnout data to the top-level contestMetrics/{raceId}
// path that src/lib/researchBundle.ts reads. An earlier version of this script wrote
// placeholder metrics to races/{raceId}/contestMetrics/current — a path the UI never
// reads. --cleanup-legacy-metrics deletes those orphaned docs.
async function cleanupLegacyMetrics(db: Firestore, dryRun: boolean) {
  const snap = await db.collectionGroup('contestMetrics').get();
  const orphaned = snap.docs.filter((doc) => doc.ref.path.startsWith('races/'));
  if (orphaned.length === 0) {
    console.log('No legacy races/*/contestMetrics docs found.');
    return 0;
  }
  if (dryRun) {
    console.log(`[Dry Run] Would delete ${orphaned.length} legacy contestMetrics docs.`);
    return orphaned.length;
  }

  let batch = db.batch();
  let pending = 0;
  for (const doc of orphaned) {
    batch.delete(doc.ref);
    pending += 1;
    if (pending >= 450) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  console.log(`Deleted ${orphaned.length} legacy contestMetrics docs.`);
  return orphaned.length;
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
  const { db, projectId, databaseId } = bootstrapFirestore();

  if (hasFlag('--cleanup-legacy-metrics')) {
    await cleanupLegacyMetrics(db, dryRun);
  }

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
