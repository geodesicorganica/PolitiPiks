import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { G8_V2_CONFLICT_ANALYSIS_CONTRACT, validateG8V2ConflictSnapshot } from './lib/g8V2ConflictAnalysis.js';
import { buildG8V2ConflictCertifiedPlan } from './lib/g8V2ConflictCli.js';
import { runG8V2ConflictOfflineSteps, type G8V2ConflictOfflineChildResult, type G8V2ConflictOfflineStep } from './lib/g8V2ConflictOfflineRunner.js';

type Json = Record<string, any>;
const require = createRequire(import.meta.url);
const PRIVATE_ROOT = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
const SNAPSHOT_RELATIVE = '.artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json';
const SNAPSHOT = resolve(process.cwd(), SNAPSHOT_RELATIVE);
const CERTIFIED_BUNDLE = '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json';
const HISTORICAL_BUNDLE = '.artifacts/private/canonical-migration/g8-1-prospective-product-bundle-2026-08-04.json';
const MANIFEST = 'docs/g8-catalog-beta-release-manifest.json';
const SNAPSHOT_BYTES = 35_148_779;
const SNAPSHOT_SHA256 = '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3';
const CERTIFIED_BUNDLE_DIGEST = '7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const RECEIPT = resolve(PRIVATE_ROOT, 'g8-4br5c-offline-runner-receipt.json');
const steps: Array<G8V2ConflictOfflineStep & { output: string }> = [
  { label: 'analysis', verifyReplay: false, output: resolve(PRIVATE_ROOT, 'g8-4br5c-offline-analysis.json') },
  { label: 'verified-1', verifyReplay: true, output: resolve(PRIVATE_ROOT, 'g8-4br5c-offline-verified-1.json') },
  { label: 'verified-2', verifyReplay: true, output: resolve(PRIVATE_ROOT, 'g8-4br5c-offline-verified-2.json') },
];

const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const stable = (value: unknown) => JSON.stringify(value);
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
function expect(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
function countBy(values: unknown[], key: (value: any) => string) {
  const counts = new Map<string, number>();
  for (const value of values) { const label = key(value); counts.set(label, (counts.get(label) ?? 0) + 1); }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}
const snapshotFile = () => {
  const body = readFileSync(SNAPSHOT);
  return { bytes: statSync(SNAPSHOT).size, sha256: sha256(body), body };
};
const writeJsonExclusive = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const childEvidence = (step: G8V2ConflictOfflineStep, child: G8V2ConflictOfflineChildResult, startedAt: string, finishedAt: string) => ({
  label: step.label,
  verifyReplay: step.verifyReplay,
  startedAt,
  finishedAt,
  exitStatus: child.status,
  signal: child.signal,
  errorCode: child.errorCode,
  stdoutBytes: child.stdout.length,
  stdoutSha256: sha256(child.stdout),
  stderrBytes: child.stderr.length,
  stderrSha256: sha256(child.stderr),
});

function parseAndValidateReport(raw: Buffer, step: G8V2ConflictOfflineStep, snapshot: Json) {
  const report = JSON.parse(raw.toString('utf8')) as Json;
  expect(report.schemaVersion === 1 && report.contract === G8_V2_CONFLICT_ANALYSIS_CONTRACT
    && report.operation === 'g8-4br5a-offline-conflict-analysis'
    && report.offlineReplayVerified === step.verifyReplay, 'OFFLINE_REPORT_CONTRACT_MISMATCH');
  expect(report.firebaseImported === false && report.credentialsLoaded === false && report.networkRequests === 0, 'OFFLINE_REPORT_SAFETY_MISMATCH');
  expect(isRecord(report.snapshot) && report.snapshot.contract === snapshot.contract
    && report.snapshot.inputDigest === snapshot.digests.input
    && report.snapshot.evidenceDigest === snapshot.digests.evidence
    && report.snapshot.planDigest === snapshot.digests.plan, 'OFFLINE_REPORT_SNAPSHOT_DIGEST_MISMATCH');
  expect(stable(report.counts) === stable(snapshot.counts) && report.counts.expected === 3352
    && report.counts.conflicting === 858 && report.counts.unknown === 0, 'OFFLINE_REPORT_COUNT_MISMATCH');
  expect(Array.isArray(report.comparisonInventory) && report.comparisonInventory.length === 2
    && stable(report.comparisonInventory.map((item: Json) => item.label)) === stable(['certified', 'historical'])
    && report.comparisonInventory.every((item: Json) => item.bundleDigest === CERTIFIED_BUNDLE_DIGEST && item.documentCount === 3353), 'OFFLINE_REPORT_COMPARISON_INVENTORY_MISMATCH');
  expect(Array.isArray(report.conflicts) && report.conflicts.length === 858
    && report.conflicts.every((item: Json) => isRecord(item.assessment) && item.assessment.safeToReplace === false
      && Array.isArray(item.localComparisons) && item.localComparisons.length === 2
      && stable(item.localComparisons.map((comparison: Json) => comparison.label)) === stable(['certified', 'historical'])), 'OFFLINE_REPORT_COMPARISON_INCOMPLETE');
  expect(isRecord(report.resolutionPlan) && report.resolutionPlan.defaultSafeToReplace === false
    && Array.isArray(report.resolutionPlan.entries) && report.resolutionPlan.entries.length === 858
    && report.resolutionPlan.entries.every((entry: Json) => entry.disposition === 'unresolved' && entry.safeToReplace === false
      && entry.rollbackEvidence === 'complete-actual-document-in-private-snapshot'), 'OFFLINE_REPORT_RESOLUTION_POLICY_MISMATCH');
  expect(typeof report.comparisonDigest === 'string' && /^[a-f0-9]{64}$/.test(report.comparisonDigest), 'OFFLINE_REPORT_COMPARISON_DIGEST_INVALID');
  return report;
}

function childEnvironment() {
  const environment = { ...process.env };
  delete environment.FIREBASE_SERVICE_ACCOUNT;
  delete environment.GOOGLE_APPLICATION_CREDENTIALS;
  delete environment.FIRESTORE_EMULATOR_HOST;
  environment.FIREBASE_SERVICE_ACCOUNT = 'C:\\definitely-missing-g8-4br5c.json';
  environment.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\definitely-missing-g8-4br5c.json';
  environment.HTTP_PROXY = 'http://127.0.0.1:9';
  environment.HTTPS_PROXY = 'http://127.0.0.1:9';
  environment.NO_PROXY = '';
  return environment;
}

function main() {
  expect(process.argv.length === 2, 'BR5C_RUNNER_ACCEPTS_NO_ARGUMENTS');
  for (const path of [RECEIPT, ...steps.map((step) => step.output)]) expect(!existsSync(path), 'BR5C_OUTPUT_COLLISION');
  const before = snapshotFile();
  expect(before.bytes === SNAPSHOT_BYTES && before.sha256 === SNAPSHOT_SHA256, 'BR5C_SNAPSHOT_INTEGRITY_MISMATCH_BEFORE');
  const { plan } = buildG8V2ConflictCertifiedPlan(CERTIFIED_BUNDLE, MANIFEST);
  const snapshot = validateG8V2ConflictSnapshot(JSON.parse(before.body.toString('utf8')), plan) as unknown as Json;
  expect(snapshot.inventory.length === 3352 && snapshot.conflicts.length === 858 && snapshot.unknown.length === 0, 'BR5C_SNAPSHOT_INCOMPLETE');
  const tsxCli = require.resolve('tsx/cli');
  const reports = new Map<string, Json>();
  const runEvidence: Json[] = [];
  const run = runG8V2ConflictOfflineSteps(steps, (step) => {
    const startedAt = new Date().toISOString();
    const arguments_ = [
      tsxCli, 'scripts/report-g8-4br5a-conflicts.ts',
      '--snapshot-in', SNAPSHOT_RELATIVE,
      '--bundle-in', CERTIFIED_BUNDLE,
      '--manifest', MANIFEST,
      '--comparison-bundle', `certified=${CERTIFIED_BUNDLE}`,
      '--comparison-bundle', `historical=${HISTORICAL_BUNDLE}`,
      ...(step.verifyReplay ? ['--verify-replay'] : []),
    ];
    const child = spawnSync(process.execPath, arguments_, {
      cwd: process.cwd(), env: childEnvironment(), shell: false, windowsHide: true,
      maxBuffer: 128 * 1024 * 1024, timeout: 10 * 60 * 1000,
    });
    const normalized: G8V2ConflictOfflineChildResult = {
      status: child.status,
      signal: child.signal,
      errorCode: child.error && 'code' in child.error ? String(child.error.code) : null,
      stdout: Buffer.from(child.stdout ?? ''),
      stderr: Buffer.from(child.stderr ?? ''),
    };
    runEvidence.push(childEvidence(step, normalized, startedAt, new Date().toISOString()));
    return normalized;
  }, (step, child) => {
    expect(child.stderr.length === 0 && sha256(child.stderr) === EMPTY_SHA256, 'OFFLINE_CHILD_STDERR_PRESENT');
    const report = parseAndValidateReport(child.stdout, step, snapshot);
    reports.set(step.label, report);
    const output = steps.find((candidate) => candidate.label === step.label)!.output;
    writeFileSync(output, child.stdout, { flag: 'wx' });
  });

  if (run.status === 'failed') {
    const failure = {
      contract: 'g8-4br5c-offline-runner-receipt/v1', status: 'failed', runs: runEvidence,
      safety: { firebaseImported: 'unknown', credentialsLoaded: 'unknown', networkRequests: 'unknown' },
      safeNextAction: 'stop; preserve snapshot and local failure evidence',
    };
    writeJsonExclusive(RECEIPT, failure);
    process.stdout.write(`${JSON.stringify(failure)}\n`);
    process.exitCode = 1;
    return;
  }

  const analysis = reports.get('analysis')!;
  const verified1 = reports.get('verified-1')!;
  const verified2 = reports.get('verified-2')!;
  const { offlineReplayVerified: _analysisReplay, ...analysisCore } = analysis;
  const { offlineReplayVerified: _verifiedReplay, ...verifiedCore } = verified1;
  expect(stable(analysisCore) === stable(verifiedCore), 'OFFLINE_NORMAL_AND_VERIFIED_REPORT_DRIFT');
  const verified1Bytes = run.results[1].child.stdout;
  const verified2Bytes = run.results[2].child.stdout;
  expect(verified1Bytes.equals(verified2Bytes) && stable(verified1) === stable(verified2), 'OFFLINE_INDEPENDENT_REPLAY_DRIFT');
  const after = snapshotFile();
  expect(after.bytes === before.bytes && after.sha256 === before.sha256 && after.body.equals(before.body), 'BR5C_SNAPSHOT_INTEGRITY_MISMATCH_AFTER');

  const assessments = analysis.conflicts.map((item: Json) => item.assessment);
  const differences = snapshot.conflicts.flatMap((item: Json) => item.differences);
  const receipt = {
    contract: 'g8-4br5c-offline-runner-receipt/v1',
    status: 'completed',
    snapshot: { path: SNAPSHOT_RELATIVE, bytesBefore: before.bytes, bytesAfter: after.bytes, sha256Before: before.sha256, sha256After: after.sha256, byteIdentical: true },
    runs: runEvidence,
    reports: {
      analysisSha256: runEvidence[0].stdoutSha256,
      verified1Sha256: runEvidence[1].stdoutSha256,
      verified2Sha256: runEvidence[2].stdoutSha256,
      independentVerifiedReportsByteIdentical: true,
    },
    digests: { ...analysis.snapshot, comparison: analysis.comparisonDigest },
    counts: analysis.counts,
    conflictClassifications: countBy(assessments, (item) => item.classification),
    differenceTypes: countBy(differences, (item) => item.kind),
    inferredOrigins: countBy(assessments, (item) => item.originInference),
    comparisons: {
      inventory: analysis.comparisonInventory,
      completedDocumentsPerBundle: 858,
      matchedDocuments: Object.fromEntries(['certified', 'historical'].map((label) => [label, analysis.conflicts.filter((item: Json) => item.localComparisons.find((comparison: Json) => comparison.label === label)?.matched).length])),
    },
    resolution: { unresolved: analysis.resolutionPlan.entries.filter((entry: Json) => entry.disposition === 'unresolved').length, safeToReplaceTrue: assessments.filter((item: Json) => item.safeToReplace).length, rollbackEvidenceComplete: analysis.resolutionPlan.entries.every((entry: Json) => entry.rollbackEvidence === 'complete-actual-document-in-private-snapshot') },
    safety: { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, productionOperations: 0 },
  };
  writeJsonExclusive(RECEIPT, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

try {
  main();
} catch (error) {
  const failure = {
    contract: 'g8-4br5c-offline-runner-receipt/v1', status: 'failed',
    errorClass: error instanceof Error ? error.message : 'UNKNOWN_OFFLINE_FAILURE',
    safety: { productionOperations: 0 },
    safeNextAction: 'stop; preserve snapshot and local failure evidence',
  };
  if (!existsSync(RECEIPT)) writeJsonExclusive(RECEIPT, failure);
  process.stdout.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}
