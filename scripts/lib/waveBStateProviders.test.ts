import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WAVE_B_STATES,
  type WaveBState,
  buildWaveBReport,
  fetchWaveBProvider,
  normalizeWaveBFixture,
  parseWaveBProviderResult,
  replayWaveBProviders,
} from './waveBStateProviders.js';

const fixtures = Object.fromEntries(WAVE_B_STATES.map((state) => [state, JSON.parse(readFileSync(`data/2026/wave-b-html/${state}.json`, 'utf8'))])) as Record<WaveBState, any>;
const report = buildWaveBReport(fixtures);
assert.deepEqual(Object.keys(report.states), WAVE_B_STATES);
assert.equal(report.counts.states, 12);
assert.equal(report.counts.records.statewideMeasure, 14);
assert.equal(report.counts.status.available, 1);
assert.equal(report.counts.status.not_yet_published, 11);
assert.equal(report.counts.duplicateCanonicalIds, 0);
assert.equal(report.counts.ambiguousAcceptedIdentities, 0);
assert.equal(replayWaveBProviders(fixtures).planDigest, report.planDigest);

const california = parseWaveBProviderResult(fixtures.CA);
assert.equal(california.records.length, 14);
assert.equal(california.predictionReadyRecords, 14);
assert.ok(california.records.every((record) => record.kind === 'statewideMeasure' && record.qualificationStatus === 'on_ballot'));
for (const state of WAVE_B_STATES.filter((state) => state !== 'CA')) {
  const result = parseWaveBProviderResult(fixtures[state]);
  assert.equal(result.records.length, 0, `${state} must not invent records before a reviewed final list exists`);
  assert.equal(result.status, 'not_yet_published');
}

assert.throws(() => normalizeWaveBFixture({ ...fixtures.CA, state: 'ZZ' }), /state/);
assert.throws(() => parseWaveBProviderResult({ ...fixtures.CA, records: [...fixtures.CA.records, fixtures.CA.records[0]] }), /duplicate/);
assert.throws(() => parseWaveBProviderResult({ ...fixtures.CA, records: [{ ...fixtures.CA.records[0], choices: ['Yes'] }] }), /choices/);
assert.throws(() => parseWaveBProviderResult({ ...fixtures.GA, status: 'available' }), /available/);
assert.throws(() => parseWaveBProviderResult({ ...fixtures.GA, schemaMarkers: [] }), /schema drift/);
assert.equal(parseWaveBProviderResult({ ...fixtures.GA, status: 'access_blocked', nextReviewAt: undefined }).status, 'access_blocked');
assert.throws(() => parseWaveBProviderResult({ ...fixtures.GA, records: [{ kind: 'candidateList', canonicalId: '2026-GA-candidate-example', title: 'Alex Example', fecCandidateId: 'S6GA00001', candidateName: 'Alex Example', party: 'Independent', qualificationStatus: 'withdrawn', finalBallot: false }], status: 'available', capabilities: ['candidateList'] }), /non-pickable/);
assert.throws(() => parseWaveBProviderResult({ ...fixtures.GA, records: [{ kind: 'candidateList', canonicalId: '2026-GA-candidate-example', title: 'Alex Example', fecCandidateId: 'S6GA00001', candidateName: 'Alex Example', party: 'Independent', qualificationStatus: 'on_ballot', finalBallot: true }, { kind: 'candidateList', canonicalId: '2026-GA-candidate-example', title: 'Alex Example II', fecCandidateId: 'S6GA00001', candidateName: 'Alex Example', party: 'Independent', qualificationStatus: 'on_ballot', finalBallot: true }], status: 'available', capabilities: ['candidateList'] }), /duplicate|ambiguous/);

const observedFetches: string[] = [];
const caFetched = await fetchWaveBProvider('CA', fixtures.CA, async (url) => {
  observedFetches.push(String(url));
  return new Response('<html>California Secretary of State certifies 14 measures for November 3, 2026</html>', { status: 200 });
});
assert.equal(caFetched.records.length, 14);
assert.equal(observedFetches.length, 1);
await assert.rejects(() => fetchWaveBProvider('NC', fixtures.NC, async () => new Response('<html>not the reviewed shape</html>', { status: 200 })), /schema drift/);
await assert.rejects(() => fetchWaveBProvider('NY', fixtures.NY, async () => new Response('blocked', { status: 403 })), /403/);
const unavailableCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\deliberately-unavailable-firebase-credential.json';
assert.equal(buildWaveBReport(fixtures).counts.states, 12, 'offline replay must not initialize Firebase');
if (unavailableCredentials === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS; else process.env.GOOGLE_APPLICATION_CREDENTIALS = unavailableCredentials;
console.log('Wave B structured-HTML provider tests passed');
