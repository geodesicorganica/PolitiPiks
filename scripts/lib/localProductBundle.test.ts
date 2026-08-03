import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLocalProductBundle, validateLocalProductBundle } from './localProductBundle.js';
import { assertLoopbackEmulatorHost, decodeLocalProductValue, seedLocalProductBundle } from './localProductEmulator.js';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const inputs = {
  publicationValue: read('.artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json'),
  financeValue: read('.artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json'),
  congressValue: read('.artifacts/private/canonical-migration/g6-3-congress-depth-v2.json'),
  historicalValue: read('.artifacts/private/canonical-migration/g6-4-historical-cvap-depth.json'),
  measureRegistryValue: read('data/2026/statewide-ballot-measures.json'),
};
const first = buildLocalProductBundle(inputs); const second = buildLocalProductBundle(inputs);
assert.deepEqual(first, second); assert.deepEqual(first.counts, { races: 470, measures: 14, candidateResearch: 2384, measureResearch: 14, metrics: 470, selectors: 1, total: 3353 });
assert.equal(first.readiness.predictionReadyMeasures, 14); assert.deepEqual(first.audit, { duplicatePaths: 0, orphanDocuments: 0, unresolvedReferences: 0, leakage: 0 });
assert.equal(validateLocalProductBundle(JSON.parse(JSON.stringify(first))).bundleDigest, first.bundleDigest);
const research = first.documents.find((item) => /candidateResearch/.test(item.path))!; assert.equal('buckets' in research.data, false); assert.equal('sources' in research.data, false); assert.ok(research.data.baselineResearch); assert.ok(research.data.fecFinance);
const tampered = JSON.parse(JSON.stringify(first)); tampered.documents[0].data.privateKey = 'secret'; assert.throws(() => validateLocalProductBundle(tampered), /credential field leakage/);
assert.equal(assertLoopbackEmulatorHost('127.0.0.1:8081'), '127.0.0.1:8081'); assert.equal(assertLoopbackEmulatorHost('localhost:8082'), 'localhost:8082'); assert.throws(() => assertLoopbackEmulatorHost(undefined)); assert.throws(() => assertLoopbackEmulatorHost('firestore.googleapis.com:443'));
assert.deepEqual(decodeLocalProductValue({ at: { __firestoreType: 'timestamp/v1', seconds: 1, nanoseconds: 2_000 } }, (seconds, nanoseconds) => ({ seconds, nanoseconds })), { at: { seconds: 1, nanoseconds: 2_000 } });
const batches: number[] = []; const result = await seedLocalProductBundle({ async commit(documents) { batches.push(documents.length); } }, first); assert.equal(result.seeded, 3353); assert.equal(result.batches, 9); assert.ok(batches.every((size) => size <= 400));
console.log('local product bundle and emulator guard tests passed');
