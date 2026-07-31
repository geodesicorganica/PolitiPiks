import assert from 'node:assert/strict';
import { FEC_ALL_CANDIDATES_COLUMNS, FEC_BULK_URL, inspectFecBulkCandidateSummary, normalizeFecBulkFinance, parseFecBulkCandidateSummary, validateFecBulkFinanceSnapshot } from './fecBulkFinance.js';

const header = FEC_ALL_CANDIDATES_COLUMNS.join('|');
const row = (id: string, state: string, district: string, options: { receipts?: string; cash?: string; coverage?: string } = {}) => [id, 'Private Name', 'C', 'DEM', 'DEM', options.receipts ?? '-12', '0', '12', '0', '0', options.cash ?? '', '0', '0', '0', '0', '0', '-3', '0', state, district, '', '', '', '', '', '', '', options.coverage ?? '03/31/2026', '0', '0'].join('|');
const house = row('H6GA01075', 'GA', '01');
const senate = row('S6GA00002', 'GA', '00');
const president = row('P80001571', '', '');
const source = `${house}\n${senate}\n${president}\n`;

const inspected = inspectFecBulkCandidateSummary(source);
assert.equal(inspected.headerPresent, false, 'official headerless input is recognized');
assert.equal(inspected.rawRowCount, 3); assert.equal(inspected.houseSenateRowCount, 2); assert.equal(inspected.ignoredPresidentialCount, 1);
const rows = parseFecBulkCandidateSummary(source);
assert.equal(rows[0]?.fecCandidateId, 'H6GA01075', 'the first headerless source record is retained');
assert.equal(rows[0]?.receipts, -12, 'official signed monetary values are retained'); assert.equal(rows[0]?.cashOnHand, null, 'blank finance values remain missing');
assert.deepEqual(rows.map((item) => item.office), ['House', 'Senate', 'President'], 'H/S/P identifiers are classified at the raw boundary');
assert.equal(inspectFecBulkCandidateSummary(`${header}\n${source}`).headerPresent, true, 'an exact fixture header is accepted');
assert.throws(() => parseFecBulkCandidateSummary(`${header.replace('TTL_RECEIPTS', 'BAD')}\n${source}`), /header/, 'a malformed header fails closed');
assert.throws(() => parseFecBulkCandidateSummary(`${house}\n${house}\n`), /duplicate/, 'duplicate FEC IDs fail closed across all raw rows');
assert.throws(() => parseFecBulkCandidateSummary(`${house.split('|').slice(0, 29).join('|')}\n`), /malformed/, 'wrong row width fails closed');
assert.throws(() => parseFecBulkCandidateSummary(`${row('H6GA01075', 'GA', '01', { coverage: '02/30/2026' })}\n`), /coverage date/, 'invalid calendar dates fail closed');
assert.throws(() => parseFecBulkCandidateSummary(`${row('H6GA01075', 'GA', '01', { receipts: 'not-number' })}\n`), /monetary/, 'invalid monetary values fail closed');

const input = { contents: source, archiveDigest: 'a'.repeat(64), capturedAt: '2026-07-30T00:00:00.000Z', sourceSnapshotInputDigest: 'b'.repeat(64), canonical: [
  { raceId: '2026-GA-house-001', candidateId: 'fec-H6GA01075', fecCandidateId: 'H6GA01075', state: 'GA', district: '001', office: 'House' as const },
  { raceId: '2026-GA-senate', candidateId: 'fec-S6GA00002', fecCandidateId: 'S6GA00002', state: 'GA', district: null, office: 'Senate' as const },
] };
const plan = normalizeFecBulkFinance(input);
assert.equal(plan.matchedCandidates, 2); assert.equal(plan.unavailableCandidates, 0); assert.equal(plan.capture.records[0]?.totals[0]?.receipts, -12); assert.equal(plan.provenance.ignoredPresidentialCount, 1);
assert.equal(JSON.stringify(plan).includes('Private Name'), false, 'privacy projection excludes candidate names'); assert.equal(JSON.stringify(plan).includes('api_key'), false); assert.equal(plan.sourceUrl, FEC_BULK_URL);
assert.equal(plan.candidateFacts[0]?.district, '001', 'numeric House district matching preserves canonical district identity');
assert.equal(plan.inputDigest, normalizeFecBulkFinance({ ...input, canonical: [...input.canonical].reverse() }).inputDigest, 'normalization digest is deterministic under canonical input order');
assert.throws(() => normalizeFecBulkFinance({ ...input, canonical: [{ ...input.canonical[0]!, district: '002' }] }), /identity conflict/, 'House district conflicts fail closed');
assert.throws(() => validateFecBulkFinanceSnapshot({ ...plan, archiveDigest: '0'.repeat(64) }), /digest/, 'archive digest tampering fails closed');
assert.throws(() => validateFecBulkFinanceSnapshot({ ...plan, inputDigest: '0'.repeat(64) }), /digest/, 'snapshot digest tampering fails closed');
assert.deepEqual(validateFecBulkFinanceSnapshot(plan), plan, 'validated snapshots retain the complete privacy-projected plan');
console.log('FEC bulk finance tests passed');
