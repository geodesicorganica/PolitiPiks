import { createHash } from 'node:crypto';
import { PRODUCT_LOCK_CLOSE_AT } from './deadlineRegistry.js';
import type { FirestoreTimestampTag } from './canonicalMigration.js';

export const MEASURE_STATES = ['CA', 'TX', 'NY', 'FL', 'GA'] as const;
export type MeasureState = typeof MEASURE_STATES[number];
export type MeasureQualification = 'filed' | 'circulating' | 'pending' | 'on_ballot' | 'withdrawn' | 'failed';
export type MeasureSourceStatus = 'available' | 'not_yet_published' | 'unavailable';
type Json = Record<string, unknown>;

export const CANONICAL_2026_MEASURE_LOCK_POLICY = Object.freeze({
  id: 'canonical-2026-statewide-measure-lock-v1', version: 1, electionDate: '2026-11-03', closeAt: PRODUCT_LOCK_CLOSE_AT,
  deadlineKind: 'product_safety_lock', lockReason: 'Conservative product safety lock for 2026 statewide ballot-measure picks; not an official poll-close time.',
});

export type MeasureInput = { canonicalId: string; officialAliases: string[]; officialNumber: string; officialTitle: string; officialDescription: string; qualificationStatus: MeasureQualification; choices: string[]; fullTextUrl?: string; fiscalAnalysisUrl?: string };
export type StateMeasureSource = { state: MeasureState; sourceStatus: MeasureSourceStatus; sourceAuthority: string; sourceUrl: string; retrievedAt: string; reviewedAt: string; measures: MeasureInput[] };
export type StatewideMeasureRegistry = { schemaVersion: 1; electionYear: 2026; states: StateMeasureSource[] };
export type CanonicalMeasureDocument = { path: string; data: Json };
export type CanonicalMeasurePlan = { schemaVersion: 1; documents: CanonicalMeasureDocument[]; inputDigest: string; planDigest: string; lockPolicyDigest: string; coverage: Record<MeasureState, { status: MeasureSourceStatus; records: number }>; audit: { catalogReady: boolean; predictionReady: boolean; researchReady: number; predictionReadyCount: number; duplicateIds: number; invalidOptions: number; conflicts: number } };
export type CanonicalMeasureSnapshot = { schemaVersion: 1; capturedAt: string; inputDigest: string; input: StatewideMeasureRegistry };

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const json = (value: unknown): string => Array.isArray(value) ? `[${value.map(json).join(',')}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${json(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(json(value)).digest('hex');
const https = (value: unknown) => /^https:\/\//.test(text(value));
const iso = (value: unknown) => Boolean(text(value)) && !Number.isNaN(Date.parse(text(value)));
const sorted = <T>(items: T[], key: (item: T) => string) => [...items].sort((a, b) => key(a).localeCompare(key(b)));

function assertRegistry(value: unknown): asserts value is StatewideMeasureRegistry {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.electionYear !== 2026 || !Array.isArray(value.states) || value.states.length !== MEASURE_STATES.length) throw new Error('invalid statewide-measure registry envelope');
  const states = new Set<string>(); const ids = new Set<string>();
  for (const source of value.states) {
    if (!isRecord(source) || !MEASURE_STATES.includes(source.state as MeasureState) || states.has(text(source.state)) || !['available', 'not_yet_published', 'unavailable'].includes(text(source.sourceStatus)) || !text(source.sourceAuthority) || !https(source.sourceUrl) || !iso(source.retrievedAt) || !iso(source.reviewedAt) || !Array.isArray(source.measures)) throw new Error(`invalid statewide-measure source: ${text(source.state) || 'missing'}`);
    states.add(text(source.state));
    if (source.sourceStatus === 'not_yet_published' && source.measures.length) throw new Error(`unpublished statewide-measure source has records: ${source.state}`);
    for (const measure of source.measures) {
      if (!isRecord(measure) || !/^2026-[A-Z]{2}-proposition-[a-z0-9-]+$/.test(text(measure.canonicalId)) || !text(measure.officialNumber) || !text(measure.officialTitle) || !text(measure.officialDescription) || !Array.isArray(measure.officialAliases) || !Array.isArray(measure.choices) || !['filed', 'circulating', 'pending', 'on_ballot', 'withdrawn', 'failed'].includes(text(measure.qualificationStatus))) throw new Error(`invalid statewide measure: ${text(measure.canonicalId) || 'missing'}`);
      if (ids.has(text(measure.canonicalId))) throw new Error(`duplicate canonical statewide measure ID: ${measure.canonicalId}`); ids.add(text(measure.canonicalId));
      const choices = measure.choices.map(text); if (choices.length < 2 || new Set(choices).size !== choices.length || choices.some((choice) => !choice || choice.length > 128)) throw new Error(`invalid statewide measure options: ${measure.canonicalId}`);
      if (measure.fullTextUrl !== undefined && !https(measure.fullTextUrl) || measure.fiscalAnalysisUrl !== undefined && !https(measure.fiscalAnalysisUrl)) throw new Error(`invalid official measure link: ${measure.canonicalId}`);
    }
  }
  if (states.size !== MEASURE_STATES.length) throw new Error('incomplete statewide-measure coverage');
}

export function normalizeStatewideMeasureRegistry(value: unknown): StatewideMeasureRegistry {
  assertRegistry(value);
  return { schemaVersion: 1, electionYear: 2026, states: sorted(value.states as StateMeasureSource[], (source) => source.state).map((source) => ({ ...source, measures: sorted(source.measures, (measure) => measure.canonicalId).map((measure) => ({ ...measure, officialAliases: [...measure.officialAliases].map(text).sort(), choices: [...measure.choices].map(text).sort() })) })) };
}
export const measureInputDigest = (value: StatewideMeasureRegistry) => digest(normalizeStatewideMeasureRegistry(value));

/** Builds only research-visible canonical documents; pick eligibility requires an official on-ballot record. */
export function buildCanonicalMeasurePlan(value: unknown): CanonicalMeasurePlan {
  const input = normalizeStatewideMeasureRegistry(value); const lockPolicyDigest = digest(CANONICAL_2026_MEASURE_LOCK_POLICY);
  const documents: CanonicalMeasureDocument[] = []; const coverage = {} as CanonicalMeasurePlan['coverage'];
  for (const source of input.states) {
    coverage[source.state] = { status: source.sourceStatus, records: source.measures.length };
    for (const measure of source.measures) {
      const predictionReady = measure.qualificationStatus === 'on_ballot';
      const evidence = { canonicalId: measure.canonicalId, officialAliases: measure.officialAliases, officialNumber: measure.officialNumber, officialTitle: measure.officialTitle, officialDescription: measure.officialDescription, qualificationStatus: measure.qualificationStatus, sourceAuthority: source.sourceAuthority, sourceUrl: source.sourceUrl, retrievedAt: source.retrievedAt, reviewedAt: source.reviewedAt, fullTextUrl: measure.fullTextUrl ?? null, fiscalAnalysisUrl: measure.fiscalAnalysisUrl ?? null };
      documents.push({ path: `ballotMeasures/${measure.canonicalId}`, data: { id: measure.canonicalId, officialAliases: measure.officialAliases, state: source.state, jurisdiction: 'statewide', electionYear: 2026, electionDate: CANONICAL_2026_MEASURE_LOCK_POLICY.electionDate, mode: 'live', status: 'upcoming', measureNumber: measure.officialNumber, title: measure.officialTitle, description: measure.officialDescription, qualificationStatus: measure.qualificationStatus, source: source.sourceAuthority, sourceUrl: source.sourceUrl, retrievedAt: source.retrievedAt, reviewedAt: source.reviewedAt, evidenceDigest: digest(evidence), ...(measure.fullTextUrl ? { fullTextUrl: measure.fullTextUrl } : {}), ...(measure.fiscalAnalysisUrl ? { fiscalAnalysisUrl: measure.fiscalAnalysisUrl } : {}), choices: measure.choices, eligibleOptions: predictionReady ? measure.choices : [], predictionReady, publicationReady: true, closeAt: { ...CANONICAL_2026_MEASURE_LOCK_POLICY.closeAt }, closeDate: CANONICAL_2026_MEASURE_LOCK_POLICY.electionDate, deadlineKind: CANONICAL_2026_MEASURE_LOCK_POLICY.deadlineKind, lockPolicyId: CANONICAL_2026_MEASURE_LOCK_POLICY.id, lockPolicyVersion: CANONICAL_2026_MEASURE_LOCK_POLICY.version, lockReason: CANONICAL_2026_MEASURE_LOCK_POLICY.lockReason } });
    }
  }
  const ordered = sorted(documents, (document) => document.path); const researchReady = ordered.length; const predictionReadyCount = ordered.filter((document) => document.data.predictionReady === true).length;
  const audit = { catalogReady: Object.keys(coverage).length === 5 && researchReady > 0, predictionReady: predictionReadyCount > 0, researchReady, predictionReadyCount, duplicateIds: 0, invalidOptions: 0, conflicts: 0 };
  return { schemaVersion: 1, documents: ordered, inputDigest: measureInputDigest(input), planDigest: digest({ documents: ordered, lockPolicyDigest, coverage }), lockPolicyDigest, coverage, audit };
}

export function buildCanonicalMeasureSnapshot(input: unknown, capturedAt = new Date().toISOString()): CanonicalMeasureSnapshot { const normalized = normalizeStatewideMeasureRegistry(input); if (!iso(capturedAt)) throw new Error('invalid statewide-measure snapshot time'); return { schemaVersion: 1, capturedAt, inputDigest: measureInputDigest(normalized), input: normalized }; }
export function validateCanonicalMeasureSnapshot(value: unknown): CanonicalMeasureSnapshot { if (!isRecord(value) || value.schemaVersion !== 1 || !iso(value.capturedAt)) throw new Error('invalid statewide-measure snapshot'); const input = normalizeStatewideMeasureRegistry(value.input); const snapshot = buildCanonicalMeasureSnapshot(input, text(value.capturedAt)); if (snapshot.inputDigest !== value.inputDigest) throw new Error('statewide-measure snapshot digest mismatch'); return snapshot; }
export function measureLockTimestamp(): FirestoreTimestampTag { return { ...PRODUCT_LOCK_CLOSE_AT }; }
