import { createHash } from 'node:crypto';

export const WAVE_C_STATES = ['RI', 'WV'] as const;
export type WaveCState = typeof WAVE_C_STATES[number];
export type PdfClassification = 'calendar' | 'candidate_list' | 'gubernatorial_contest' | 'statewide_measures' | 'unsupported';
export type PdfStatus = 'available' | 'preliminary' | 'not_yet_published' | 'officially_none' | 'access_blocked' | 'schema_drift' | 'unsupported_pdf';
type Json = Record<string, unknown>;
type PdfRecord = { canonicalId: string; title: string; choices?: string[]; qualificationStatus: 'on_ballot' | 'withdrawn' | 'failed'; finalBallot?: boolean };
export type WaveCPdfFixture = {
  schemaVersion: 1; state: WaveCState; electionYear: 2026; classification: PdfClassification; status: PdfStatus;
  sourceAuthority: string; sourceUrl: string; retrievedAt: string; reviewedAt: string; nextReviewAt?: string;
  extractionMode: 'reviewed_text_fixture' | 'born_digital_text'; documentText: string; expectedDocumentSha256?: string; records: PdfRecord[];
};
export type WaveCPdfProviderResult = WaveCPdfFixture & { documentSha256: string; evidenceDigest: string; diagnostics: string[]; capabilities: string[] };
export type WaveCReport = { operation: 'offline-wave-c-pdf-provider-audit'; inputDigest: string; documentDigest: string; evidenceDigest: string; planDigest: string; states: Record<WaveCState, WaveCPdfProviderResult>; counts: { states: number; classification: Record<PdfClassification, number>; status: Record<PdfStatus, number>; capabilities: number; records: number; extractionMode: Record<WaveCPdfFixture['extractionMode'], number>; conflicts: number; schemaDrift: number; duplicateCanonicalIds: number; ambiguousAcceptedIdentities: number } };

const hosts: Record<WaveCState, string> = { RI: 'vote.sos.ri.gov', WV: 'sos.wv.gov' };
const maxBytes = 5 * 1024 * 1024;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : record(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const iso = (value: unknown) => Boolean(text(value)) && !Number.isNaN(Date.parse(text(value)));
const sorted = <T>(items: T[], key: (item: T) => string) => [...items].sort((left, right) => key(left).localeCompare(key(right)));

/** A deliberately small parser: it extracts literal text operators only and rejects encrypted or image-only PDFs. */
export function extractPdfText(bytes: Buffer) {
  const raw = bytes.toString('latin1');
  if (!raw.startsWith('%PDF-')) throw new Error('response is not a PDF');
  if (/\/Encrypt\b/.test(raw)) throw new Error('encrypted PDFs are unsupported');
  const literals = [...raw.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj\b/g)].map((match) => match[0].replace(/\)\s*Tj\b$/, '').slice(1).replace(/\\([()\\])/g, '$1'));
  if (!literals.length && /\/Image\b/.test(raw)) throw new Error('image-only/scanned PDFs are unsupported without local OCR');
  if (!literals.length) throw new Error('unsupported PDF text extraction');
  return { text: literals.join('\n').replace(/\s+/g, ' ').trim(), extractionMode: 'born_digital_text' as const, documentSha256: digest(bytes.toString('base64')) };
}

/** Calendar language is intentionally checked before candidate phrases; a timeline is not a list of people or choices. */
export function classifyOfficialPdf(documentText: string): PdfClassification {
  const value = documentText.toLowerCase();
  if (/\b(?:election|elections)\s+calendar\b/.test(value) || /\bcalendar\b/.test(value) && /\b2026\b/.test(value)) return 'calendar';
  if (/\b(?:certified|official)\s+(?:general election )?candidate list\b/.test(value) && /\bcandidate\b/.test(value)) return 'candidate_list';
  if (/\b(?:governor|gubernatorial)\b/.test(value) && /\b(?:official ballot|candidate list)\b/.test(value)) return 'gubernatorial_contest';
  if (/\b(?:statewide measures?|ballot measures?)\b/.test(value) && /\b(?:certified|qualified|official ballot)\b/.test(value)) return 'statewide_measures';
  return 'unsupported';
}

function parseRecord(value: unknown): PdfRecord {
  if (!record(value)) throw new Error('invalid PDF record');
  const result: PdfRecord = { canonicalId: text(value.canonicalId), title: text(value.title), qualificationStatus: text(value.qualificationStatus) as PdfRecord['qualificationStatus'], ...(Array.isArray(value.choices) ? { choices: value.choices.map(text) } : {}), ...(typeof value.finalBallot === 'boolean' ? { finalBallot: value.finalBallot } : {}) };
  if (!/^2026-[A-Z]{2}-(?:candidate|governor|proposition)-[a-z0-9-]+$/.test(result.canonicalId) || !result.title || !['on_ballot', 'withdrawn', 'failed'].includes(result.qualificationStatus)) throw new Error('invalid PDF record');
  if (result.choices && (result.choices.length < 2 || new Set(result.choices).size !== result.choices.length || result.choices.some((choice) => !choice))) throw new Error('invalid eligible choices');
  return result;
}

/** Normalizes only reviewed fixture excerpts, never a complete authority document. */
export function normalizeWaveCPdfFixture(value: unknown): WaveCPdfFixture {
  if (!record(value)) throw new Error('PDF fixture must be an object');
  const state = text(value.state) as WaveCState; const sourceUrl = text(value.sourceUrl); const sourceHost = (() => { try { return new URL(sourceUrl).hostname; } catch { return ''; } })();
  const fixture: WaveCPdfFixture = { schemaVersion: value.schemaVersion as 1, state, electionYear: value.electionYear as 2026, classification: text(value.classification) as PdfClassification, status: text(value.status) as PdfStatus, sourceAuthority: text(value.sourceAuthority), sourceUrl, retrievedAt: text(value.retrievedAt), reviewedAt: text(value.reviewedAt), ...(text(value.nextReviewAt) ? { nextReviewAt: text(value.nextReviewAt) } : {}), extractionMode: text(value.extractionMode) as WaveCPdfFixture['extractionMode'], documentText: text(value.documentText), ...(text(value.expectedDocumentSha256) ? { expectedDocumentSha256: text(value.expectedDocumentSha256) } : {}), records: Array.isArray(value.records) ? sorted(value.records.map(parseRecord), (item) => item.canonicalId) : [] };
  if (fixture.schemaVersion !== 1 || !WAVE_C_STATES.includes(state) || fixture.electionYear !== 2026 || sourceHost !== hosts[state] || !fixture.sourceAuthority || !iso(fixture.retrievedAt) || !iso(fixture.reviewedAt) || (fixture.nextReviewAt && !iso(fixture.nextReviewAt)) || (fixture.expectedDocumentSha256 && !/^[a-f0-9]{64}$/.test(fixture.expectedDocumentSha256)) || !['calendar', 'candidate_list', 'gubernatorial_contest', 'statewide_measures', 'unsupported'].includes(fixture.classification) || !['available', 'preliminary', 'not_yet_published', 'officially_none', 'access_blocked', 'schema_drift', 'unsupported_pdf'].includes(fixture.status) || !['reviewed_text_fixture', 'born_digital_text'].includes(fixture.extractionMode) || !fixture.documentText) throw new Error('invalid or unallowlisted PDF fixture');
  if (classifyOfficialPdf(fixture.documentText) !== fixture.classification) throw new Error(`schema drift: ${state} fixture classification no longer matches its reviewed text`);
  if ((fixture.classification === 'calendar' || fixture.classification === 'unsupported') && fixture.records.length) throw new Error('calendar/unsupported PDF cannot contain ballot records');
  if (fixture.status === 'unsupported_pdf' && fixture.records.length) throw new Error('unsupported PDF cannot contain records');
  if (fixture.status === 'not_yet_published' && !fixture.nextReviewAt) throw new Error('unpublished PDF requires next review');
  if (new Set(fixture.records.map((item) => item.canonicalId)).size !== fixture.records.length) throw new Error('duplicate canonical PDF record');
  return fixture;
}

export function parseWaveCPdfProviderResult(value: unknown): WaveCPdfProviderResult {
  const fixture = normalizeWaveCPdfFixture(value);
  if (fixture.records.some((item) => item.qualificationStatus !== 'on_ballot' || item.finalBallot !== true)) throw new Error('non-final or withdrawn PDF record cannot be accepted');
  const documentSha256 = digest(fixture.documentText);
  const evidence = { state: fixture.state, sourceAuthority: fixture.sourceAuthority, sourceUrl: fixture.sourceUrl, reviewedAt: fixture.reviewedAt, documentSha256, classification: fixture.classification, records: fixture.records };
  const capabilities = fixture.classification === 'candidate_list' ? ['candidateList'] : fixture.classification === 'gubernatorial_contest' ? ['governorRace'] : fixture.classification === 'statewide_measures' ? ['statewideMeasure'] : [];
  return { ...fixture, documentSha256, evidenceDigest: digest(evidence), diagnostics: fixture.classification === 'calendar' ? ['calendar_not_ballot_list'] : [], capabilities };
}

export function buildWaveCReport(fixtures: Record<WaveCState, unknown>): WaveCReport {
  const states = Object.fromEntries(WAVE_C_STATES.map((state) => [state, parseWaveCPdfProviderResult(fixtures[state])])) as Record<WaveCState, WaveCPdfProviderResult>;
  const classification = { calendar: 0, candidate_list: 0, gubernatorial_contest: 0, statewide_measures: 0, unsupported: 0 }; const status = { available: 0, preliminary: 0, not_yet_published: 0, officially_none: 0, access_blocked: 0, schema_drift: 0, unsupported_pdf: 0 }; const extractionMode = { reviewed_text_fixture: 0, born_digital_text: 0 }; const ids = new Set<string>(); let duplicateCanonicalIds = 0;
  for (const item of Object.values(states)) { classification[item.classification] += 1; status[item.status] += 1; extractionMode[item.extractionMode] += 1; item.records.forEach((entry) => { if (ids.has(entry.canonicalId)) duplicateCanonicalIds += 1; ids.add(entry.canonicalId); }); }
  const inputDigest = digest(Object.fromEntries(WAVE_C_STATES.map((state) => [state, normalizeWaveCPdfFixture(fixtures[state])] ))); const documentDigest = digest(Object.values(states).map((item) => ({ state: item.state, documentSha256: item.documentSha256 }))); const evidenceDigest = digest(Object.values(states).map((item) => ({ state: item.state, evidenceDigest: item.evidenceDigest }))); const counts = { states: 2, classification, status, capabilities: Object.values(states).reduce((total, item) => total + item.capabilities.length, 0), records: Object.values(states).reduce((total, item) => total + item.records.length, 0), extractionMode, conflicts: 0, schemaDrift: 0, duplicateCanonicalIds, ambiguousAcceptedIdentities: 0 };
  return { operation: 'offline-wave-c-pdf-provider-audit', inputDigest, documentDigest, evidenceDigest, planDigest: digest({ states, counts }), states, counts };
}

/** Fetches once, refuses redirects/foreign hosts/large/non-PDF payloads, and never invokes OCR. */
export async function fetchWaveCPdfProvider(state: WaveCState, fixtureInput: unknown, fetchImpl: typeof fetch = fetch): Promise<WaveCPdfProviderResult> {
  const fixture = normalizeWaveCPdfFixture(fixtureInput); if (fixture.state !== state) throw new Error(`fixture state mismatch: ${state}`);
  const response = await fetchImpl(fixture.sourceUrl, { redirect: 'manual', headers: { accept: 'application/pdf' } });
  if (response.status >= 300 && response.status < 400) throw new Error(`${state} PDF redirect rejected`);
  if (!response.ok) throw new Error(`${state} PDF request failed: ${response.status}`);
  if (!/^application\/pdf(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error(`${state} PDF content-type rejected`);
  const declared = Number(response.headers.get('content-length') ?? '0'); if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${state} PDF exceeds size limit`);
  const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > maxBytes) throw new Error(`${state} PDF exceeds size limit`);
  const extracted = extractPdfText(bytes); const classification = classifyOfficialPdf(extracted.text);
  if (classification !== fixture.classification) throw new Error(`${state} schema drift: document classification changed`);
  if (fixture.expectedDocumentSha256 && fixture.expectedDocumentSha256 !== extracted.documentSha256) throw new Error(`${state} schema drift: document digest changed`);
  return { ...parseWaveCPdfProviderResult(fixture), extractionMode: extracted.extractionMode, documentSha256: extracted.documentSha256 };
}
