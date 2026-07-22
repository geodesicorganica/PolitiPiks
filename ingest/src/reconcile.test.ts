import assert from 'node:assert/strict';
import { reconcileCandidates } from './reconcile.js';

const existing = [
  { id: 'legacy-jane', name: 'Jane Doe', party: 'Democrat', externalIds: { fecCandidateId: 'H6GA01001' }, visibility: 'visible' },
  { id: 'legacy-pick', name: 'Protected Pick', party: 'Independent' },
];
const incoming = [
  { id: 'fec-H6GA01001', name: 'Jane Doe', party: 'Democrat', externalIds: { fecCandidateId: 'H6GA01001' }, qualificationStatus: 'filed', pickEligibility: 'ineligible' },
  { id: 'fec-H6GA01002', name: 'New Candidate', party: 'Republican', externalIds: { fecCandidateId: 'H6GA01002' } },
];

const result = reconcileCandidates(existing, incoming, new Set(['legacy-pick']));
assert.ok(result.candidates.some((candidate) => candidate.id === 'legacy-pick'), 'referenced candidates must never be deleted');
assert.ok(result.candidates.some((candidate) => candidate.id === 'legacy-jane'), 'legacy IDs must not be silently changed');
assert.ok(!result.candidates.some((candidate) => candidate.id === 'fec-H6GA01001'), 'conflicting FEC identity must require migration instead of duplicating a person');
assert.ok(result.candidates.some((candidate) => candidate.id === 'fec-H6GA01002'));
assert.equal(result.identityConflicts.length, 1);

console.log('candidate reconciliation tests passed');
