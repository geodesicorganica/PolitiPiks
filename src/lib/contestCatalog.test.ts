import assert from 'node:assert/strict';
import { selectContestCatalog } from './contestCatalog.js';
import type { Race } from '../types.js';

const base = { state: 'CA', office: 'Senate' as const, candidates: [], status: 'upcoming' as const, closeDate: '2026-11-03', electionYear: 2026, mode: 'live' as const };
const legacyFederal = { ...base, id: '2026-CA-senate' } as Race;
const canonicalFederal = { ...base, id: '2026-CA-senate-class-1', catalogScope: 'federal' as const, registryGeneration: 'canonical-2026-shadow-v1' } as Race;
const canonicalSpecial = { ...base, id: '2026-FL-senate-special-class-3', catalogScope: 'federal' as const, registryGeneration: 'canonical-2026-shadow-v1' } as Race;
const governor = { ...base, id: '2026-CA-governor', office: 'Governor' as const } as Race;
const activation = { state: 'active' as const, activeFederalGeneration: 'canonical-2026-shadow-v1' };

const active = selectContestCatalog({ races: [legacyFederal, canonicalFederal, canonicalSpecial, governor], measures: [], activation });
assert.equal(active.status, 'ready');
if (active.status === 'ready') {
  assert.deepEqual(active.races.map((race) => race.id), ['2026-CA-governor', '2026-CA-senate-class-1', '2026-FL-senate-special-class-3']);
}

const rollback = selectContestCatalog({ races: [legacyFederal, canonicalFederal, governor], measures: [], activation: { state: 'rollback', activeFederalGeneration: 'legacy-2026' } });
assert.equal(rollback.status, 'ready');
if (rollback.status === 'ready') assert.deepEqual(rollback.races.map((race) => race.id), ['2026-CA-governor', '2026-CA-senate']);

const pending = selectContestCatalog({ races: [legacyFederal, canonicalFederal], measures: [], activation: { state: 'pending', activeFederalGeneration: 'legacy-2026' } });
assert.deepEqual(pending, { status: 'error', message: 'The federal contest catalog is pending activation.' });

console.log('contest catalog selection tests passed');
