import assert from 'node:assert/strict';
import { fetchGeorgia2026GeneralBallotSource, GEORGIA_2026_GENERAL_SOURCE_URL } from './gaBallotEligibilityAdapter.js';

const source = await fetchGeorgia2026GeneralBallotSource(async (url) => {
  assert.equal(url, GEORGIA_2026_GENERAL_SOURCE_URL);
  return new Response('<html><title>2026 Candidate Qualifying</title></html>', { status: 200 });
}, new Date('2026-07-27T00:00:00.000Z'));
assert.equal(source.sourceStatus, 'not_yet_published');
assert.deepEqual(source.records, []);
await assert.rejects(() => fetchGeorgia2026GeneralBallotSource(async () => new Response('blocked', { status: 403 })), /403/);
console.log('Georgia ballot eligibility adapter tests passed');
