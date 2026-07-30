import { createHash } from 'node:crypto';

export const WAVE_B_STATES = ['CA', 'FL', 'GA', 'NY', 'NC', 'OH', 'SC', 'TX', 'VT', 'VA', 'WA', 'WY'] as const;
export type WaveBState = typeof WAVE_B_STATES[number];
export type WaveBCapability = 'candidateList' | 'governorRace' | 'statewideMeasure';
export type WaveBStatus = 'available' | 'preliminary' | 'not_yet_published' | 'officially_none' | 'access_blocked' | 'unresolved';
export type WaveBRecordKind = WaveBCapability;

type Json = Record<string, unknown>;
type WaveBRecord = {
  kind: WaveBRecordKind; canonicalId: string; title: string; description?: string; choices?: string[];
  qualificationStatus?: 'filed' | 'on_ballot' | 'withdrawn' | 'failed'; finalBallot?: boolean;
  fecCandidateId?: string; candidateName?: string; party?: string;
};
export type WaveBFixture = {
  schemaVersion: 1; state: WaveBState; electionYear: 2026; status: WaveBStatus;
  sourceAuthority: string; sourceUrl: string; sourcePublishedAt?: string; retrievedAt: string; reviewedAt: string;
  nextReviewAt?: string; capabilities: WaveBCapability[]; schemaMarkers: string[]; records: WaveBRecord[];
};
export type WaveBProviderResult = WaveBFixture & { evidenceDigest: string; diagnostics: string[]; predictionReadyRecords: number };
export type WaveBReport = {
  operation: 'offline-wave-b-state-provider-audit'; inputDigest: string; evidenceDigest: string; planDigest: string;
  states: Record<WaveBState, WaveBProviderResult>; counts: {
    states: number; status: Record<WaveBStatus, number>; capability: Record<WaveBCapability, number>;
    records: Record<WaveBRecordKind, number>; predictionReady: number; conflicts: number; schemaDrift: number;
    duplicateCanonicalIds: number; ambiguousAcceptedIdentities: number;
  };
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]`
  : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const iso = (value: unknown) => Boolean(text(value)) && !Number.isNaN(Date.parse(text(value)));
const https = (value: unknown) => /^https:\/\//.test(text(value));
const sorted = <T>(items: readonly T[], key: (item: T) => string) => [...items].sort((left, right) => key(left).localeCompare(key(right)));
const validStatus = new Set<WaveBStatus>(['available', 'preliminary', 'not_yet_published', 'officially_none', 'access_blocked', 'unresolved']);
const validCapability = new Set<WaveBCapability>(['candidateList', 'governorRace', 'statewideMeasure']);

function parsedRecord(value: unknown): WaveBRecord {
  if (!isRecord(value)) throw new Error('invalid Wave B record');
  const record: WaveBRecord = {
    kind: text(value.kind) as WaveBRecordKind, canonicalId: text(value.canonicalId), title: text(value.title),
    ...(text(value.description) ? { description: text(value.description) } : {}),
    ...(Array.isArray(value.choices) ? { choices: value.choices.map(text) } : {}),
    ...(text(value.qualificationStatus) ? { qualificationStatus: text(value.qualificationStatus) as WaveBRecord['qualificationStatus'] } : {}),
    ...(typeof value.finalBallot === 'boolean' ? { finalBallot: value.finalBallot } : {}),
    ...(text(value.fecCandidateId) ? { fecCandidateId: text(value.fecCandidateId) } : {}),
    ...(text(value.candidateName) ? { candidateName: text(value.candidateName) } : {}),
    ...(text(value.party) ? { party: text(value.party) } : {}),
  };
  if (!validCapability.has(record.kind) || !/^2026-[A-Z]{2}-(?:proposition|governor|candidate)-[a-z0-9-]+$/.test(record.canonicalId) || !record.title) throw new Error(`invalid Wave B record: ${record.canonicalId || 'missing'}`);
  if (record.kind === 'statewideMeasure') {
    if (!record.description || !record.choices || record.choices.length < 2 || new Set(record.choices).size !== record.choices.length || record.choices.some((choice) => !choice)) throw new Error(`invalid Wave B measure choices: ${record.canonicalId}`);
    if (record.qualificationStatus !== 'on_ballot') throw new Error(`statewide measure is not certified/on-ballot: ${record.canonicalId}`);
  }
  if (record.kind !== 'statewideMeasure' && (!record.fecCandidateId || !/^[HS]\d[A-Z]{2}\d{5}$/.test(record.fecCandidateId) || !record.candidateName || !record.party)) throw new Error(`invalid official candidate identity: ${record.canonicalId}`);
  return record;
}

/** Validates a minimal reviewed fixture. It deliberately does not accept whole HTML pages. */
export function normalizeWaveBFixture(value: unknown): WaveBFixture {
  if (!isRecord(value)) throw new Error('Wave B fixture must be an object');
  const state = text(value.state) as WaveBState;
  const status = text(value.status) as WaveBFixture['status'];
  const fixture: WaveBFixture = {
    schemaVersion: value.schemaVersion as 1, state, electionYear: value.electionYear as 2026, status,
    sourceAuthority: text(value.sourceAuthority), sourceUrl: text(value.sourceUrl),
    ...(text(value.sourcePublishedAt) ? { sourcePublishedAt: text(value.sourcePublishedAt) } : {}),
    retrievedAt: text(value.retrievedAt), reviewedAt: text(value.reviewedAt), ...(text(value.nextReviewAt) ? { nextReviewAt: text(value.nextReviewAt) } : {}),
    capabilities: Array.isArray(value.capabilities) ? sorted(value.capabilities.map(text) as WaveBCapability[], (item) => item) : [],
    schemaMarkers: Array.isArray(value.schemaMarkers) ? sorted(value.schemaMarkers.map(text).filter(Boolean), (item) => item.toLowerCase()) : [],
    records: Array.isArray(value.records) ? sorted(value.records.map(parsedRecord), (item) => item.canonicalId) : [],
  };
  if (fixture.schemaVersion !== 1 || !WAVE_B_STATES.includes(state) || fixture.electionYear !== 2026 || !validStatus.has(status) || !fixture.sourceAuthority || !https(fixture.sourceUrl) || !iso(fixture.retrievedAt) || !iso(fixture.reviewedAt) || (fixture.sourcePublishedAt && !iso(fixture.sourcePublishedAt)) || (fixture.nextReviewAt && !iso(fixture.nextReviewAt))) throw new Error('invalid Wave B fixture envelope/state');
  if (fixture.capabilities.some((capability) => !validCapability.has(capability)) || new Set(fixture.capabilities).size !== fixture.capabilities.length) throw new Error(`invalid Wave B capabilities: ${state}`);
  if (!fixture.schemaMarkers.length) throw new Error(`schema drift: ${state} has no reviewed page markers`);
  if (new Set(fixture.records.map((record) => record.canonicalId)).size !== fixture.records.length) throw new Error(`duplicate canonical record: ${state}`);
  if (status !== 'available' && fixture.records.length) throw new Error(`${state} non-available fixture cannot carry records`);
  if (status === 'available' && !fixture.records.length) throw new Error(`${state} available fixture needs reviewed records`);
  if (fixture.records.some((record) => !fixture.capabilities.includes(record.kind))) throw new Error(`${state} record claims an unreviewed capability`);
  if (fixture.status === 'not_yet_published' && !fixture.nextReviewAt) throw new Error(`${state} unpublished fixture requires nextReviewAt`);
  return fixture;
}

const predictionReady = (record: WaveBRecord) => record.kind === 'statewideMeasure'
  ? record.qualificationStatus === 'on_ballot'
  : record.qualificationStatus === 'on_ballot' && record.finalBallot === true;

/** Normalization is network-free and fails closed for duplicate or ambiguous accepted identities. */
export function parseWaveBProviderResult(value: unknown): WaveBProviderResult {
  const fixture = normalizeWaveBFixture(value);
  const candidateKeys = new Set<string>();
  for (const record of fixture.records) {
    if (record.kind === 'statewideMeasure') continue;
    const key = `${record.canonicalId}/${record.fecCandidateId}`;
    if (candidateKeys.has(key)) throw new Error(`ambiguous accepted candidate identity: ${key}`);
    candidateKeys.add(key);
    if (record.qualificationStatus === 'withdrawn' || record.qualificationStatus === 'failed') throw new Error(`non-pickable candidate cannot be accepted: ${key}`);
  }
  const evidence = { state: fixture.state, sourceAuthority: fixture.sourceAuthority, sourceUrl: fixture.sourceUrl, sourcePublishedAt: fixture.sourcePublishedAt ?? null, reviewedAt: fixture.reviewedAt, schemaMarkers: fixture.schemaMarkers, records: fixture.records };
  return { ...fixture, evidenceDigest: digest(evidence), diagnostics: [], predictionReadyRecords: fixture.records.filter(predictionReady).length };
}

export const waveBInputDigest = (fixtures: Record<WaveBState, unknown>) => digest(Object.fromEntries(WAVE_B_STATES.map((state) => [state, normalizeWaveBFixture(fixtures[state])] )));

/** Produces a deterministic all-state audit; state failures remain reportable instead of collapsing the other providers. */
export function buildWaveBReport(fixtures: Record<WaveBState, unknown>): WaveBReport {
  const states = Object.fromEntries(WAVE_B_STATES.map((state) => [state, parseWaveBProviderResult(fixtures[state])])) as Record<WaveBState, WaveBProviderResult>;
  const status = Object.fromEntries([...validStatus].map((item) => [item, 0])) as WaveBReport['counts']['status'];
  const capability = { candidateList: 0, governorRace: 0, statewideMeasure: 0 };
  const records = { candidateList: 0, governorRace: 0, statewideMeasure: 0 };
  const canonicalIds = new Set<string>(); let duplicateCanonicalIds = 0; let ambiguousAcceptedIdentities = 0; let predictionReadyRecords = 0;
  for (const result of Object.values(states)) {
    status[result.status] += 1; result.capabilities.forEach((item) => { capability[item] += 1; });
    result.records.forEach((record) => { records[record.kind] += 1; if (canonicalIds.has(record.canonicalId)) duplicateCanonicalIds += 1; canonicalIds.add(record.canonicalId); });
    predictionReadyRecords += result.predictionReadyRecords;
  }
  const inputDigest = waveBInputDigest(fixtures);
  const evidenceDigest = digest(Object.values(states).map((result) => ({ state: result.state, evidenceDigest: result.evidenceDigest })));
  const counts = { states: WAVE_B_STATES.length, status, capability, records, predictionReady: predictionReadyRecords, conflicts: 0, schemaDrift: 0, duplicateCanonicalIds, ambiguousAcceptedIdentities };
  return { operation: 'offline-wave-b-state-provider-audit', inputDigest, evidenceDigest, planDigest: digest({ states, counts }), states, counts };
}

export function replayWaveBProviders(fixtures: Record<WaveBState, unknown>) { return buildWaveBReport(fixtures); }

export async function fetchWaveBProvider(state: WaveBState, fixture: unknown, fetchImpl: typeof fetch = fetch): Promise<WaveBProviderResult> {
  const normalized = normalizeWaveBFixture(fixture);
  if (normalized.state !== state) throw new Error(`fixture state mismatch: ${state}`);
  const response = await fetchImpl(normalized.sourceUrl, { headers: { accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`${state} official authority request failed: ${response.status}`);
  const body = (await response.text()).toLowerCase();
  const missing = normalized.schemaMarkers.filter((marker) => !body.includes(marker.toLowerCase()));
  if (missing.length) throw new Error(`${state} schema drift: missing reviewed markers ${missing.join(', ')}`);
  return parseWaveBProviderResult({ ...normalized, retrievedAt: new Date().toISOString() });
}
