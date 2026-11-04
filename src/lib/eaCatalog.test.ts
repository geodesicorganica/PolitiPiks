import assert from 'node:assert/strict';
import { selectContestCatalog } from './contestCatalog.js';
import { candidatePickIsEligible } from './predictionEligibility.js';
import { parseReviewedFields } from './reviewedProfile.js';
import type { Race, BallotMeasure } from '../types.js';

const generation = 'canonical-2026-ea-2026-09-21';
const candidate = { id: 'official-choice', name: 'Fixture', party: 'Other', qualificationStatus: 'on_ballot', pickEligibility: 'eligible' } as Race['candidates'][number];
const governor = { id: '2026-CA-governor', office: 'Governor', state: 'CA', candidates: [candidate], eligibleCandidateIds: [candidate.id], predictionReady: true, catalogScope: 'gubernatorial', registryGeneration: generation } as Race;
const house = { ...governor, id: '2026-AK-house-al', state: 'AK', office: 'House', catalogScope: 'federal' } as Race;
const measure = { id: '2026-CA-proposition-example', state: 'CA', catalogScope: 'canonical-2026-measures', registryGeneration: generation, predictionReady: true, eligibleOptions: ['yes', 'no'] } as BallotMeasure;
const activation = { state: 'active' as const, activeFederalGeneration: generation, activeGubernatorialGeneration: generation, activeMeasureGeneration: generation };
const races = [governor, house, { ...governor, id: 'old-governor', registryGeneration: undefined }];
const active = selectContestCatalog({ races, measures: [measure], activation });
assert.equal(active.status, 'ready');
if (active.status === 'ready') { assert.deepEqual(active.races.map(x => x.id), [house.id, governor.id]); assert.equal(active.measures.length, 1); }
const pending = selectContestCatalog({ races, measures: [measure], activation: { ...activation, state: 'pending' } });
if (pending.status === 'ready') { assert.equal(pending.races.length, 0); assert.equal(pending.measures.length, 0); }
const old = selectContestCatalog({ races, measures: [measure], activation: null });
if (old.status === 'ready') { assert.equal(old.races.length, 1); assert.equal(old.races[0].id, 'old-governor'); assert.equal(old.measures.length, 0); }
assert.equal(candidatePickIsEligible(governor, candidate), true);
assert.equal(candidatePickIsEligible({ ...governor, predictionReady: undefined }, candidate), false);
assert.equal(candidatePickIsEligible(governor, { ...candidate, qualificationStatus: 'withdrawn' }), false);
const source = { url: 'https://example.gov/source', authority: 'Fixture source', reviewedAt: '2026-09-21T00:00:00Z', kind: 'government' };
assert.ok(parseReviewedFields({ biography: { status: 'present', value: 'Verified fixture fact.', attribution: 'government_record', sources: [source] } }, { biography: 'Biography' })[0].field);
assert.equal(parseReviewedFields({ website: { status: 'present', value: 'javascript:alert(1)', attribution: 'government_record', sources: [source] } }, { website: 'Website' })[0].field, null);
assert.equal(parseReviewedFields({ biography: { status: 'present', value: 'Campaign claim.', attribution: 'government_record', sources: [{ ...source, kind: 'campaign' }] } }, { biography: 'Biography' })[0].field, null);
assert.equal(parseReviewedFields({ biography: { status: 'unavailable', sources: [source] } }, { biography: 'Biography' })[0].field, null);
console.log('EA catalog/profile tests passed');
