import { createHash } from 'node:crypto';
import { buildCanonicalMeasurePlan } from './canonicalBallotMeasures.js';
import { buildCanonicalPublicationPlan, validateCanonicalPublicationSnapshot } from './canonicalPublication.js';
import { validateCongressDepthSnapshot } from './congressDepth.js';
import { validateFecBulkFinanceSnapshot } from './fecBulkFinance.js';
import { buildHistoricalCvapPlan, validateHistoricalCvapSnapshot } from './historicalCvapDepth.js';

type Json = Record<string, unknown>;
export type LocalProductDocument = { path: string; data: Json };
export type LocalProductBundle = {
  schemaVersion: 1;
  certifiedAt: string;
  generation: 'canonical-2026-shadow-v2';
  sourceDigests: {
    publication: string;
    finance: string;
    congress: string;
    historicalCvap: string;
    historicalCvapSource: string;
    evidence: string;
  };
  counts: { races: number; measures: number; candidateResearch: number; measureResearch: number; metrics: number; selectors: number; total: number };
  readiness: { catalogReady: boolean; researchReady: boolean; metricsReady: boolean; predictionReadyRaces: number; predictionReadyMeasures: number };
  audit: { duplicatePaths: number; orphanDocuments: number; unresolvedReferences: number; leakage: number };
  documents: LocalProductDocument[];
  inputDigest: string;
  evidenceDigest: string;
  planDigest: string;
  bundleDigest: string;
};

export const CERTIFIED_G6_4 = {
  snapshot: 'c2ff11afbf184d29cc3d3d5a428ebe43c72875717d63fdd484c65e9858730d29',
  source: 'e4598622c3ec18534590503313516489b60bbb1a977a591c36a4a43b3aeab45d',
  input: '535ac1413062b8c5f046b5265ace2b1762e90409aee6e0b3da37e82315a4df8e',
  evidence: '17413f6a19620fd628fb2bf60f927c1caba7aed97e23f158c63f942ff6bb5242',
  plan: '23d3ea2290552fbbfee7396a6019fb17213c756e79dcf5409d1fd8d129c6cec7',
} as const;

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  throw new Error('unsupported local-product value');
};
export const localProductDigest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const ordered = <T>(items: T[], key: (item: T) => string) => [...items].sort((left, right) => key(left).localeCompare(key(right)));

function defined(entries: Array<[string, unknown]>) {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

function projectResearch(data: Json): Json {
  return defined([
    ['raceId', data.raceId], ['candidateId', data.candidateId], ['externalIds', data.externalIds],
    ['canonicalShadow', data.canonicalShadow], ['canonicalPublication', data.canonicalPublication],
    ['baselineResearch', data.baselineResearch], ['fecFinance', data.fecFinance], ['congressDepth', data.congressDepth],
  ]);
}

function projectMetric(data: Json): Json {
  return defined([
    ['id', data.id], ['raceId', data.raceId], ['baselineMetrics', data.baselineMetrics],
    ['baselineResearchContract', data.baselineResearchContract], ['comparativeFinance', data.comparativeFinance],
    ['historical', data.historical], ['turnout', data.turnout], ['demographics', data.demographics],
    ['historicalCvap', data.historicalCvap],
  ]);
}

function projectMeasureResearch(data: Json): Json {
  return defined([['measureId', data.measureId], ['baselineResearch', data.baselineResearch]]);
}

function assertSafeValue(value: unknown, at = 'bundle'): void {
  if (Array.isArray(value)) { value.forEach((item, index) => assertSafeValue(item, `${at}[${index}]`)); return; }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:winner|winnerId|calledWinner|electionResult|postLockResult|certifiedResult)$/i.test(key)) throw new Error(`post-lock outcome leakage at ${at}.${key}`);
      if (/(?:credential|privateKey|accessToken|refreshToken|apiKey)/i.test(key)) throw new Error(`credential field leakage at ${at}.${key}`);
      assertSafeValue(child, `${at}.${key}`);
    }
    return;
  }
  if (typeof value === 'string') {
    if (/\.artifacts[\\/]private|BEGIN (?:RSA )?PRIVATE KEY|CENSUS_API_KEY|GOOGLE_APPLICATION_CREDENTIALS/i.test(value)) throw new Error(`private value leakage at ${at}`);
    if (/^https?:\/\//i.test(value) && /[?&](?:key|api[_-]?key|token|access_token)=/i.test(value)) throw new Error(`credential URL leakage at ${at}`);
    return;
  }
  if (value !== null && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) throw new Error(`unsupported local-product value at ${at}`);
}

function countDocuments(documents: LocalProductDocument[]) {
  const count = (pattern: RegExp) => documents.filter((document) => pattern.test(document.path)).length;
  const counts = {
    races: count(/^races\/[^/]+$/),
    measures: count(/^ballotMeasures\/[^/]+$/),
    candidateResearch: count(/^races\/[^/]+\/candidateResearch\/[^/]+$/),
    measureResearch: count(/^ballotMeasures\/[^/]+\/research\/baseline$/),
    metrics: count(/^contestMetrics\/[^/]+$/),
    selectors: count(/^catalogActivations\/canonical-2026$/),
    total: documents.length,
  };
  if (counts.races !== 470 || counts.measures !== 14 || counts.candidateResearch !== 2384 || counts.measureResearch !== 14 || counts.metrics !== 470 || counts.selectors !== 1 || counts.total !== 3353) throw new Error('unexpected local-product cardinalities');
  return counts;
}

function auditDocuments(documents: LocalProductDocument[]) {
  const paths = new Set<string>(); let duplicatePaths = 0; let orphanDocuments = 0; let unresolvedReferences = 0;
  for (const document of documents) {
    if (paths.has(document.path)) duplicatePaths += 1;
    paths.add(document.path); assertSafeValue(document.data, document.path);
  }
  const races = new Map(documents.filter((item) => /^races\/[^/]+$/.test(item.path)).map((item) => [item.path.slice(6), item.data]));
  const measures = new Set(documents.filter((item) => /^ballotMeasures\/[^/]+$/.test(item.path)).map((item) => item.path.split('/')[1]));
  const candidateKeys = new Set([...races.entries()].flatMap(([raceId, race]) => (Array.isArray(race.candidates) ? race.candidates : []).map((candidate) => isRecord(candidate) ? `${raceId}/${text(candidate.id)}` : '')));
  const researchKeys = new Set(documents.filter((item) => /^races\/[^/]+\/candidateResearch\/[^/]+$/.test(item.path)).map((item) => item.path.replace(/^races\/([^/]+)\/candidateResearch\//, '$1/')));
  if (candidateKeys.has('') || candidateKeys.size !== 2384 || researchKeys.size !== candidateKeys.size || [...candidateKeys].some((key) => !researchKeys.has(key))) unresolvedReferences += 1;
  for (const document of documents) {
    const research = /^races\/([^/]+)\/candidateResearch\/([^/]+)$/.exec(document.path);
    if (research) {
      const race = races.get(research[1]); const candidates = Array.isArray(race?.candidates) ? race.candidates : [];
      if (!race || !candidates.some((candidate) => isRecord(candidate) && text(candidate.id) === research[2])) orphanDocuments += 1;
      if (text(document.data.raceId) !== research[1] || text(document.data.candidateId) !== research[2]) unresolvedReferences += 1;
    }
    const metric = /^contestMetrics\/([^/]+)$/.exec(document.path);
    if (metric && (!races.has(metric[1]) || text(document.data.raceId) !== metric[1])) unresolvedReferences += 1;
    const measureResearch = /^ballotMeasures\/([^/]+)\/research\/baseline$/.exec(document.path);
    if (measureResearch && (!measures.has(measureResearch[1]) || text(document.data.measureId) !== measureResearch[1])) unresolvedReferences += 1;
  }
  const audit = { duplicatePaths, orphanDocuments, unresolvedReferences, leakage: 0 };
  if (Object.values(audit).some((value) => value !== 0)) throw new Error('local-product document audit failed');
  return audit;
}

export function buildLocalProductBundle({ publicationValue, financeValue, congressValue, historicalValue, measureRegistryValue }: {
  publicationValue: unknown; financeValue: unknown; congressValue: unknown; historicalValue: unknown; measureRegistryValue: unknown;
}): LocalProductBundle {
  const publication = validateCanonicalPublicationSnapshot(publicationValue);
  const finance = validateFecBulkFinanceSnapshot(financeValue);
  const congress = validateCongressDepthSnapshot(congressValue);
  const historical = validateHistoricalCvapSnapshot(historicalValue);
  const publicationPlan = buildCanonicalPublicationPlan(publication.inputs);
  const depthPlan = buildHistoricalCvapPlan(publication, finance, congress, historical);
  if (historical.inputDigest !== CERTIFIED_G6_4.snapshot || historical.sourceDigest !== CERTIFIED_G6_4.source || depthPlan.inputDigest !== CERTIFIED_G6_4.input || depthPlan.evidenceDigest !== CERTIFIED_G6_4.evidence || depthPlan.planDigest !== CERTIFIED_G6_4.plan) throw new Error('G6.4 certification digest mismatch');
  const measurePlan = buildCanonicalMeasurePlan(measureRegistryValue);
  const raceDocuments = publicationPlan.documents.filter((document) => /^races\/[^/]+$/.test(document.path)).map((document) => {
    const eligibleCandidateIds = Array.isArray(document.data.eligibleCandidateIds) ? document.data.eligibleCandidateIds : [];
    return { path: document.path, data: { ...document.data, catalogReady: true, researchReady: true, metricsReady: true, predictionReady: eligibleCandidateIds.length > 0 } };
  });
  const measureDocuments: LocalProductDocument[] = measurePlan.documents.map((document) => ({ path: document.path, data: { ...document.data, catalogReady: true, researchReady: true, metricsReady: false } }));
  const evidenceDocuments = depthPlan.documents.map((document) => {
    if (/^races\/[^/]+\/candidateResearch\/[^/]+$/.test(document.path)) return { path: document.path, data: projectResearch(document.data) };
    if (/^contestMetrics\/[^/]+$/.test(document.path)) return { path: document.path, data: projectMetric(document.data) };
    if (/^ballotMeasures\/[^/]+\/research\/baseline$/.test(document.path)) return { path: document.path, data: projectMeasureResearch(document.data) };
    throw new Error(`unsupported G6 evidence path: ${document.path}`);
  });
  const selector: LocalProductDocument = { path: 'catalogActivations/canonical-2026', data: { state: 'active', activeFederalGeneration: publicationPlan.generation, localFixture: true } };
  const documents = ordered([...raceDocuments, ...measureDocuments, ...evidenceDocuments, selector], (document) => document.path);
  const counts = countDocuments(documents); const audit = auditDocuments(documents);
  const readiness = { catalogReady: true, researchReady: true, metricsReady: true, predictionReadyRaces: raceDocuments.filter((item) => item.data.predictionReady === true).length, predictionReadyMeasures: measureDocuments.filter((item) => item.data.predictionReady === true).length };
  if (readiness.predictionReadyMeasures !== 14) throw new Error('expected 14 prediction-ready measures');
  const sourceDigests = { publication: publication.inputDigest, finance: finance.inputDigest, congress: congress.inputDigest, historicalCvap: historical.inputDigest, historicalCvapSource: historical.sourceDigest, evidence: depthPlan.evidenceDigest };
  const inputDigest = localProductDigest({ sourceDigests, measurePlan: measurePlan.planDigest, publicationPlan: publicationPlan.planDigest });
  const evidenceDigest = localProductDigest({ sourceEvidence: depthPlan.evidenceDigest, documents: evidenceDocuments });
  const planDigest = localProductDigest({ documents, counts, readiness, audit, inputDigest, evidenceDigest });
  const payload = { schemaVersion: 1 as const, certifiedAt: historical.capturedAt, generation: publicationPlan.generation, sourceDigests, counts, readiness, audit, documents, inputDigest, evidenceDigest, planDigest };
  return { ...payload, bundleDigest: localProductDigest(payload) };
}

export function validateLocalProductBundle(value: unknown): LocalProductBundle {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.generation !== 'canonical-2026-shadow-v2' || !Array.isArray(value.documents) || !isRecord(value.sourceDigests) || !isRecord(value.readiness) || !isRecord(value.audit) || !isRecord(value.counts)) throw new Error('malformed local-product bundle');
  const documents = ordered(value.documents.map((document) => {
    if (!isRecord(document) || !text(document.path) || !isRecord(document.data)) throw new Error('malformed local-product document');
    return { path: text(document.path), data: document.data };
  }), (document) => document.path);
  const counts = countDocuments(documents); const audit = auditDocuments(documents);
  if (stable(counts) !== stable(value.counts) || stable(audit) !== stable(value.audit)) throw new Error('local-product count or audit tampering');
  const inputDigest = text(value.inputDigest); const evidenceDigest = text(value.evidenceDigest);
  const planDigest = localProductDigest({ documents, counts, readiness: value.readiness, audit, inputDigest, evidenceDigest });
  const payload = { schemaVersion: 1 as const, certifiedAt: text(value.certifiedAt), generation: 'canonical-2026-shadow-v2' as const, sourceDigests: value.sourceDigests as LocalProductBundle['sourceDigests'], counts, readiness: value.readiness as LocalProductBundle['readiness'], audit, documents, inputDigest, evidenceDigest, planDigest };
  if (planDigest !== value.planDigest || localProductDigest(payload) !== value.bundleDigest) throw new Error('local-product digest mismatch');
  return { ...payload, bundleDigest: text(value.bundleDigest) };
}
