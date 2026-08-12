import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { buildG8V2DispositionPlan, buildG8V2LineageCatalog, classifyG8V2DispositionDifference, diffG8V2DispositionValues, G8_V2_DISPOSITION_DEFAULT_PATHS, verifyG8V2DispositionReplay, type G8V2DispositionPlan } from './g8V2ConflictDisposition.js';
import { buildG8V2ConflictCertifiedPlan } from './g8V2ConflictCli.js';
import { localProductDigest } from './localProductBundle.js';

type Json = Record<string, unknown>;
const d = localProductDigest;
const artifactDigests = new Map<string, string[]>([
  ['current-bundle', ['1'.repeat(64)]],
  ['approved-publication', ['2'.repeat(64)]],
  ['release-manifest', ['3'.repeat(64)]],
  ['snapshot', ['4'.repeat(64)]],
  ['finance', ['5'.repeat(64)]],
  ['congress', ['6'.repeat(64)]],
  ['historical-cvap', ['7'.repeat(64)]],
]);

const reordered = diffG8V2DispositionValues(
  { candidates: [{ id: 'candidate-a', name: 'A' }, { id: 'candidate-b', name: 'B' }] },
  { candidates: [{ id: 'candidate-b', name: 'B' }, { id: 'candidate-a', name: 'A' }] },
);
assert.deepEqual(reordered.map((item) => item.kind), ['reorder']);
assert.equal(reordered[0].pointer, '/candidates');

const changedIdentity = diffG8V2DispositionValues(
  { candidates: [{ id: 'legacy-candidate', name: 'Same' }] },
  { candidates: [{ id: 'fec-H0AA00001', name: 'Same' }] },
);
assert.equal(changedIdentity.filter((item) => item.kind === 'identity').length, 2);
assert.ok(changedIdentity.every((item) => item.pointer.startsWith('/candidates/@id-sha256:') && /^[a-f0-9]{64}$/.test(item.identityDigest ?? '')));

const reorderedFinance = diffG8V2DispositionValues(
  { comparativeFinance: { candidates: [{ candidateId: 'candidate-a', cashOnHand: 1 }, { candidateId: 'candidate-b', cashOnHand: 2 }] } },
  { comparativeFinance: { candidates: [{ candidateId: 'candidate-b', cashOnHand: 2 }, { candidateId: 'candidate-a', cashOnHand: 1 }] } },
);
assert.deepEqual(reorderedFinance.map((item) => item.kind), ['reorder']);
const oneSidedFinance = diffG8V2DispositionValues(
  { comparativeFinance: {} },
  { comparativeFinance: { candidates: [{ candidateId: 'candidate-a', cashOnHand: 1 }] } },
);
assert.equal(oneSidedFinance[0].kind, 'expected-only');
assert.ok(oneSidedFinance[0].pointer.startsWith('/comparativeFinance/candidates/@id-sha256:'));

const protectedRule = classifyG8V2DispositionDifference({
  difference: { pointer: '/eligibleCandidateIds/0', kind: 'value', actualValueDigest: d('legacy'), expectedValueDigest: d('certified') },
  family: 'races', path: 'races/test', sourceDocuments: [], artifactDigests,
});
assert.equal(protectedRule.provenanceClass, 'current-certified-authoritative');
assert.equal(protectedRule.blockerClass, 'none');
assert.match(protectedRule.rationale, /protected identity/);

const sourcedDocuments = new Map<string, Json>([['contestMetrics/test', { demographics: { ageComposition: { adult: 42 } } }]]);
const sourcedRule = classifyG8V2DispositionDifference({
  difference: { pointer: '/demographics/ageComposition/adult', kind: 'production-only', actualValueDigest: d(42), expectedValueDigest: null },
  family: 'metrics', path: 'contestMetrics/test', sourceDocuments: [{ artifactId: 'source-a', artifactDigest: '8'.repeat(64), documents: sourcedDocuments }], artifactDigests,
});
assert.equal(sourcedRule.provenanceClass, 'existing-value-with-validated-source');
assert.equal(sourcedRule.blockerClass, 'none');

const unsourcedRule = classifyG8V2DispositionDifference({
  difference: { pointer: '/fundamentals/unsupported', kind: 'production-only', actualValueDigest: d(17), expectedValueDigest: null },
  family: 'metrics', path: 'contestMetrics/test', sourceDocuments: [], artifactDigests,
});
assert.equal(unsourcedRule.provenanceClass, 'unsupported-production-only-value');
assert.equal(unsourcedRule.blockerClass, 'unsupported-production-only');

const conflictingRule = classifyG8V2DispositionDifference({
  difference: { pointer: '/fundamentals/sourceValue', kind: 'production-only', actualValueDigest: d(1), expectedValueDigest: null },
  family: 'metrics', path: 'contestMetrics/test',
  sourceDocuments: [
    { artifactId: 'source-a', artifactDigest: '9'.repeat(64), documents: new Map([['contestMetrics/test', { fundamentals: { sourceValue: 1 } }]]) },
    { artifactId: 'source-b', artifactDigest: 'a'.repeat(64), documents: new Map([['contestMetrics/test', { fundamentals: { sourceValue: 2 } }]]) },
  ],
  artifactDigests,
});
assert.equal(conflictingRule.provenanceClass, 'ambiguous/unresolved');
assert.equal(conflictingRule.blockerClass, 'conflicting-lineage');

const paths = G8_V2_DISPOSITION_DEFAULT_PATHS;
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const lineageValues = {
  paths: { currentBundle: paths.currentBundle, historicalBundle: paths.historicalBundle, manifest: paths.manifest, publication: paths.publication, finance: paths.finance, congress: paths.congress, historicalCvap: paths.historicalCvap, measures: paths.measures },
  currentBundle: read(paths.currentBundle), historicalBundle: read(paths.historicalBundle), manifest: read(paths.manifest), publication: read(paths.publication), finance: read(paths.finance), congress: read(paths.congress), historicalCvap: read(paths.historicalCvap), measures: read(paths.measures),
};
{
  const lineage = buildG8V2LineageCatalog(lineageValues);
  assert.equal(lineage.catalog.artifacts.length, 8);
  assert.equal(lineage.catalog.currentHistoricalByteIdentical, true);
  assert.equal(lineage.catalog.rebuiltBundleDigest, lineage.currentBundle.bundleDigest);
  const tampered = { ...lineageValues, currentBundle: { ...(lineageValues.currentBundle as Json), bundleDigest: '0'.repeat(64) } };
  assert.throws(() => buildG8V2LineageCatalog(tampered), /digest|mismatch|drift/i);
}

const snapshotBuffer = readFileSync(paths.snapshot);
const { plan: certifiedPlan } = buildG8V2ConflictCertifiedPlan(paths.currentBundle, paths.manifest);
const build = () => buildG8V2DispositionPlan({
  plan: certifiedPlan,
  snapshotValue: JSON.parse(snapshotBuffer.toString('utf8')) as unknown,
  snapshotBytes: statSync(paths.snapshot).size,
  snapshotFileSha256: '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3',
  lineageValues,
});
const first: G8V2DispositionPlan = build();
assert.equal(first.aggregate.plannedPaths, 858);
assert.equal(first.aggregate.duplicatePaths, 0);
assert.equal(first.aggregate.omittedPaths, 0);
assert.deepEqual(first.aggregate.byFamily, { races: 429, measures: 0, candidateResearch: 0, measureResearch: 0, metrics: 429 });
assert.deepEqual(first.aggregate.byDisposition, { 'preserve-current': 0, 'replace-with-certified': 0, 'deterministic-merge': 429, unresolved: 429 });
assert.deepEqual(Object.keys(first.aggregate.byDifferenceKind), ['reorder','identity','value','expected-only','production-only']);
assert.equal(first.readiness.readyForExecutor, false);
assert.equal(first.safety.firebaseImported, false);
assert.equal(first.safety.credentialsLoaded, false);
assert.equal(first.safety.networkRequests, 0);
assert.equal(first.safety.productionOperations, 0);
assert.ok(first.entries.every((entry) => entry.rollbackEvidence === 'complete-actual-document-in-immutable-br5b-snapshot' && /^[a-f0-9]{64}$/.test(entry.rollbackDigest)));
assert.ok(first.entries.filter((entry) => entry.family === 'races').every((entry) => entry.pointerRules.some((rule) => rule.provenanceClass === 'identity-conflict')));
const summary = { operation: 'g8-4br6a-focused-tests', plannedPaths: first.aggregate.plannedPaths, dispositions: first.aggregate.byDisposition, provenance: first.aggregate.byProvenanceClass, differences: first.aggregate.byDifferenceKind, blockers: first.aggregate.byBlockerClass, readyForExecutor: first.readiness.readyForExecutor, planDigest: first.digests.plan };
const firstDigests = structuredClone(first.digests);
assert.equal(verifyG8V2DispositionReplay({ digests: firstDigests }, { digests: structuredClone(firstDigests) }), true);
console.log(JSON.stringify(summary));
