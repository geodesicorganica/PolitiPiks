import assert from 'node:assert/strict';
import { assertSeedableSourcePayload } from '../schema.js';
import { listCivicElections, lookupCivicVoterInfo } from './googleCivic.js';
import { getStateElectionProvider, registerOfficialJsonProvider } from './stateElectionProvider.js';
import { isValidFecHouseDistrict } from './fec2026.js';
import { normDistrictKey } from './medslCommon.js';

assert.equal(normDistrictKey('00'), 'AL');
assert.equal(isValidFecHouseDistrict('GA', '014'), true);
assert.equal(isValidFecHouseDistrict('GA', '023'), false);
assert.equal(isValidFecHouseDistrict('AK', 'AL'), true);

const originalFetch = globalThis.fetch;
const requestedUrls: string[] = [];

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input);
  requestedUrls.push(url);
  if (url.includes('/voterinfo?')) {
    return new Response(JSON.stringify({
      status: 'success',
      election: { id: '1', name: 'Test Election', electionDay: '2026-11-03' },
      otherElections: [{ id: '2', name: 'Other Election' }],
      contests: [{ office: 'Governor', district: { name: 'Georgia' }, candidates: [{ name: 'Jane Doe' }] }],
      dropOffLocations: [{ notes: 'Drop box' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/elections?')) {
    return new Response(JSON.stringify({ elections: [{ id: '1', name: 'Test Election' }] }), { status: 200 });
  }
  return new Response(JSON.stringify({
    races: [{
      id: '2026-ZZ-governor', state: 'ZZ', office: 'Governor', closeDate: '2026-11-03T19:00:00-05:00',
      candidates: [{ id: 'jane-doe', name: 'Jane Doe', party: 'Independent', qualificationStatus: 'qualified' }],
    }],
    ballotMeasures: [],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

try {
  const civic = await lookupCivicVoterInfo({ address: '1 Main St', apiKey: 'test', officialSourcesOnly: true });
  assert.equal(civic.contests[0]?.district?.name, 'Georgia');
  assert.equal(civic.otherElections.length, 1);
  assert.equal(civic.dropOffLocations.length, 1);
  const voterUrl = new URL(requestedUrls.find((url) => url.includes('/voterinfo?'))!);
  assert.equal(voterUrl.searchParams.get('officialOnly'), 'true');
  assert.equal(voterUrl.searchParams.has('officialSourcesOnly'), false);
  assert.equal(voterUrl.searchParams.get('returnAllAvailableData'), 'true');

  assert.equal((await listCivicElections('test')).length, 1);

  registerOfficialJsonProvider({
    id: 'test-state', state: 'ZZ', label: 'ZZ Election Office',
    officialBaseUrl: 'https://elections.example.gov',
    endpoint: 'https://elections.example.gov/contests.json',
    capabilities: ['certifiedCandidates'],
  });
  const payload = await getStateElectionProvider('ZZ')!.load(2026);
  assert.equal(payload.races[0]?.verificationLevel, 'official');
  assert.equal(payload.races[0]?.candidates[0]?.source, 'ZZ Election Office');
  assert.equal(payload.races[0]?.candidates[0]?.qualificationStatus, 'qualified');

  assert.throws(
    () => assertSeedableSourcePayload({ races: [], ballotMeasures: [] }),
    /Refusing to seed empty contest payload/,
  );
  console.log('Ingest free-source contract tests passed');
} finally {
  globalThis.fetch = originalFetch;
}
