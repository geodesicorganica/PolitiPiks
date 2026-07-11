import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from './firebase';
import {
  Race,
  BallotMeasure,
  Candidate,
  CandidateResearch,
  MeasureResearch,
  ResearchSource,
  ContestMetrics,
  ContestResearchBundle,
  CandidateResearchCard,
  SourceRecord,
  HistoricalMetrics,
  PollingMetrics,
  FundamentalsMetrics,
  TurnoutMetrics,
  DemographicMetrics,
  FreshnessSummary,
  ConfidenceSummary
} from '../types';

/**
 * Main entry point for fetching and normalizing a contest research bundle.
 */
export async function buildContestResearchBundle(
  raceOrMeasureId: string,
  type: 'race' | 'measure'
): Promise<ContestResearchBundle> {
  if (type === 'race') {
    const raceDoc = await getRace(raceOrMeasureId);
    if (!raceDoc) throw new Error(`Race not found: ${raceOrMeasureId}`);
    
    const [candidateDocs, candidateResearchDocs, metricsDoc, sourceDocs] = await loadRaceRelatedData(raceDoc);
    return normalizeRaceBundle(raceDoc, candidateDocs, candidateResearchDocs, metricsDoc, sourceDocs);
  } else {
    const measureDoc = await getMeasure(raceOrMeasureId);
    if (!measureDoc) throw new Error(`Measure not found: ${raceOrMeasureId}`);

    const [measureResearchDoc, sourceDocs] = await loadMeasureRelatedData(measureDoc);
    return normalizeMeasureBundle(measureDoc, measureResearchDoc, sourceDocs);
  }
}

// ------------------------------------------------------------------
// Fetch Helpers
// ------------------------------------------------------------------

async function getRace(id: string): Promise<Race | null> {
  const snap = await getDoc(doc(db, 'races', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Race) : null;
}

async function getMeasure(id: string): Promise<BallotMeasure | null> {
  const snap = await getDoc(doc(db, 'ballotMeasures', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as BallotMeasure) : null;
}

async function loadRaceRelatedData(race: Race): Promise<[Candidate[], CandidateResearch[], ContestMetrics | null, ResearchSource[]]> {
  // In our current schema, candidates are embedded in race.candidates.
  const candidateDocs = race.candidates || [];
  
  // We fetch CandidateResearch to build CandidateResearchCard
  const candidateResearchPromises = candidateDocs.map(c => 
    getDoc(doc(db, 'races', race.id, 'candidateResearch', c.id))
  );
  const researchSnaps = await Promise.all(candidateResearchPromises);
  const candidateResearchDocs = researchSnaps.map(snap => snap.exists() ? snap.data() as CandidateResearch : null).filter(Boolean) as CandidateResearch[];

  const metricsSnap = await getDoc(doc(db, 'contestMetrics', race.id));
  const metricsDoc = metricsSnap.exists() ? metricsSnap.data() as ContestMetrics : null;

  // We should also fetch source docs referenced by metrics and candidate research.
  const sourceDocs: ResearchSource[] = [];
  candidateResearchDocs.forEach(cr => {
    if (cr.sources) sourceDocs.push(...cr.sources);
  });

  return [candidateDocs, candidateResearchDocs, metricsDoc, sourceDocs];
}

async function loadMeasureRelatedData(measure: BallotMeasure): Promise<[MeasureResearch | null, ResearchSource[]]> {
  const researchSnap = await getDocs(collection(db, 'ballotMeasures', measure.id, 'research'));
  const researchDoc = !researchSnap.empty ? researchSnap.docs[0].data() as MeasureResearch : null;
  const sourceDocs: ResearchSource[] = researchDoc?.sources || [];
  return [researchDoc, sourceDocs];
}

// ------------------------------------------------------------------
// Normalizers
// ------------------------------------------------------------------

export function normalizeRaceBundle(
  race: Race,
  candidates: Candidate[],
  candidateResearchDocs: CandidateResearch[],
  metricsDoc: ContestMetrics | null,
  rawSources: ResearchSource[]
): ContestResearchBundle {
  const missingFields: string[] = [];

  // Metrics mapping
  let historical: HistoricalMetrics | undefined;
  let polling: PollingMetrics | undefined;
  let fundamentals: FundamentalsMetrics | undefined;
  let turnout: TurnoutMetrics | undefined;
  let demographics: DemographicMetrics | undefined;

  if (metricsDoc) {
    if (metricsDoc.historical) historical = metricsDoc.historical;
    else missingFields.push('historical');

    if (metricsDoc.polling) polling = metricsDoc.polling;
    else missingFields.push('polling');

    if (metricsDoc.fundamentals) fundamentals = metricsDoc.fundamentals;
    else missingFields.push('fundamentals');

    if (metricsDoc.turnout) turnout = metricsDoc.turnout;
    else missingFields.push('turnout');

    if (metricsDoc.demographics) demographics = metricsDoc.demographics;
    else missingFields.push('demographics');
  } else {
    // Derive historical from race.priorResult if possible
    if (race.priorResult) {
      historical = {
        priorVoteShareDem: race.priorResult.demTwoPartyShare,
        priorVoteShareRep: race.priorResult.repTwoPartyShare,
        priorMargin: race.priorResult.margin,
        swingVsPrevious: null,
        partisanLean: null
      };
    } else {
      missingFields.push('historical');
    }
    missingFields.push('polling', 'fundamentals', 'turnout', 'demographics');
  }

  // Deduplicate sources
  const { deduplicatedSources, sourceRecords } = deduplicateSources(rawSources);

  // Fallback Overview
  const overview = buildOverview(race, metricsDoc, missingFields, 'race');
  
  // Guard
  if (process.env.NODE_ENV === 'development' && overview.summary.trim() === '') {
    throw new Error('Contest overview summary cannot be blank.');
  }

  // Compute Freshness & Confidence
  const freshness = computeFreshness(sourceRecords);
  const confidence = computeConfidence(missingFields, polling);

  // Candidate Cards
  const candidateCards: CandidateResearchCard[] = candidates.map(c => {
    const cr = candidateResearchDocs.find(doc => doc.candidateId === c.id);
    return {
      candidateId: c.id,
      name: c.name,
      party: c.party,
      incumbency: c.incumbent ? 'incumbent' : null,
      identitySummary: cr?.buckets?.identity?.[0]?.body || c.summary,
      contestContext: cr?.buckets?.campaign?.[0]?.body,
      publicRecordBullets: cr?.buckets?.publicRecord?.flatMap(s => s.bullets || []) || [],
      electionsHistorySummary: cr?.buckets?.electionsHistory?.[0]?.body || null,
      policyPositionsBullets: cr?.buckets?.policyPositions?.flatMap(s => s.bullets || []) || [],
      legislativeActivityBullets: cr?.buckets?.legislativeActivity?.flatMap(s => s.bullets || []) || [],
      pollingDelta: null,
      fundamentalsAdjustment: null,
      sourceIds: cr?.sources?.map(s => String(s.url || s.label)) || []
    };
  });

  return {
    contestId: race.id,
    contestType: 'race',
    meta: {
      title: `${race.state} ${race.office}`,
      officeOrMeasure: race.office,
      jurisdiction: race.state,
      electionYear: race.electionYear || new Date().getFullYear(),
      mode: race.mode || 'sandbox',
      status: race.status
    },
    overview,
    race: {
      candidates: candidateCards,
      historical,
      polling,
      fundamentals,
      turnout,
      demographics
    },
    sources: sourceRecords,
    freshness,
    confidence,
    missingFields
  };
}

export function normalizeMeasureBundle(
  measure: BallotMeasure,
  researchDoc: MeasureResearch | null,
  rawSources: ResearchSource[]
): ContestResearchBundle {
  const missingFields: string[] = [];

  const { sourceRecords } = deduplicateSources(rawSources);
  const overview = buildOverview(measure, null, missingFields, 'measure');

  if (process.env.NODE_ENV === 'development' && overview.summary.trim() === '') {
    throw new Error('Contest overview summary cannot be blank.');
  }

  let supportOpposition;
  let fiscalEffects;

  if (researchDoc) {
    if (researchDoc.buckets?.supportOpposition) {
      supportOpposition = {
        supporters: researchDoc.buckets.supportOpposition.flatMap(s => s.bullets || []),
        summary: researchDoc.buckets.supportOpposition[0]?.body || null
      };
    } else {
      missingFields.push('supportOpposition');
    }

    if (researchDoc.buckets?.fiscalEffects) {
      fiscalEffects = {
        summary: researchDoc.buckets.fiscalEffects[0]?.body || null
      };
    } else {
      missingFields.push('fiscalEffects');
    }

    if (!researchDoc.buckets?.officialText) {
      missingFields.push('officialText');
    }
    if (!researchDoc.buckets?.legalHistory) {
      missingFields.push('legalHistory');
    }
  } else {
    missingFields.push('measureResearch', 'supportOpposition', 'fiscalEffects', 'officialText', 'legalHistory');
  }

  return {
    contestId: measure.id,
    contestType: 'measure',
    meta: {
      title: measure.title,
      officeOrMeasure: measure.title,
      jurisdiction: measure.state,
      electionYear: measure.electionYear || new Date().getFullYear(),
      mode: measure.mode || 'sandbox',
      status: measure.status
    },
    overview,
    measure: {
      summary: researchDoc?.buckets?.summary?.[0]?.body || measure.description,
      supportOpposition,
      fiscalEffects,
      officialTextSummary: researchDoc?.buckets?.officialText?.[0]?.body || null,
      legalHistorySummary: researchDoc?.buckets?.legalHistory?.[0]?.body || null
    },
    sources: sourceRecords,
    freshness: computeFreshness(sourceRecords),
    confidence: computeConfidence(missingFields, undefined),
    missingFields
  };
}

// ------------------------------------------------------------------
// Sub-routines
// ------------------------------------------------------------------

function deduplicateSources(sources: ResearchSource[]) {
  const map = new Map<string, ResearchSource>();
  sources.forEach(s => {
    const key = s.url || s.label;
    if (key && !map.has(key)) map.set(key, s);
  });
  const deduplicatedSources = Array.from(map.values());
  const sourceRecords: SourceRecord[] = deduplicatedSources.map(s => ({
    id: s.id || String(s.url),
    title: s.label,
    type: s.type || 'other',
    url: s.url,
    lastUpdated: s.retrievedAt || new Date().toISOString(),
    coverageScope: 'state'
  }));

  // Sort descending by last updated
  sourceRecords.sort((a, b) => {
    if (!a.lastUpdated) return 1;
    if (!b.lastUpdated) return -1;
    return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
  });

  return { deduplicatedSources, sourceRecords };
}

function computeFreshness(sources: SourceRecord[]): FreshnessSummary {
  let lastUpdated: string | null = null;
  if (sources.length > 0) {
    lastUpdated = sources[0].lastUpdated || null;
  }
  return {
    lastUpdated,
    staleFields: [] // In a real app, compare individual metric dates to a threshold
  };
}

function computeConfidence(missingFields: string[], polling?: PollingMetrics): ConfidenceSummary {
  const lowConfidenceFields: string[] = [];
  let score = 1.0;

  if (missingFields.includes('fundamentals')) score -= 0.2;
  if (missingFields.includes('polling')) score -= 0.3;
  if (missingFields.includes('historical')) score -= 0.1;

  if (polling) {
    if ((polling.pollCount || 0) < 3) {
      lowConfidenceFields.push('polling');
      score -= 0.2;
    }
    if ((polling.variance || 0) > 0.05) {
      if (!lowConfidenceFields.includes('polling')) lowConfidenceFields.push('polling');
      score -= 0.1;
    }
  }

  return {
    overall: Math.max(0, score),
    lowConfidenceFields
  };
}

function buildOverview(
  contest: Race | BallotMeasure,
  metrics: ContestMetrics | null,
  missingFields: string[],
  type: 'race' | 'measure'
): { summary: string; source: 'stored' | 'derived' | 'generated' | 'fallback' } {
  // 1. Stored
  const storedSummary = type === 'race' ? (contest as Race).summary : (contest as BallotMeasure).overview;
  if (storedSummary) {
    return { summary: storedSummary, source: 'stored' };
  }

  // 2. Derived (We have some metrics to talk about)
  if (metrics && metrics.polling?.averageMargin !== undefined && type === 'race') {
    const r = contest as Race;
    const p = metrics.polling;
    const marginStr = p.averageMargin! > 0 ? `+${p.averageMargin}` : `${p.averageMargin}`;
    return {
      summary: `In ${r.electionYear || 2024}, ${r.state} will hold a ${r.status} contest for ${r.office}. Polling currently shows a margin of ${marginStr} based on ${p.pollCount || 0} polls.`,
      source: 'derived'
    };
  }

  // 3. Generated (From metadata)
  if (type === 'race') {
    const r = contest as Race;
    const cNames = r.candidates.map(c => `${c.name} (${c.party})`).join(', ');
    return {
      summary: `The ${r.state} ${r.office} contest is currently ${r.status}. The field includes ${cNames}.`,
      source: 'generated'
    };
  } else {
    const m = contest as BallotMeasure;
    return {
      summary: `The ${m.state} ballot measure "${m.title}" is currently ${m.status}.`,
      source: 'generated'
    };
  }
}
