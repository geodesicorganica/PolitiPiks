import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFecFinanceBaselinePlan, buildFecFinanceDepthPlan, buildFecFinanceCaptureSnapshot, captureFecFinance, canonicalFinanceCandidates, FecCallBudgetExhausted, validateFecFinanceCaptureSnapshot } from './fecFinanceDepth.js';
import { validateResearchMetricsBaselineSnapshot } from './researchMetricsBaseline.js';

const source = { inputDigest: 'a'.repeat(64), capturedAt: '2026-07-30T00:00:00.000Z' };
const records = [
  { raceId: '2026-GA-house-001', candidateId: 'fec-H6GA00001', fecCandidateId: 'H6GA00001', sourceUrl: 'https://api.open.fec.gov/v1/candidate/H6GA00001/totals/?cycle=2026', retrievedAt: '2026-07-30T00:00:00.000Z', cycle: 2026, totals: [{ coverage_end_date: '2026-06-30', receipts: 120, disbursements: 20, cash_on_hand_end_period: 100, debts_owed_by_committee: 0, committee_id: 'C001' }], independentExpenditures: [] },
  { raceId: '2026-GA-house-001', candidateId: 'fec-H6GA00002', fecCandidateId: 'H6GA00002', sourceUrl: 'https://api.open.fec.gov/v1/candidate/H6GA00002/totals/?cycle=2026', retrievedAt: '2026-07-30T00:00:00.000Z', cycle: 2026, totals: [{ coverage_end_date: '2026-06-30', receipts: 80, disbursements: 10, cash_on_hand_end_period: 70, debts_owed_by_committee: 0, committee_id: 'C002' }], independentExpenditures: [] },
];
const capture = buildFecFinanceCaptureSnapshot({ source, state: 'GA', calls: 4, maxCalls: 300, records });
assert.equal(JSON.stringify(capture).includes('api_key'), false, 'capture snapshots never project API credentials');
const plan = buildFecFinanceDepthPlan(capture, { races: [{ id: '2026-GA-house-001', state: 'GA', candidates: records.map((record) => ({ id: record.candidateId, externalIds: { fecCandidateId: record.fecCandidateId } })) }] });
assert.equal(plan.audit.comparativePresent, 1, 'same-race compatible official periods become comparable');
assert.equal(plan.raceMetrics[0]?.comparativeFinance.availability, 'present');
assert.equal(plan.candidateResearch.length, 2); assert.equal(plan.candidateResearch[0]?.finance.availability, 'present');
assert.equal(plan.planDigest, buildFecFinanceDepthPlan(capture, { races: [{ id: '2026-GA-house-001', state: 'GA', candidates: records.map((record) => ({ id: record.candidateId, externalIds: { fecCandidateId: record.fecCandidateId } })) }] }).planDigest, 'replay is deterministic');
assert.throws(() => validateFecFinanceCaptureSnapshot({ ...capture, inputDigest: '0'.repeat(64) }), /digest/, 'digest tampering fails closed');
assert.throws(() => buildFecFinanceCaptureSnapshot({ source, state: 'GA', calls: 301, maxCalls: 300, records }), /budget/, 'call budget fails closed');
assert.throws(() => buildFecFinanceCaptureSnapshot({ source, state: 'GA', calls: 4, maxCalls: 300, records: [...records, records[0]] }), /duplicate/, 'duplicate candidate records fail closed');
assert.equal(buildFecFinanceCaptureSnapshot({ source, state: 'GA', calls: 4, maxCalls: 300, records: [{ ...records[0], totals: [{ ...records[0].totals[0], receipts: -1 }] }] }).records[0]?.totals[0]?.receipts, -1, 'official signed finance adjustments are preserved');
const incompatible = buildFecFinanceCaptureSnapshot({ source, state: 'GA', calls: 4, maxCalls: 300, records: [{ ...records[0], totals: [{ ...records[0].totals[0], coverage_end_date: '2026-06-30' }] }, { ...records[1], totals: [{ ...records[1].totals[0], coverage_end_date: '2026-03-31' }] }] });
assert.equal(buildFecFinanceDepthPlan(incompatible, { races: [{ id: '2026-GA-house-001', state: 'GA', candidates: records.map((record) => ({ id: record.candidateId, externalIds: { fecCandidateId: record.fecCandidateId } })) }] }).raceMetrics[0]?.comparativeFinance.availability, 'partial', 'incompatible reporting periods never compare');
let calls = 0;
const bounded = await captureFecFinance({ sourceSnapshotInputDigest: 'a'.repeat(64), capturedAt: '2026-07-30T00:00:00.000Z', state: 'GA', limit: 1, maxCalls: 2, candidates: [{ raceId: '2026-GA-house-001', state: 'GA', candidateId: 'fec-H6GA00001', fecCandidateId: 'H6GA00001' }], request: async () => { calls += 1; return { results: [], pagination: { pages: 1 } }; } });
assert.equal(calls, 2); assert.equal(bounded.calls, 2, 'capture counts every official endpoint call');
await assert.rejects(() => captureFecFinance({ sourceSnapshotInputDigest: 'a'.repeat(64), capturedAt: '2026-07-30T00:00:00.000Z', state: 'GA', limit: 1, maxCalls: 1, candidates: [{ raceId: '2026-GA-house-001', state: 'GA', candidateId: 'fec-H6GA00001', fecCandidateId: 'H6GA00001' }], request: async () => ({ results: [], pagination: { pages: 1 } }) }), FecCallBudgetExhausted, 'budget stops before a second endpoint call');
const publication = validateResearchMetricsBaselineSnapshot(JSON.parse(readFileSync('.artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json', 'utf8')));
const canonical = canonicalFinanceCandidates(publication, 'GA'); assert.equal(canonical.length, 101, 'canonical Georgia candidates come from the 470-seat plan');
const firstCanonical = canonical[0]!;
const fullCapture = buildFecFinanceCaptureSnapshot({ source: { inputDigest: publication.inputDigest, capturedAt: '2026-07-30T00:00:00.000Z' }, state: 'GA', calls: 2, maxCalls: 300, records: [{ raceId: firstCanonical.raceId, candidateId: firstCanonical.candidateId, fecCandidateId: firstCanonical.fecCandidateId, sourceUrl: `https://api.open.fec.gov/v1/candidate/${firstCanonical.fecCandidateId}/totals/?cycle=2026`, retrievedAt: '2026-07-30T00:00:00.000Z', cycle: 2026, totals: [], independentExpenditures: [] }] });
const full = buildFecFinanceBaselinePlan(publication, fullCapture);
assert.equal(full.documents.filter((document) => document.path.includes('/candidateResearch/')).length, 2384); assert.equal(full.documents.filter((document) => document.path.startsWith('ballotMeasures/')).length, 14); assert.equal(full.documents.filter((document) => document.path.startsWith('contestMetrics/')).length, 470, 'finance merge preserves every G6.1 cardinality');
assert.equal(full.audit.orphanDocuments, 0); assert.equal(full.audit.duplicateDocuments, 0); assert.equal(full.audit.leakage, 0);
console.log('FEC finance depth tests passed');
