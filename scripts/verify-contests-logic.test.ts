import assert from 'node:assert/strict';
import {
  findCanonical2026Issues,
  findMissing2024StateViewSlots,
  getYearStateCoverage,
  recordUnidentifiedCandidateName,
} from './verify-contests-logic.js';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../ingest/src/federalRegistry.js';

const coverageByYearState = new Map();
getYearStateCoverage(coverageByYearState, '2024', 'GA').President = 1;
getYearStateCoverage(coverageByYearState, '2024', 'GA').House = 14;
getYearStateCoverage(coverageByYearState, '2026', 'GA').House = 14;

assert.deepEqual(
  findMissing2024StateViewSlots(coverageByYearState, { GA: 14 }),
  [],
  '2026 races must not inflate or invalidate 2024 coverage',
);

const canonicalRaces = CANONICAL_2026_FEDERAL_CONTESTS.map((race) => ({
  ...race,
  electionYear: 2026,
  mode: 'live',
  candidates: [],
  eligibleCandidateIds: [],
}));
assert.deepEqual(findCanonical2026Issues(canonicalRaces), [], 'complete canonical seat registry activates cleanly');

const badCanonicalRaces = canonicalRaces.map((race) => ({ ...race }));
badCanonicalRaces[0] = {
  ...badCanonicalRaces[0],
  id: '2026-AL-house-99',
  candidates: [{ id: 'legacy-candidate', externalIds: { fecCandidateId: 'H6AL00001' }, qualificationStatus: 'on_ballot', pickEligibility: 'eligible' }],
  eligibleCandidateIds: ['legacy-candidate'],
};
const canonicalIssues = findCanonical2026Issues(badCanonicalRaces, [{ id: 'prediction-1', targetId: '2026-AL-house-99', pick: 'missing' }]);
assert.ok(canonicalIssues.some((issue) => issue.startsWith('unstable canonical contest ID:')));
assert.ok(canonicalIssues.some((issue) => issue.startsWith('unstable FEC candidate ID:')));
assert.ok(canonicalIssues.some((issue) => issue.startsWith('unverified on-ballot candidate:')));
assert.ok(canonicalIssues.some((issue) => issue.startsWith('ineligible pick exposed:')));
assert.ok(canonicalIssues.some((issue) => issue.startsWith('orphaned or ambiguous prediction:')));
assert.ok(canonicalIssues.some((issue) => issue.startsWith('prediction targets an ineligible candidate:')));

const seenNameParties = new Set<string>();
assert.equal(
  recordUnidentifiedCandidateName('Tamara Wilson', 'Independent', 'fec-independent', seenNameParties),
  false,
  'identified same-name candidates are allowed',
);
assert.equal(
  recordUnidentifiedCandidateName('Tamara Wilson', 'Democrat', 'fec-democrat', seenNameParties),
  false,
  'same-name candidates from different parties are allowed',
);
assert.equal(
  recordUnidentifiedCandidateName('Unknown Candidate', 'Other', '', seenNameParties),
  false,
);
assert.equal(
  recordUnidentifiedCandidateName('Unknown Candidate', 'Other', '', seenNameParties),
  true,
  'same-name candidates without IDs and with the same party remain detectable',
);

console.log('verify-contests logic regression tests passed');
