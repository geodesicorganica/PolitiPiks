import assert from 'node:assert/strict';
import type { BallotMeasure, Candidate, Race } from '../types.js';
import { candidatePickIsEligible, measurePickIsEligible, racePickUnavailableReason } from './predictionEligibility.js';

const candidate: Candidate = { id: 'official', name: 'Official Candidate', party: 'Democrat', qualificationStatus: 'on_ballot', pickEligibility: 'eligible' };
const race: Race = { id: '2026-CA-house-001', state: 'CA', office: 'House', candidates: [candidate], eligibleCandidateIds: ['official'], predictionReady: true, catalogScope: 'federal', registryGeneration: 'canonical-2026-shadow-v2', status: 'upcoming', closeDate: '2026-11-03', electionYear: 2026, mode: 'live' };
assert.equal(candidatePickIsEligible(race, candidate), true);
assert.equal(candidatePickIsEligible({ ...race, eligibleCandidateIds: [] }, candidate), false);
assert.equal(candidatePickIsEligible(race, { ...candidate, qualificationStatus: 'withdrawn' }), false);
assert.equal(candidatePickIsEligible({ ...race, predictionReady: false }, candidate), false);
assert.match(racePickUnavailableReason({ ...race, predictionReady: false })!, /official candidate allowlist/i);

const measure: BallotMeasure = { id: 'ca-measure', state: 'CA', title: 'Measure', description: 'Certified', status: 'upcoming', closeDate: '2026-11-03', electionYear: 2026, mode: 'live', predictionReady: true, eligibleOptions: ['yes', 'no'] };
assert.equal(measurePickIsEligible(measure, 'yes'), true);
assert.equal(measurePickIsEligible({ ...measure, predictionReady: false }, 'yes'), false);
assert.equal(measurePickIsEligible(measure, 'other'), false);

console.log('prediction eligibility tests passed');
