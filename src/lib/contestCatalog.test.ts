import assert from 'node:assert/strict';
import { selectContestCatalog } from './contestCatalog.js';
import type { BallotMeasure, Race } from '../types.js';

const base = { state: 'CA', office: 'Senate' as const, candidates: [], status: 'upcoming' as const, closeDate: '2026-11-03', electionYear: 2026, mode: 'live' as const };
const legacyFederal = { ...base, id: '2026-CA-senate' } as Race;
const canonicalFederal = { ...base, id: '2026-CA-senate-class-1', catalogScope: 'federal' as const, registryGeneration: 'canonical-2026-shadow-v2' } as Race;
const canonicalSpecial = { ...base, id: '2026-FL-senate-special-class-3', catalogScope: 'federal' as const, registryGeneration: 'canonical-2026-shadow-v2' } as Race;
const governor = { ...base, id: '2026-CA-governor', office: 'Governor' as const } as Race;
const canonicalMeasure = { id: '2026-CA-proposition-1', state: 'CA', title: 'Measure', description: 'Certified', status: 'upcoming', closeDate: '2026-11-03', electionYear: 2026, mode: 'live', catalogScope: 'canonical-2026-measures', registryGeneration: 'canonical-2026-shadow-v2' } as BallotMeasure;
const unrelatedMeasure = { id: 'unrelated-measure', state: 'CA', title: 'Unrelated', description: 'Compatibility', status: 'upcoming', closeDate: '2026-11-03', electionYear: 2026, mode: 'live' } as BallotMeasure;
const activation = { state: 'active' as const, activeFederalGeneration: 'canonical-2026-shadow-v2', activeMeasureGeneration: 'canonical-2026-shadow-v2' };

const active = selectContestCatalog({ races: [legacyFederal, canonicalFederal, canonicalSpecial, governor], measures: [canonicalMeasure, unrelatedMeasure], activation });
assert.equal(active.status, 'ready');
if (active.status === 'ready') {
  assert.deepEqual(active.races.map((race) => race.id), ['2026-CA-governor', '2026-CA-senate-class-1', '2026-FL-senate-special-class-3']);
  assert.deepEqual(active.measures.map((measure) => measure.id), ['2026-CA-proposition-1', 'unrelated-measure']);
}

const rollback = selectContestCatalog({ races: [legacyFederal, canonicalFederal, governor], measures: [canonicalMeasure, unrelatedMeasure], activation: { state: 'rollback', activeFederalGeneration: 'legacy-2026', activeMeasureGeneration: 'none' } });
assert.equal(rollback.status, 'ready');
if (rollback.status === 'ready') { assert.deepEqual(rollback.races.map((race) => race.id), ['2026-CA-governor', '2026-CA-senate']); assert.deepEqual(rollback.measures.map((measure) => measure.id), ['unrelated-measure']); }

const pending = selectContestCatalog({ races: [legacyFederal, canonicalFederal], measures: [canonicalMeasure, unrelatedMeasure], activation: { state: 'pending', activeFederalGeneration: 'legacy-2026', activeMeasureGeneration: 'none' } });
if (pending.status === 'ready') { assert.deepEqual(pending.races.map((race) => race.id), []); assert.deepEqual(pending.measures.map((measure) => measure.id), ['unrelated-measure']); }

const absent = selectContestCatalog({ races: [legacyFederal, canonicalFederal], measures: [canonicalMeasure, unrelatedMeasure], activation: null });
if (absent.status === 'ready') { assert.deepEqual(absent.races.map((race) => race.id), ['2026-CA-senate']); assert.deepEqual(absent.measures.map((measure) => measure.id), ['unrelated-measure']); }

console.log('contest catalog selection tests passed');
