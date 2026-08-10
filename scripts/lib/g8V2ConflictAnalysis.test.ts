import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildG8V2ConflictAnalysisReport, buildG8V2ConflictSnapshot, validateG8V2ConflictSnapshot, type G8V2ConflictObservation } from './g8V2ConflictAnalysis.js';
import { captureG8V2Conflicts } from './g8V2ConflictCapture.js';
import { buildG8V2ConflictCertifiedPlan } from './g8V2ConflictCli.js';

const require = createRequire(import.meta.url);
const { plan } = buildG8V2ConflictCertifiedPlan();
const capture = {
  capturedAt: '2026-08-10T20:00:00.000Z',
  captureReceipt: 'g8-4br5b-conflict-analysis-test',
  projectId: plan.target.projectId,
  databaseId: plan.target.databaseId,
  generation: plan.generation,
  shadowSourceCommit: plan.shadowSourceCommit,
  activationImplementationCommit: plan.activationImplementationCommit,
  conflictAnalysisImplementationCommit: 'a'.repeat(40),
};
const observations: G8V2ConflictObservation[] = plan.documents.map((document) => ({ path: document.path, actual: null }));

const metadataDocument = plan.documents.find((document) => document.data.canonicalActivation)!;
const metadataIndex = plan.documents.indexOf(metadataDocument);
const metadataActual = structuredClone(metadataDocument.data);
(metadataActual.canonicalActivation as Record<string, unknown>).activationImplementationCommit = 'b'.repeat(40);
observations[metadataIndex] = { path: metadataDocument.path, actual: metadataActual };

const raceDocument = plan.documents.find((document) => /^races\/[^/]+$/.test(document.path) && document.path !== metadataDocument.path)!;
const substantiveIndex = plan.documents.indexOf(raceDocument);
const substantiveActual = structuredClone(raceDocument.data);
substantiveActual.productionOnlyNote = {
  sourceUrl: 'https://example.invalid/preserved',
  researchText: 'must not be discarded',
  provenance: { capturedAt: { __firestoreType: 'timestamp/v1', seconds: 1_786_392_000, nanoseconds: 123_000 } },
  eligibility: { predictionEligibility: false },
  candidates: [{ id: 'preserved-production-candidate' }],
  metrics: { preserved: 1 },
  unknownField: { preserved: true },
};
observations[substantiveIndex] = { path: raceDocument.path, actual: substantiveActual };

const legacyDocument = plan.documents.find((document) => /^contestMetrics\/[^/]+$/.test(document.path))!;
const legacyIndex = plan.documents.indexOf(legacyDocument);
const legacyActual = structuredClone(legacyDocument.data);
delete legacyActual.canonicalActivation;
legacyActual.generation = 'legacy-2026';
observations[legacyIndex] = { path: legacyDocument.path, actual: legacyActual };

const exact = plan.documents.find((document) => ![metadataDocument.path, raceDocument.path, legacyDocument.path].includes(document.path))!;
const exactIndex = plan.documents.indexOf(exact);
observations[exactIndex] = { path: exact.path, actual: structuredClone(exact.data) };

const unknownDocument = plan.documents.find((document) => ![exact.path, metadataDocument.path, raceDocument.path, legacyDocument.path].includes(document.path))!;
const unknownIndex = plan.documents.indexOf(unknownDocument);
observations[unknownIndex] = { path: unknownDocument.path, actual: null, errorCode: 'PERMISSION_DENIED' };

const snapshot = buildG8V2ConflictSnapshot({ plan, capture, selector: { actual: null }, observations });
assert.deepEqual(snapshot.counts, {
  expected: 3352,
  exact: 1,
  missing: 3347,
  conflicting: 3,
  unknown: 1,
  families: snapshot.counts.families,
});
assert.equal(snapshot.selector.status, 'absent');
assert.equal(snapshot.readAccounting.selector.attempted, 1);
assert.equal(snapshot.readAccounting.exactPaths.attempted, 3352);
assert.equal(snapshot.writeAccounting.attempted, 0);
assert.equal(snapshot.readAccounting.collectionScans, 0);
assert.equal(snapshot.conflicts.length, 3);
assert.ok(snapshot.conflicts.every((conflict) => conflict.actual && conflict.expected && conflict.differences.length > 0));

const metadataAssessment = snapshot.assessments.find((item) => item.path === metadataDocument.path)!;
assert.equal(metadataAssessment.classification, 'metadata-only');
assert.equal(metadataAssessment.safeToReplace, false);
assert.equal(metadataAssessment.originInference, 'likely-g8-4b-remnant');
assert.deepEqual(snapshot.conflicts.find((item) => item.path === metadataDocument.path)!.differences.map((item) => item.pointer), ['/canonicalActivation/activationImplementationCommit']);

const substantiveAssessment = snapshot.assessments.find((item) => item.path === raceDocument.path)!;
assert.equal(substantiveAssessment.classification, 'substantive');
assert.equal(substantiveAssessment.safeToReplace, false);
for (const protectedFragment of ['sourceUrl','researchText','provenance','capturedAt','eligibility','candidates','metrics']) {
  assert.ok(substantiveAssessment.protectedPointers.some((pointer) => pointer.includes(protectedFragment)), `protected pointer missing: ${protectedFragment}`);
}
assert.ok(substantiveAssessment.productionOnlyPointers.some((pointer) => pointer.startsWith('/productionOnlyNote/')));
assert.ok(snapshot.conflicts.find((item) => item.path === raceDocument.path)!.productionOnlyPointers.some((pointer) => pointer.endsWith('/unknownField/preserved')));

const legacyAssessment = snapshot.assessments.find((item) => item.path === legacyDocument.path)!;
assert.equal(legacyAssessment.classification, 'substantive');
assert.equal(legacyAssessment.originInference, 'legacy-active');
assert.ok(snapshot.resolutionPlan.entries.every((entry) => entry.disposition === 'unresolved' && entry.requiresExplicitApproval));
assert.equal(snapshot.resolutionPlan.defaultSafeToReplace, false);

assert.deepEqual(validateG8V2ConflictSnapshot(snapshot, plan), snapshot);
assert.deepEqual(buildG8V2ConflictSnapshot({ plan, capture, selector: { actual: null }, observations }), snapshot);

const tampered = structuredClone(snapshot);
tampered.conflicts[0].actual.tampered = true;
assert.throws(() => validateG8V2ConflictSnapshot(tampered, plan), /tampering|digest/i);
const tamperedDigest = structuredClone(snapshot);
tamperedDigest.digests.evidence = '0'.repeat(64);
assert.throws(() => validateG8V2ConflictSnapshot(tamperedDigest, plan), /tampering|digest/i);
assert.throws(() => buildG8V2ConflictSnapshot({ plan, capture, selector: { actual: null }, observations: [...observations, observations[0]] }), /duplicate/);
assert.throws(() => buildG8V2ConflictSnapshot({ plan, capture, selector: { actual: null }, observations: observations.map((item, index) => index === metadataIndex ? { path: item.path, actual: { bad: new Date() } as any } : item) }), /unsupported Firestore value/);
assert.throws(() => buildG8V2ConflictSnapshot({ plan, capture, selector: { actual: null }, observations: observations.map((item, index) => index === metadataIndex ? { path: item.path, actual: { at: { __firestoreType: 'timestamp/v1', seconds: 1, nanoseconds: 1 } } } : item) }), /timestamp/);

const currentBundle = JSON.parse(readFileSync('.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', 'utf8'));
const historicalBundle = JSON.parse(readFileSync('.artifacts/private/canonical-migration/g8-1-prospective-product-bundle-2026-08-04.json', 'utf8'));
const report = buildG8V2ConflictAnalysisReport(snapshot, plan, [{ label: 'current', value: currentBundle }, { label: 'historical', value: historicalBundle }]);
assert.equal(report.firebaseImported, false);
assert.equal(report.credentialsLoaded, false);
assert.equal(report.networkRequests, 0);
assert.equal(report.comparisonInventory[0].bundleDigest, report.comparisonInventory[1].bundleDigest);
assert.match(report.conflicts.find((item) => item.path === metadataDocument.path)!.inference, /do not distinguish provenance/);
assert.throws(() => buildG8V2ConflictAnalysisReport(snapshot, plan, [{ label: 'duplicate', value: currentBundle }, { label: 'duplicate', value: historicalBundle }]), /duplicate comparison label/);

let reads = 0;
const captured = await captureG8V2Conflicts({
  plan,
  capture,
  store: { get: async (path) => { reads += 1; if (path === unknownDocument.path) throw Object.assign(new Error('secret token=NOPE'), { code: 'PERMISSION_DENIED' }); if (path === metadataDocument.path) return metadataActual; return null; } },
});
assert.equal(reads, 3353);
assert.equal(captured.counts.conflicting, 1);
assert.equal(captured.counts.unknown, 1);
assert.equal(captured.readAccounting.exactPaths.attempted, 3352);
assert.equal(captured.readAccounting.exactPaths.failed, 1);
assert.equal(captured.readAccounting.exactPaths.unknown, 0);
assert.equal(captured.writeAccounting.attempted, 0);
assert.doesNotMatch(JSON.stringify(captured), /NOPE|token=/);

const fixtureRelative = '.artifacts/private/canonical-migration/g8-4br5a-offline-conflict-fixture-v3.json';
mkdirSync('.artifacts/private/canonical-migration', { recursive: true });
if (existsSync(fixtureRelative)) {
  assert.deepEqual(validateG8V2ConflictSnapshot(JSON.parse(readFileSync(fixtureRelative, 'utf8')), plan), snapshot);
} else {
  writeFileSync(fixtureRelative, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
const invocation = [require.resolve('tsx/cli'), 'scripts/report-g8-4br5a-conflicts.ts', '--snapshot-in', fixtureRelative, '--bundle-in', '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', '--manifest', 'docs/g8-catalog-beta-release-manifest.json', '--comparison-bundle', 'current=.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', '--comparison-bundle', 'historical=.artifacts/private/canonical-migration/g8-1-prospective-product-bundle-2026-08-04.json', '--verify-replay'];
const { execFileSync } = await import('node:child_process');
const environment = { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: 'C:\\definitely-missing-g8-4br5a.json', FIREBASE_SERVICE_ACCOUNT: 'C:\\definitely-missing-g8-4br5a.json' };
const replay1 = execFileSync(process.execPath, invocation, { cwd: process.cwd(), encoding: 'utf8', env: environment });
const replay2 = execFileSync(process.execPath, invocation, { cwd: process.cwd(), encoding: 'utf8', env: environment });
assert.equal(replay1, replay2);
const offline = JSON.parse(replay1);
assert.equal(offline.offlineReplayVerified, true);
assert.equal(offline.firebaseImported, false);
assert.equal(offline.credentialsLoaded, false);
assert.equal(offline.networkRequests, 0);
const cliSource = readFileSync('scripts/report-g8-4br5a-conflicts.ts', 'utf8');
assert.match(cliSource, /await import\('\.\/lib\/g8V2ConflictCaptureLive\.js'\)/);
assert.doesNotMatch(cliSource, /from ['"]\.\/lib\/g8V2ConflictCaptureLive\.js['"]/);
console.log(`G8.4BR5A conflict analysis tests passed; two byte-identical offline fixture replays: ${snapshot.digests.plan}`);
