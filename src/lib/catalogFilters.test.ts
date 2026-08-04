import assert from 'node:assert/strict';
import { applyCatalogFilters, emptyCatalogFilters } from './catalogFilters.js';
import type { BallotMeasure, Race } from '../types.js';

const race = (id: string, state: string, office: Race['office'], eligibleCandidateIds: string[]): Race => ({
  id, state, office, candidates: [], eligibleCandidateIds, predictionReady: eligibleCandidateIds.length > 0, status: 'upcoming', closeDate: '2026-11-03', electionYear: 2026, mode: 'live',
});
const measure = (id: string, state: string, predictionReady: boolean): BallotMeasure => ({
  id, state, title: id, description: 'Certified fixture', status: 'upcoming', closeDate: '2026-11-03', electionYear: 2026, mode: 'live', predictionReady, eligibleOptions: predictionReady ? ['yes', 'no'] : [],
});

const races = [race('ca-house', 'CA', 'House', []), race('ca-senate', 'CA', 'Senate', ['official-candidate']), race('ga-senate', 'GA', 'Senate', [])];
const measures = [measure('ca-measure', 'CA', true), measure('tx-measure', 'TX', false)];

assert.deepEqual(emptyCatalogFilters(), { state: '', office: 'all', kind: 'all', readiness: 'all' });
assert.deepEqual(applyCatalogFilters(races, measures, { state: 'CA', office: 'Senate', kind: 'race', readiness: 'ready' }).races.map((item) => item.id), ['ca-senate']);
assert.deepEqual(applyCatalogFilters(races, measures, { state: 'CA', office: 'all', kind: 'measure', readiness: 'ready' }).measures.map((item) => item.id), ['ca-measure']);
assert.deepEqual(applyCatalogFilters(races, measures, { state: '', office: 'Measure', kind: 'all', readiness: 'all' }), { races: [], measures });
assert.deepEqual(applyCatalogFilters(races, measures, { state: '', office: 'Senate', kind: 'all', readiness: 'all' }), { races: [races[1], races[2]], measures: [] });
assert.deepEqual(applyCatalogFilters(races, measures, { state: '', office: 'all', kind: 'all', readiness: 'unavailable' }), { races: [races[0], races[2]], measures: [measures[1]] });
assert.deepEqual(applyCatalogFilters(races, measures, { state: 'ZZ', office: 'all', kind: 'all', readiness: 'all' }), { races: [], measures: [] });

console.log('catalog filter tests passed');
