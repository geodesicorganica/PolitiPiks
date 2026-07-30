import { createHash } from 'node:crypto';

export const WAVE_D_STATES = ['AL', 'AK', 'AZ', 'AR', 'CO', 'CT', 'DE', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'ND', 'OK', 'OR', 'PA', 'SD', 'TN', 'UT', 'WI'] as const;
export type WaveDState = typeof WAVE_D_STATES[number];
export type WaveDCapability = 'candidateList' | 'governorRace' | 'statewideMeasure';
export type WaveDFormat = 'API' | 'JSON' | 'CSV' | 'XLSX' | 'HTML' | 'PDF' | 'reviewed-manual' | 'access_blocked' | 'unresolved';
export type WaveDStatus = 'available' | 'preliminary' | 'not_yet_published' | 'officially_none' | 'access_blocked' | 'unresolved';
type Json = Record<string, unknown>;

export type ReviewedCapability = {
  capability: WaveDCapability; endpoint: string; sourceFormat: Exclude<WaveDFormat, 'access_blocked' | 'unresolved'>;
  accessRequirements: 'public' | 'login' | 'captcha' | 'unknown'; publicationStatus: WaveDStatus;
  applicability: '2026_general' | 'not_established'; facts: string[]; reviewerNotes: string[];
  adapterRecommendation: { format: WaveDFormat; wave: 'D'; nextAction: string }; proven: boolean;
  attempts: 1 | 2; affirmativeOfficialEvidence?: string;
};
export type WaveDEvidence = {
  schemaVersion: 1; state: WaveDState; authorityName: string; authorityUrl: string;
  election: { year: 2026; identity: '2026_general' }; publicationStatus: WaveDStatus;
  checkedAt: string; reviewedAt: string; nextReviewAt: string; capabilities: ReviewedCapability[];
  evidenceDigest: string;
};
export type WaveDReport = {
  operation: 'offline-wave-d-source-resolution-audit'; inputDigest: string; evidenceDigest: string; registryDigest: string; planDigest: string;
  states: Record<WaveDState, WaveDEvidence>; registryChanges: Record<WaveDState, { endpoints: number; provenCapabilities: number; format: WaveDFormat; publicationStatus: WaveDStatus; nextReviewAt: string }>;
  counts: { states: number; format: Record<WaveDFormat, number>; status: Record<WaveDStatus, number>; capability: Record<WaveDCapability, number>; remainingBlockers: number; genericPlaceholders: number; unsupportedCapabilityClaims: number; homepageOnlyEvidence: number; missingNextReview: number; duplicateEndpoints: number; conflictingEndpoints: number };
};

const object = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const iso = (value: unknown) => Boolean(string(value)) && !Number.isNaN(Date.parse(string(value)));
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : object(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const endpoint = (value: unknown) => /^https:\/\/.+/.test(string(value));
const statuses = new Set<WaveDStatus>(['available', 'preliminary', 'not_yet_published', 'officially_none', 'access_blocked', 'unresolved']);
const formats = new Set<WaveDFormat>(['API', 'JSON', 'CSV', 'XLSX', 'HTML', 'PDF', 'reviewed-manual', 'access_blocked', 'unresolved']);
const sourceFormats = new Set<ReviewedCapability['sourceFormat']>(['API', 'JSON', 'CSV', 'XLSX', 'HTML', 'PDF', 'reviewed-manual']);
const capabilities = new Set<WaveDCapability>(['candidateList', 'governorRace', 'statewideMeasure']);

function capability(value: unknown, state: WaveDState, authorityUrl: string): ReviewedCapability {
  if (!object(value)) throw new Error(`invalid reviewed capability: ${state}`);
  const result: ReviewedCapability = {
    capability: string(value.capability) as WaveDCapability, endpoint: string(value.endpoint), sourceFormat: string(value.sourceFormat) as ReviewedCapability['sourceFormat'],
    accessRequirements: string(value.accessRequirements) as ReviewedCapability['accessRequirements'], publicationStatus: string(value.publicationStatus) as WaveDStatus,
    applicability: string(value.applicability) as ReviewedCapability['applicability'], facts: Array.isArray(value.facts) ? value.facts.map(string).filter(Boolean).sort() : [],
    reviewerNotes: Array.isArray(value.reviewerNotes) ? value.reviewerNotes.map(string).filter(Boolean).sort() : [],
    adapterRecommendation: object(value.adapterRecommendation) ? { format: string(value.adapterRecommendation.format) as WaveDFormat, wave: string(value.adapterRecommendation.wave) as 'D', nextAction: string(value.adapterRecommendation.nextAction) } : { format: 'unresolved', wave: 'D', nextAction: '' },
    proven: value.proven as boolean, attempts: value.attempts as 1 | 2,
    ...(string(value.affirmativeOfficialEvidence) ? { affirmativeOfficialEvidence: string(value.affirmativeOfficialEvidence) } : {}),
  };
  if (!capabilities.has(result.capability) || !endpoint(result.endpoint) || !sourceFormats.has(result.sourceFormat) || !['public', 'login', 'captcha', 'unknown'].includes(result.accessRequirements) || !statuses.has(result.publicationStatus) || !['2026_general', 'not_established'].includes(result.applicability) || !result.facts.length || !result.reviewerNotes.length || !formats.has(result.adapterRecommendation.format) || result.adapterRecommendation.wave !== 'D' || !result.adapterRecommendation.nextAction || typeof result.proven !== 'boolean' || ![1, 2].includes(result.attempts)) throw new Error(`invalid reviewed capability: ${state}/${result.capability}`);
  if (result.publicationStatus === 'officially_none' && !result.affirmativeOfficialEvidence) throw new Error(`officially_none requires affirmative official evidence: ${state}/${result.capability}`);
  if (result.publicationStatus === 'officially_none' && result.applicability !== '2026_general') throw new Error(`officially_none must be applicable: ${state}/${result.capability}`);
  if (result.endpoint === authorityUrl) throw new Error(`homepage-only evidence: ${state}/${result.capability}`);
  if (result.proven && (result.publicationStatus !== 'available' || result.applicability !== '2026_general')) throw new Error(`unsupported capability claim: ${state}/${result.capability}`);
  return result;
}

/** Validates only concise, reviewed facts and never converts a source plan into a ballot-capability claim. */
export function normalizeWaveDEvidence(value: unknown): WaveDEvidence {
  if (!object(value)) throw new Error('Wave D evidence must be an object');
  const state = string(value.state) as WaveDState; const authorityUrl = string(value.authorityUrl);
  const result: WaveDEvidence = {
    schemaVersion: value.schemaVersion as 1, state, authorityName: string(value.authorityName), authorityUrl,
    election: object(value.election) ? { year: value.election.year as 2026, identity: string(value.election.identity) as '2026_general' } : { year: 0 as 2026, identity: '' as '2026_general' },
    publicationStatus: string(value.publicationStatus) as WaveDStatus, checkedAt: string(value.checkedAt), reviewedAt: string(value.reviewedAt), nextReviewAt: string(value.nextReviewAt),
    capabilities: Array.isArray(value.capabilities) ? value.capabilities.map((entry) => capability(entry, state, authorityUrl)).sort((left, right) => left.capability.localeCompare(right.capability)) : [],
    evidenceDigest: string(value.evidenceDigest),
  };
  if (!iso(result.nextReviewAt)) throw new Error(`missing next review: ${state || 'unknown'}`);
  if (result.schemaVersion !== 1 || !WAVE_D_STATES.includes(state) || !result.authorityName || !endpoint(authorityUrl) || result.election.year !== 2026 || result.election.identity !== '2026_general' || !statuses.has(result.publicationStatus) || !iso(result.checkedAt) || !iso(result.reviewedAt) || result.capabilities.length !== 3 || !/^[a-f0-9]{64}$/.test(result.evidenceDigest)) throw new Error(`invalid Wave D evidence envelope: ${state || 'unknown'}`);
  if (new Set(result.capabilities.map((item) => item.capability)).size !== 3) throw new Error(`missing or duplicate reviewed capability: ${state}`);
  const urls = result.capabilities.map((item) => item.endpoint);
  if (new Set(urls).size !== urls.length) throw new Error(`duplicate endpoint: ${state}`);
  const { evidenceDigest: ignoredDigest, ...digestable } = result;
  const expected = digest(digestable);
  if (expected !== result.evidenceDigest) throw new Error(`evidence digest mismatch: ${state}`);
  return result;
}

export function waveDEvidenceDigest(evidence: Record<WaveDState, unknown>) {
  return digest(Object.fromEntries(WAVE_D_STATES.map((state) => [state, normalizeWaveDEvidence(evidence[state])] )));
}

export function buildWaveDReport(evidence: Record<WaveDState, unknown>): WaveDReport {
  const states = Object.fromEntries(WAVE_D_STATES.map((state) => [state, normalizeWaveDEvidence(evidence[state])])) as Record<WaveDState, WaveDEvidence>;
  const format = Object.fromEntries([...formats].map((item) => [item, 0])) as Record<WaveDFormat, number>;
  const status = Object.fromEntries([...statuses].map((item) => [item, 0])) as Record<WaveDStatus, number>;
  const capabilityCounts = { candidateList: 0, governorRace: 0, statewideMeasure: 0 };
  const registryChanges = {} as WaveDReport['registryChanges'];
  let blockers = 0;
  for (const state of WAVE_D_STATES) {
    const record = states[state]; status[record.publicationStatus] += 1;
    const recommendation = record.capabilities.map((item) => item.adapterRecommendation.format).sort()[0] as WaveDFormat;
    format[recommendation] += 1;
    record.capabilities.forEach((item) => { if (item.proven) capabilityCounts[item.capability] += 1; if (item.publicationStatus === 'unresolved' || item.publicationStatus === 'access_blocked') blockers += 1; });
    registryChanges[state] = { endpoints: record.capabilities.length, provenCapabilities: record.capabilities.filter((item) => item.proven).length, format: recommendation, publicationStatus: record.publicationStatus, nextReviewAt: record.nextReviewAt };
  }
  const counts = { states: WAVE_D_STATES.length, format, status, capability: capabilityCounts, remainingBlockers: blockers, genericPlaceholders: 0, unsupportedCapabilityClaims: 0, homepageOnlyEvidence: 0, missingNextReview: 0, duplicateEndpoints: 0, conflictingEndpoints: 0 };
  const evidenceDigest = waveDEvidenceDigest(evidence);
  return { operation: 'offline-wave-d-source-resolution-audit', inputDigest: evidenceDigest, evidenceDigest, registryDigest: digest(Object.values(states).map((item) => ({ state: item.state, evidenceDigest: item.evidenceDigest }))), planDigest: digest({ states, registryChanges, counts }), states, registryChanges, counts };
}
