import { createHash } from 'node:crypto';
import { buildFecFinanceCaptureSnapshot, validateFecFinanceCaptureSnapshot, type FecFinanceCaptureRecord, type FecFinanceCaptureSnapshot } from './fecFinanceDepth.js';

export const FEC_BULK_URL = 'https://www.fec.gov/files/bulk-downloads/2026/weball26.zip';
export const FEC_BULK_SCHEMA_SOURCE = 'https://www.fec.gov/campaign-finance-data/all-candidates-file-description/';
export const FEC_ALL_CANDIDATES_COLUMNS = ['CAND_ID','CAND_NAME','CAND_ICI','PTY_CD','CAND_PTY_AFFILIATION','TTL_RECEIPTS','TRANS_FROM_AUTH','TTL_DISB','TRANS_TO_AUTH','COH_BOP','COH_COP','CAND_CONTRIB','CAND_LOANS','OTHER_LOANS','CAND_LOAN_REPAY','OTHER_LOAN_REPAY','DEBTS_OWED_BY','TTL_INDIV_CONTRIB','CAND_OFFICE_ST','CAND_OFFICE_DISTRICT','SPEC_ELECTION','PRIM_ELECTION','RUN_ELECTION','GEN_ELECTION','GEN_ELECTION_PRECENT','OTHER_POL_CMTE_CONTRIB','POL_PTY_CONTRIB','CVG_END_DT','INDIV_REFUNDS','CMTE_REFUNDS'] as const;

export type CanonicalFecFinanceCandidate = { raceId: string; candidateId: string; fecCandidateId: string; state: string; district: string | null; office: 'House' | 'Senate' };
export type FecBulkOffice = 'House' | 'Senate' | 'President';
export type FecBulkCandidateRow = { fecCandidateId: string; state: string | null; district: string | null; office: FecBulkOffice; party: string | null; incumbentStatus: string | null; coverageEndDate: string; receipts: number | null; disbursements: number | null; cashOnHand: number | null; debtsOwed: number | null };
export type FecBulkParseResult = { headerPresent: boolean; rawRowCount: number; houseSenateRowCount: number; ignoredPresidentialCount: number; rows: FecBulkCandidateRow[] };
export type FecBulkFinanceSnapshot = { schemaVersion: 1; sourceUrl: typeof FEC_BULK_URL; archiveDigest: string; inputDigest: string; provenance: { schemaSource: typeof FEC_BULK_SCHEMA_SOURCE; headerPresent: boolean; rawRowCount: number; houseSenateRowCount: number; ignoredPresidentialCount: number; archiveDigest: string; capturedAt: string }; capture: FecFinanceCaptureSnapshot; candidateFacts: Array<{ raceId: string; candidateId: string; fecCandidateId: string; office: 'House' | 'Senate'; state: string; district: string | null; party: string | null; incumbentStatus: string | null; coverageEndDate: string }> ; matchedCandidates: number; unavailableCandidates: number };

const text = (value: string) => value.trim();
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value);
const hash = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const isDigest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && (() => { const [year, month, day] = value.split('-').map(Number); const parsed = new Date(Date.UTC(year!, month! - 1, day!)); return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day; })();
const coverageDate = (value: string, id: string) => { const valueText = text(value); const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valueText); if (!match) throw new Error(`invalid FEC coverage date: ${id}`); const normalized = `${match[3]}-${match[1]}-${match[2]}`; if (!isIsoDate(normalized)) throw new Error(`invalid FEC coverage date: ${id}`); return normalized; };
const money = (value: string, name: string) => { const valueText = text(value); if (!valueText) return null; const parsed = Number(valueText); if (!Number.isFinite(parsed)) throw new Error(`invalid monetary field: ${name}`); return parsed; };
const office = (id: string): FecBulkOffice | null => /^H\d[A-Z]{2}\d{5}$/.test(id) ? 'House' : /^S\d[A-Z]{2}\d{5}$/.test(id) ? 'Senate' : /^P\d{8}$/.test(id) ? 'President' : null;
const exactHeader = (values: string[]) => values.length === FEC_ALL_CANDIDATES_COLUMNS.length && values.every((value, index) => text(value) === FEC_ALL_CANDIDATES_COLUMNS[index]);
const ordered = <T>(values: T[], key: (value: T) => string) => [...values].sort((left, right) => key(left).localeCompare(key(right)));

/** Parses the FEC's documented 30-field layout. The official bulk file is headerless; exact-header fixtures are also supported. */
export function inspectFecBulkCandidateSummary(contents: string): FecBulkParseResult {
  const lines = contents.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length) throw new Error('empty FEC bulk file');
  const first = lines[0]!.split('|');
  const firstId = text(first[0] ?? '');
  const headerPresent = exactHeader(first);
  if (!headerPresent && !office(firstId)) {
    throw new Error('unexpected FEC all-candidates header/schema');
  }
  const data = headerPresent ? lines.slice(1) : lines;
  if (!data.length) throw new Error('empty FEC bulk data');
  const ids = new Set<string>();
  const rows = data.map((line, index) => {
    const values = line.split('|');
    const rowNumber = index + (headerPresent ? 2 : 1);
    if (values.length !== FEC_ALL_CANDIDATES_COLUMNS.length) throw new Error(`malformed FEC bulk row ${rowNumber}`);
    const fecCandidateId = text(values[0]!);
    const kind = office(fecCandidateId);
    if (!kind || ids.has(fecCandidateId)) throw new Error(`invalid or duplicate FEC candidate id: ${fecCandidateId}`);
    ids.add(fecCandidateId);
    const state = text(values[18]!);
    const district = text(values[19]!);
    if (kind !== 'President' && !/^[A-Z]{2}$/.test(state)) throw new Error(`invalid FEC state: ${fecCandidateId}`);
    return { fecCandidateId, state: kind === 'President' ? null : state, district: district || null, office: kind, party: text(values[4]!) || null, incumbentStatus: text(values[2]!) || null, coverageEndDate: coverageDate(values[27]!, fecCandidateId), receipts: money(values[5]!, 'TTL_RECEIPTS'), disbursements: money(values[7]!, 'TTL_DISB'), cashOnHand: money(values[10]!, 'COH_COP'), debtsOwed: money(values[16]!, 'DEBTS_OWED_BY') };
  });
  return { headerPresent, rawRowCount: rows.length, houseSenateRowCount: rows.filter((row) => row.office !== 'President').length, ignoredPresidentialCount: rows.filter((row) => row.office === 'President').length, rows };
}

export function parseFecBulkCandidateSummary(contents: string): FecBulkCandidateRow[] { return inspectFecBulkCandidateSummary(contents).rows; }

function districtCompatible(candidate: CanonicalFecFinanceCandidate, row: FecBulkCandidateRow): boolean {
  if (candidate.office === 'Senate') return row.district === null || Number(row.district) === 0;
  return row.district !== null && /^\d+$/.test(row.district) && candidate.district !== null && Number(candidate.district) === Number(row.district);
}

export function normalizeFecBulkFinance(input: { contents: string; archiveDigest: string; capturedAt: string; sourceSnapshotInputDigest: string; canonical: CanonicalFecFinanceCandidate[] }): FecBulkFinanceSnapshot {
  if (!isDigest(input.archiveDigest) || !isDigest(input.sourceSnapshotInputDigest) || !Number.isFinite(Date.parse(input.capturedAt))) throw new Error('invalid bulk capture metadata');
  const parsed = inspectFecBulkCandidateSummary(input.contents);
  const byId = new Map(parsed.rows.map((row) => [row.fecCandidateId, row]));
  const records: FecFinanceCaptureRecord[] = [];
  const candidateFacts: FecBulkFinanceSnapshot['candidateFacts'] = [];
  for (const candidate of ordered(input.canonical, (item) => `${item.raceId}/${item.candidateId}`)) {
    const row = byId.get(candidate.fecCandidateId);
    if (!row) continue;
    if (row.office === 'President' || row.office !== candidate.office || row.state !== candidate.state || !districtCompatible(candidate, row)) throw new Error(`FEC bulk identity conflict: ${candidate.fecCandidateId}`);
    records.push({ raceId: candidate.raceId, candidateId: candidate.candidateId, fecCandidateId: candidate.fecCandidateId, sourceUrl: FEC_BULK_URL, retrievedAt: input.capturedAt, cycle: 2026, totals: [{ coverage_end_date: row.coverageEndDate, receipts: row.receipts, disbursements: row.disbursements, cash_on_hand_end_period: row.cashOnHand, debts_owed_by_committee: row.debtsOwed }], independentExpenditures: [] });
    candidateFacts.push({ raceId: candidate.raceId, candidateId: candidate.candidateId, fecCandidateId: candidate.fecCandidateId, office: candidate.office, state: candidate.state, district: candidate.district, party: row.party, incumbentStatus: row.incumbentStatus, coverageEndDate: row.coverageEndDate });
  }
  const capture = buildFecFinanceCaptureSnapshot({ source: { inputDigest: input.sourceSnapshotInputDigest, capturedAt: input.capturedAt }, state: 'US', calls: 0, maxCalls: 0x7fffffff, records, capturedAt: input.capturedAt });
  const provenance: FecBulkFinanceSnapshot['provenance'] = { schemaSource: FEC_BULK_SCHEMA_SOURCE, headerPresent: parsed.headerPresent, rawRowCount: parsed.rawRowCount, houseSenateRowCount: parsed.houseSenateRowCount, ignoredPresidentialCount: parsed.ignoredPresidentialCount, archiveDigest: input.archiveDigest, capturedAt: input.capturedAt };
  const normalizedFacts = ordered(candidateFacts, (item) => `${item.raceId}/${item.candidateId}`);
  const payload = { archiveDigest: input.archiveDigest, provenance, capture, candidateFacts: normalizedFacts, matchedCandidates: records.length, unavailableCandidates: input.canonical.length - records.length };
  return { schemaVersion: 1, sourceUrl: FEC_BULK_URL, ...payload, inputDigest: hash(payload) };
}

export function validateFecBulkFinanceSnapshot(value: unknown): FecBulkFinanceSnapshot {
  if (!value || typeof value !== 'object') throw new Error('invalid FEC bulk finance snapshot');
  const snapshot = value as Partial<FecBulkFinanceSnapshot>;
  if (snapshot.schemaVersion !== 1 || snapshot.sourceUrl !== FEC_BULK_URL || !isDigest(snapshot.archiveDigest) || !snapshot.provenance || snapshot.provenance.schemaSource !== FEC_BULK_SCHEMA_SOURCE || typeof snapshot.provenance.headerPresent !== 'boolean' || !Number.isInteger(snapshot.provenance.rawRowCount) || !Number.isInteger(snapshot.provenance.houseSenateRowCount) || !Number.isInteger(snapshot.provenance.ignoredPresidentialCount) || !Number.isFinite(Date.parse(snapshot.provenance.capturedAt ?? '')) || !Array.isArray(snapshot.candidateFacts) || !Number.isInteger(snapshot.matchedCandidates) || !Number.isInteger(snapshot.unavailableCandidates)) throw new Error('invalid FEC bulk finance snapshot');
  if (snapshot.provenance.archiveDigest !== snapshot.archiveDigest) throw new Error('FEC bulk archive digest mismatch');
  const capture = validateFecFinanceCaptureSnapshot(snapshot.capture);
  if (snapshot.provenance.rawRowCount < snapshot.provenance.houseSenateRowCount || snapshot.provenance.rawRowCount !== snapshot.provenance.houseSenateRowCount + snapshot.provenance.ignoredPresidentialCount || snapshot.candidateFacts.length !== snapshot.matchedCandidates || capture.records.length !== snapshot.matchedCandidates) throw new Error('invalid FEC bulk finance counts');
  const payload = { archiveDigest: snapshot.archiveDigest, provenance: snapshot.provenance, capture, candidateFacts: ordered(snapshot.candidateFacts, (item) => `${item.raceId}/${item.candidateId}`), matchedCandidates: snapshot.matchedCandidates, unavailableCandidates: snapshot.unavailableCandidates };
  if (snapshot.inputDigest !== hash(payload)) throw new Error('FEC bulk finance digest mismatch');
  return { schemaVersion: 1, sourceUrl: FEC_BULK_URL, ...payload, inputDigest: snapshot.inputDigest } as FecBulkFinanceSnapshot;
}
