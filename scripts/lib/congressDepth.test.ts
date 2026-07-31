import assert from 'node:assert/strict';
import { buildCongressDepthSnapshot, matchHouseVote, matchSenateVote, normalizeCongressMemberName, validateCongressDepthSnapshot } from './congressDepth.js';

assert.equal(normalizeCongressMemberName('Doe, Jane'), 'JANE DOE');
assert.equal(matchHouseVote({ bioguideId: 'D000001' }, 'd000001'), true, 'House matching is exact Bioguide only');
assert.equal(matchHouseVote({ firstName: 'Jane', lastName: 'Doe' }, 'D000001'), false, 'House name fallback is rejected');
assert.equal(matchSenateVote([{ firstName: 'Jane', lastName: 'Doe', state: 'GA' }], { officialName: 'Doe, Jane', state: 'GA' }).status, 'matched', 'Senate matching is exact normalized official name plus state');
assert.equal(matchSenateVote([{ firstName: 'Jane', lastName: 'Doe', state: 'GA' }, { firstName: 'Jane', lastName: 'Doe', state: 'GA' }], { officialName: 'Doe, Jane', state: 'GA' }).status, 'ambiguous', 'ambiguous Senate names fail closed');
const snapshot = buildCongressDepthSnapshot({ source: { publicationInputDigest: 'a'.repeat(64), financeInputDigest: 'b'.repeat(64), capturedAt: '2026-07-31T00:00:00.000Z' }, maxCalls: 1600, calls: 3, candidates: [{ bioguideId: 'D000001', references: [{ raceId: '2026-GA-house-001', candidateId: 'fec-H6GA01075', state: 'GA', chamber: 'House' }], status: 'present', profile: { chamber: 'House', state: 'GA', district: '01', partyHistory: [], terms: [], officialName: 'Doe, Jane', sourceUrl: 'https://api.congress.gov/v3/member/D000001', retrievedAt: '2026-07-31T00:00:00.000Z' }, sponsored: [], cosponsored: [], votes: [] }], rollCalls: [] });
assert.deepEqual(validateCongressDepthSnapshot(snapshot), snapshot, 'valid snapshots replay deterministically');
assert.throws(() => validateCongressDepthSnapshot({ ...snapshot, inputDigest: '0'.repeat(64) }), /digest/, 'snapshot tampering fails closed');
assert.equal(JSON.stringify(snapshot).includes('api_key'), false, 'snapshots never retain secrets');
console.log('Congress depth tests passed');
