import { createHash } from 'node:crypto';
import { buildResearchMetricsBaseline, projectCertificationValue, validateResearchMetricsBaselineSnapshot, type ResearchMetricsBaselinePlan } from './researchMetricsBaseline.js';
import type { FecIndependentExpenditure } from './fecFinance.js';

type Json = Record<string, unknown>;
type Money = number | string | null | undefined;
type FecTotal = { coverage_end_date?: string; receipts?: Money; disbursements?: Money; cash_on_hand_end_period?: Money; debts_owed_by_committee?: Money; committee_id?: string; committee_name?: string };
export type FecFinanceCaptureRecord = { raceId: string; candidateId: string; fecCandidateId: string; sourceUrl: string; retrievedAt: string; cycle: number; totals: FecTotal[]; independentExpenditures: FecIndependentExpenditure[] };
export type FecFinanceCaptureSnapshot = { schemaVersion: 1; capturedAt: string; sourceSnapshotInputDigest: string; state: string; calls: number; maxCalls: number; records: FecFinanceCaptureRecord[]; inputDigest: string };
type Candidate = { id: string; externalIds?: { fecCandidateId?: string } };
type Race = { id: string; state: string; candidates: Candidate[] };
export type FinanceAvailability = { availability: 'present' | 'unavailable'; sourceId: string; sourceUrl: string; verificationLevel: 'official'; asOf: string; retrievedAt: string; cycle: number; filingPeriod: string | null; methodology: string; committee: { id: string | null; name: string | null }; values?: { totalReceipts: number | null; totalDisbursements: number | null; cashOnHand: number | null; debtsOwed: number | null; independentExpenditures: { support: number | null; oppose: number | null } } };
export type FecFinanceDepthPlan = { inputDigest: string; evidenceDigest: string; planDigest: string; candidateResearch: Array<{ raceId: string; candidateId: string; finance: FinanceAvailability }>; raceMetrics: Array<{ raceId: string; comparativeFinance: Json }>; audit: { comparativePresent: number; comparativePartial: number; unavailableCandidates: number; duplicateRecords: number; orphanRecords: number; leakage: number } };
export type FecFinanceBaselinePlan = ResearchMetricsBaselinePlan & { financeCaptureDigest: string; financeAudit: FecFinanceDepthPlan['audit']; sourceSnapshotInputDigest: string };
export type CanonicalFinanceCandidate = { raceId: string; state: string; candidateId: string; fecCandidateId: string };
export class FecCallBudgetExhausted extends Error {}

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const ordered = <T>(items: T[], key: (item: T) => string) => [...items].sort((a, b) => key(a).localeCompare(key(b)));
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(text(value)));
function money(value: Money, field: string): number | null { if (value === null || value === undefined || value === '') return null; const parsed = typeof value === 'number' ? value : Number(value); if (!Number.isFinite(parsed)) throw new Error(`invalid FEC money value: ${field}`); return parsed; }
function latest(totals: FecTotal[]) { return [...totals].sort((a, b) => Date.parse(text(b.coverage_end_date)) - Date.parse(text(a.coverage_end_date)))[0] ?? null; }
function independent(rows: FecIndependentExpenditure[], indicator: 'S' | 'O') { const values = rows.filter((row) => text(row.support_oppose_indicator).toUpperCase() === indicator).map((row) => money(row.total ?? row.expenditure_amount, 'independent expenditure')).filter((value): value is number => value !== null); return values.length ? values.reduce((sum, value) => sum + value, 0) : null; }
function validateRecord(record: unknown): asserts record is FecFinanceCaptureRecord {
  if (!isRecord(record) || !text(record.raceId) || !text(record.candidateId) || !/^[HS]\d[A-Z]{2}\d{5}$/.test(text(record.fecCandidateId)) || !(/^https:\/\/api\.open\.fec\.gov\/v1\//.test(text(record.sourceUrl)) || text(record.sourceUrl) === 'https://www.fec.gov/files/bulk-downloads/2026/weball26.zip') || !date(record.retrievedAt) || record.cycle !== 2026 || !Array.isArray(record.totals) || !Array.isArray(record.independentExpenditures)) throw new Error('malformed FEC finance capture record');
  for (const total of record.totals) { if (!isRecord(total) || !date(total.coverage_end_date)) throw new Error('malformed FEC total'); for (const field of ['receipts', 'disbursements', 'cash_on_hand_end_period', 'debts_owed_by_committee']) money(total[field] as Money, field); }
}
export function buildFecFinanceCaptureSnapshot(value: Omit<FecFinanceCaptureSnapshot, 'schemaVersion' | 'capturedAt' | 'inputDigest' | 'sourceSnapshotInputDigest'> & { source: { inputDigest: string; capturedAt: string }; capturedAt?: string }): FecFinanceCaptureSnapshot {
  if (!value || !value.source || !/^[a-f0-9]{64}$/.test(value.source.inputDigest) || !date(value.source.capturedAt) || !/^[A-Z]{2}$/.test(value.state) || !Number.isInteger(value.calls) || !Number.isInteger(value.maxCalls) || value.calls < 0 || value.maxCalls <= 0 || value.calls > value.maxCalls || !Array.isArray(value.records)) throw new Error('invalid FEC finance capture envelope or call budget');
  const keys = new Set<string>(); for (const record of value.records) { validateRecord(record); const key = `${record.raceId}/${record.candidateId}`; if (keys.has(key)) throw new Error(`duplicate FEC finance capture record: ${key}`); keys.add(key); }
  const records = ordered(value.records.map((record) => ({ ...record, totals: ordered(record.totals, (total) => `${text(total.coverage_end_date)}/${text(total.committee_id)}`), independentExpenditures: ordered(record.independentExpenditures, (item) => `${text(item.support_oppose_indicator)}/${String(item.total ?? item.expenditure_amount ?? '')}`) })), (record) => `${record.raceId}/${record.candidateId}`);
  const capturedAt = value.capturedAt ?? value.source.capturedAt;
  if (!date(capturedAt)) throw new Error('invalid FEC finance capture time');
  const input = { sourceSnapshotInputDigest: value.source.inputDigest, state: value.state, calls: value.calls, maxCalls: value.maxCalls, records };
  return { schemaVersion: 1, capturedAt, ...input, inputDigest: digest(input) };
}
export function validateFecFinanceCaptureSnapshot(value: unknown): FecFinanceCaptureSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1 || !date(value.capturedAt) || !text(value.sourceSnapshotInputDigest) || !Array.isArray(value.records)) throw new Error('invalid FEC finance capture snapshot');
  const snapshot = buildFecFinanceCaptureSnapshot({ source: { inputDigest: text(value.sourceSnapshotInputDigest), capturedAt: text(value.capturedAt) }, state: text(value.state), calls: value.calls as number, maxCalls: value.maxCalls as number, records: value.records as FecFinanceCaptureRecord[], capturedAt: text(value.capturedAt) });
  if (snapshot.inputDigest !== value.inputDigest) throw new Error('FEC finance capture digest mismatch'); return snapshot;
}
function finance(record: FecFinanceCaptureRecord): FinanceAvailability {
  const total = latest(record.totals); const sourceId = `fec-${record.fecCandidateId}-${record.cycle}`;
  const common = { sourceId, sourceUrl: record.sourceUrl, verificationLevel: 'official' as const, asOf: text(total?.coverage_end_date) || record.retrievedAt, retrievedAt: record.retrievedAt, cycle: record.cycle, filingPeriod: total?.coverage_end_date ?? null, committee: { id: text(total?.committee_id) || null, name: text(total?.committee_name) || null } };
  if (!total) return { availability: 'unavailable', ...common, methodology: 'The official FEC candidate totals endpoint returned no processed 2026 totals; missing data is not zero.' };
  return { availability: 'present', ...common, methodology: 'Official FEC candidate totals; values are not eligibility or forecast evidence.', values: { totalReceipts: money(total.receipts, 'receipts'), totalDisbursements: money(total.disbursements, 'disbursements'), cashOnHand: money(total.cash_on_hand_end_period, 'cash_on_hand_end_period'), debtsOwed: money(total.debts_owed_by_committee, 'debts_owed_by_committee'), independentExpenditures: { support: independent(record.independentExpenditures, 'S'), oppose: independent(record.independentExpenditures, 'O') } } };
}
export function buildFecFinanceDepthPlan(captureValue: unknown, options: { races: Race[] }): FecFinanceDepthPlan {
  const capture = validateFecFinanceCaptureSnapshot(captureValue); const races = ordered(options.races, (race) => race.id); const candidateKeys = new Map<string, Candidate>();
  for (const race of races) for (const candidate of race.candidates) candidateKeys.set(`${race.id}/${candidate.id}`, candidate);
  const seen = new Set<string>(); let orphanRecords = 0; const candidateResearch: FecFinanceDepthPlan['candidateResearch'] = [];
  for (const record of capture.records) { const key = `${record.raceId}/${record.candidateId}`; if (seen.has(key)) throw new Error(`duplicate FEC finance record: ${key}`); seen.add(key); const candidate = candidateKeys.get(key); if (!candidate || candidate.externalIds?.fecCandidateId !== record.fecCandidateId) { orphanRecords += 1; continue; } candidateResearch.push({ raceId: record.raceId, candidateId: record.candidateId, finance: finance(record) }); }
  if (orphanRecords) throw new Error(`unresolved FEC candidate identity: ${orphanRecords}`);
  const researchByRace = new Map<string, typeof candidateResearch>(); for (const item of candidateResearch) researchByRace.set(item.raceId, [...(researchByRace.get(item.raceId) ?? []), item]);
  let comparativePresent = 0; let comparativePartial = 0; const raceMetrics = races.map((race) => {
    const present = (researchByRace.get(race.id) ?? []).filter((item) => item.finance.availability === 'present'); const byPeriod = new Map<string, typeof present>(); for (const item of present) { const period = item.finance.filingPeriod!; byPeriod.set(period, [...(byPeriod.get(period) ?? []), item]); }
    const compatible = [...byPeriod.entries()].filter(([, items]) => items.length >= 2).sort(([left], [right]) => right.localeCompare(left))[0];
    if (compatible) { comparativePresent += 1; const [filingPeriod, items] = compatible; return { raceId: race.id, comparativeFinance: { availability: 'present', coverage: items.length === race.candidates.length ? 'complete' : 'partial', filingPeriod, methodology: 'Only canonical candidates in this race with the same official FEC coverage end date are compared.', candidates: ordered(items.map((item) => ({ candidateId: item.candidateId, ...item.finance.values })), (item) => item.candidateId) } }; }
    if (present.length) { comparativePartial += 1; return { raceId: race.id, comparativeFinance: { availability: 'partial', methodology: 'Official FEC totals exist but no compatible same-period pair is available; missing data is not zero.', candidates: ordered(present.map((item) => ({ candidateId: item.candidateId, filingPeriod: item.finance.filingPeriod })), (item) => item.candidateId) } }; }
    return { raceId: race.id, comparativeFinance: { availability: 'unavailable', methodology: 'No comparable official FEC totals were captured for this race.' } };
  });
  const audit = { comparativePresent, comparativePartial, unavailableCandidates: candidateResearch.filter((item) => item.finance.availability === 'unavailable').length, duplicateRecords: 0, orphanRecords, leakage: 0 };
  const inputDigest = digest({ capture: capture.inputDigest, races }); const evidenceDigest = digest({ candidateResearch, raceMetrics });
  return { inputDigest, evidenceDigest, planDigest: digest({ candidateResearch, raceMetrics, audit, evidenceDigest }), candidateResearch: ordered(candidateResearch, (item) => `${item.raceId}/${item.candidateId}`), raceMetrics: ordered(raceMetrics, (item) => item.raceId), audit };
}
export function buildFecFinanceBaselinePlan(snapshotValue: unknown, captureValue: unknown): FecFinanceBaselinePlan {
  const snapshot = validateResearchMetricsBaselineSnapshot(snapshotValue); const baseline = buildResearchMetricsBaseline(snapshot); const raceDocuments = baseline.documents.filter((document) => /^races\/[^/]+\/candidateResearch\//.test(document.path));
  const candidateByRace = new Map<string, Candidate[]>(); for (const document of raceDocuments) { const match = /^races\/([^/]+)\/candidateResearch\/([^/]+)$/.exec(document.path)!; const id = match[2]!; const fec = id.replace(/^fec-/, ''); candidateByRace.set(match[1]!, [...(candidateByRace.get(match[1]!) ?? []), { id, externalIds: { fecCandidateId: fec } }]); }
  const races: Race[] = [...candidateByRace.entries()].map(([id, candidates]) => ({ id, state: id.slice(5, 7), candidates })); const depth = buildFecFinanceDepthPlan(captureValue, { races }); const financeByCandidate = new Map(depth.candidateResearch.map((item) => [`${item.raceId}/${item.candidateId}`, item.finance])); const metricsByRace = new Map(depth.raceMetrics.map((item) => [item.raceId, item.comparativeFinance]));
  const documents = baseline.documents.map((document) => { const research = /^races\/([^/]+)\/candidateResearch\/([^/]+)$/.exec(document.path); if (research) { const finance = financeByCandidate.get(`${research[1]}/${research[2]}`); return finance ? { ...document, data: { ...document.data, fecFinance: finance } } : document; } if (/^contestMetrics\//.test(document.path)) { const comparativeFinance = metricsByRace.get(text(document.data.raceId)); return comparativeFinance ? { ...document, data: { ...document.data, comparativeFinance, baselineMetrics: { ...(document.data.baselineMetrics as Json), fieldAvailability: { ...((document.data.baselineMetrics as Json)?.fieldAvailability as Json), comparativeFinance: comparativeFinance.availability === 'present' ? 'present' : 'unavailable' } } } } : document; } return document; });
  const counts = { research: documents.filter((document) => /candidateResearch/.test(document.path)).length, measures: documents.filter((document) => document.path.startsWith('ballotMeasures/')).length, metrics: documents.filter((document) => document.path.startsWith('contestMetrics/')).length }; if (counts.research !== 2384 || counts.measures !== 14 || counts.metrics !== 470) throw new Error('G6.1 cardinality regression');
  const capture = validateFecFinanceCaptureSnapshot(captureValue); const certificationDocuments = projectCertificationValue(documents, snapshot.capturedAt); const evidenceDigest = digest({ baseline: baseline.evidenceDigest, finance: depth.evidenceDigest, documents: certificationDocuments }); const coverage = { ...baseline.coverage, metrics: { ...baseline.coverage.metrics, depth: { ...baseline.coverage.metrics.depth, comparativeFinance: { present: depth.audit.comparativePresent, unavailable: 470 - depth.audit.comparativePresent, not_applicable: 0 } } } };
  return { ...baseline, documents, inputDigest: digest({ baseline: baseline.inputDigest, financeCapture: capture.inputDigest }), evidenceDigest, planDigest: digest({ documents: certificationDocuments, coverage, finance: depth.audit, evidenceDigest }), coverage, financeCaptureDigest: capture.inputDigest, financeAudit: depth.audit, sourceSnapshotInputDigest: snapshot.inputDigest };
}
/** Uses the validated G6.1 baseline rather than the incomplete raw 467-race snapshot. */
export function canonicalFinanceCandidates(snapshotValue: unknown, state?: string): CanonicalFinanceCandidate[] {
  const snapshot = validateResearchMetricsBaselineSnapshot(snapshotValue); const plan = buildResearchMetricsBaseline(snapshot); const candidates: CanonicalFinanceCandidate[] = [];
  for (const document of plan.documents) { const match = /^races\/(2026-([A-Z]{2})-[^/]+)\/candidateResearch\/(fec-([HS]\d[A-Z]{2}\d{5}))$/.exec(document.path); if (!match || (state && match[2] !== state)) continue; candidates.push({ raceId: match[1]!, state: match[2]!, candidateId: match[3]!, fecCandidateId: match[4]! }); }
  return ordered(candidates, (item) => `${item.raceId}/${item.candidateId}`);
}
type FecPage = { results?: unknown[]; pagination?: { pages?: number } };
/** Bounded official fetcher; caller owns the secret-bearing HTTP transport and must never log its URL. */
export async function captureFecFinance(options: { sourceSnapshotInputDigest: string; capturedAt: string; state: string; candidates: CanonicalFinanceCandidate[]; limit: number; maxCalls: number; request: (path: string, page: number) => Promise<FecPage> }): Promise<FecFinanceCaptureSnapshot> {
  let calls = 0; const records: FecFinanceCaptureRecord[] = [];
  const requestAll = async (path: string) => { const results: unknown[] = []; let page = 1; let pages = 1; do { if (calls >= options.maxCalls) throw new FecCallBudgetExhausted(`FEC call budget exhausted at ${calls}/${options.maxCalls}`); calls += 1; const response = await options.request(path, page); if (!isRecord(response) || !Array.isArray(response.results)) throw new Error('malformed official FEC response'); results.push(...response.results); const next = response.pagination && isRecord(response.pagination) ? response.pagination.pages : 1; pages = Number.isInteger(next) && (next as number) >= 1 ? next as number : 1; page += 1; } while (page <= pages); return results; };
  for (const candidate of options.candidates.slice(0, options.limit)) {
    const totalsPath = `/candidate/${candidate.fecCandidateId}/totals/?cycle=2026&election_full=true`;
    const expendituresPath = `/schedules/schedule_e/by_candidate/?candidate_id=${candidate.fecCandidateId}&cycle=2026`;
    const totals = await requestAll(totalsPath) as FecTotal[]; const independentExpenditures = await requestAll(expendituresPath) as FecIndependentExpenditure[];
    records.push({ raceId: candidate.raceId, candidateId: candidate.candidateId, fecCandidateId: candidate.fecCandidateId, sourceUrl: `https://api.open.fec.gov/v1${totalsPath}`, retrievedAt: options.capturedAt, cycle: 2026, totals, independentExpenditures });
  }
  return buildFecFinanceCaptureSnapshot({ source: { inputDigest: options.sourceSnapshotInputDigest, capturedAt: options.capturedAt }, state: options.state, calls, maxCalls: options.maxCalls, records, capturedAt: options.capturedAt });
}
