import assert from 'node:assert/strict';
import { buildFecFilingResearch, buildFecFinanceResearch } from './fecFinance.js';

const result = buildFecFinanceResearch(
  { id: 'jane-doe', name: 'Jane Doe', party: 'Democrat', externalIds: { fecCandidateId: 'H6GA00001' } },
  { id: '2026-GA-house-001', state: 'GA', office: 'House', district: '001', electionYear: 2026, mode: 'live', status: 'upcoming', closeDate: '2026-11-03T23:59:59Z', candidates: [] },
  {
    committees: [{ name: 'Jane Doe for Congress' }],
    totals: [{ coverage_end_date: '2026-06-30', receipts: 125000, disbursements: 45000, cash_on_hand_end_period: 80000, debts_owed_by_committee: 5000 }],
    independentExpenditures: [
      { support_oppose_indicator: 'S', total: 12000 },
      { support_oppose_indicator: 'O', total: 7000 },
    ],
  },
  '2026-07-18T00:00:00Z',
);

assert.equal(result.section.title, 'Federal Campaign Finance');
assert.ok(result.section.bullets?.some((line) => line.includes('Total receipts: $125,000')));
assert.ok(result.section.bullets?.some((line) => line.includes('supporting the candidate: $12,000')));
assert.ok(result.section.bullets?.some((line) => line.includes('opposing the candidate: $7,000')));
assert.equal(result.source.type, 'official');

const missingTotals = buildFecFinanceResearch(
  { id: 'john-doe', name: 'John Doe', party: 'Republican', externalIds: { fecCandidateId: 'S6GA00002' } },
  { id: '2026-GA-senate', state: 'GA', office: 'Senate', electionYear: 2026, mode: 'live', status: 'upcoming', closeDate: '2026-11-03T23:59:59Z', candidates: [] },
  { committees: [], totals: [], independentExpenditures: [] },
);
assert.ok(missingTotals.section.bullets?.includes('No processed cycle financial totals are available from the FEC yet.'));

const filing = buildFecFilingResearch(
  {
    id: 'jane-doe',
    name: 'Jane Doe',
    party: 'Democrat',
    qualificationStatus: 'filed',
    externalIds: { fecCandidateId: 'H6GA00001' },
  },
  {
    id: '2026-GA-house-001',
    state: 'GA',
    office: 'House',
    district: '001',
    electionYear: 2026,
    mode: 'live',
    status: 'upcoming',
    closeDate: '2026-11-03T23:59:59Z',
    candidates: [],
  },
  [{ name: 'Jane Doe for Congress' }],
  '2026-07-18T00:00:00Z',
);
assert.equal(filing.section.title, 'Federal Filing Profile');
assert.ok(filing.section.body?.includes('FEC filing'));
assert.ok(filing.section.bullets?.includes('FEC candidate ID: H6GA00001.'));
assert.ok(filing.section.bullets?.some((line) => line.includes('does not confirm ballot qualification')));
assert.equal(filing.source.type, 'official');

console.log('FEC finance mapping tests passed');
