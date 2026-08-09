import assert from 'node:assert/strict';
import {
  buildG8V2DirectNodeTsxInvocation,
  buildG8V2StateAuditPreflightReceipt,
  parseG8V2StateAuditPreflightOutput,
  G8_V2_STATE_AUDIT_PREFLIGHT_CONTRACT,
  type G8V2StateAuditPreflightOutput,
} from './g8V2StateAuditPreflight.js';

const commit = 'a'.repeat(40);
const digests = {
  input: '1'.repeat(64),
  evidence: '2'.repeat(64),
  plan: '3'.repeat(64),
  bundle: '4'.repeat(64),
  namespace: '5'.repeat(64),
  activationPlan: '6'.repeat(64),
};
const values = [
  ['--bundle-in', '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json'],
  ['--manifest', 'docs/g8-catalog-beta-release-manifest.json'],
  ['--project-id', 'politipiks'],
  ['--database-id', 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a'],
  ['--generation', 'canonical-2026-shadow-v2'],
  ['--expected-shadow-source-commit', 'b'.repeat(40)],
  ['--expected-activation-implementation-commit', commit],
  ['--expected-state-audit-implementation-commit', commit],
  ['--expected-input-digest', digests.input],
  ['--expected-evidence-digest', digests.evidence],
  ['--expected-plan-digest', digests.plan],
  ['--expected-bundle-digest', digests.bundle],
  ['--expected-namespace-digest', digests.namespace],
  ['--expected-races', '470'],
  ['--expected-measures', '14'],
  ['--expected-candidate-research', '2384'],
  ['--expected-measure-research', '14'],
  ['--expected-metrics', '470'],
  ['--expected-content-documents', '3352'],
  ['--shadow-verification-receipt', 'shadow-receipt'],
  ['--promotion-receipt', 'promotion-receipt'],
  ['--activation-receipt', 'activation-receipt'],
  ['--rollback-receipt', 'rollback-receipt'],
  ['--audit-receipt', 'audit-receipt'],
] as const;

const buildOutput = (): G8V2StateAuditPreflightOutput => ({
  phase: 'g8-4br0-firebase-free-preflight',
  firebaseInitialization: false,
  reads: 0,
  writes: 0,
  identity: { activationImplementationCommit: commit, stateAuditImplementationCommit: commit },
  expectedCounts: { races: 470, measures: 14, candidateResearch: 2384, measureResearch: 14, metrics: 470, contentDocuments: 3352, totalBundleDocuments: 3353, selectorsExcluded: 1 },
  planDigest: digests.activationPlan,
  namespaceDigest: digests.namespace,
  audit: buildG8V2DirectNodeTsxInvocation('scripts/audit-g8-4br0-state.ts', ['--audit', ...values.flat()]),
});
const setFlag = (output: G8V2StateAuditPreflightOutput, flag: string, value: string) => {
  const index = output.audit.arguments.indexOf(flag);
  assert.notEqual(index, -1, `missing fixture flag ${flag}`);
  output.audit.arguments[index + 1] = value;
};
const clone = (output: G8V2StateAuditPreflightOutput) => structuredClone(output);
const changedDigest = (mutate: (output: G8V2StateAuditPreflightOutput) => void) => {
  const output = clone(buildOutput());
  mutate(output);
  assert.notEqual(buildG8V2StateAuditPreflightReceipt(output).digest, baseline.digest);
};
const changesOrRejects = (mutate: (output: G8V2StateAuditPreflightOutput) => void) => {
  const output = clone(buildOutput());
  mutate(output);
  try {
    assert.notEqual(buildG8V2StateAuditPreflightReceipt(output).digest, baseline.digest);
  } catch (error) {
    assert.equal(error instanceof Error, true);
  }
};

const baselineOutput = buildOutput();
const baseline = buildG8V2StateAuditPreflightReceipt(baselineOutput);
assert.equal(baseline.receipt.contract, G8_V2_STATE_AUDIT_PREFLIGHT_CONTRACT);
assert.equal(baseline.receipt.launcher.argumentCount, 51);
assert.deepEqual(baseline.receipt.launcher.arguments, baselineOutput.audit.arguments);
assert.equal(baseline.receipt.receipts.uniqueCount, 5);
assert.equal(baseline.receipt.expectedCounts.contentDocuments, 3352);

const published = { ...baselineOutput, canonicalReceipt: baseline.receipt, canonicalDigest: baseline.digest };
const pretty = `${JSON.stringify(published, null, 2)}\n`;
const reverseObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseObjectKeys(child)]));
  return value;
};
const presentationVariants = [
  pretty,
  JSON.stringify(published),
  JSON.stringify(reverseObjectKeys(published), null, 4),
  pretty.replace(/\n/g, '\r\n'),
  `\uFEFF${pretty}`,
  `\n> react-example@0.0.0 g8-4br0-state-audit-preflight\r\n> tsx scripts/verify-g8-4br0-state-audit-preflight.ts\r\n\r\n${pretty.replace(/\n/g, '\r\n')}  \r\n`,
];
for (const raw of presentationVariants) {
  const parsed = parseG8V2StateAuditPreflightOutput(Buffer.from(raw, 'utf8'));
  assert.deepEqual(parsed.receipt, baseline.receipt);
  assert.equal(parsed.digest, baseline.digest);
}

changedDigest((output) => setFlag(output, '--project-id', 'other-project'));
changedDigest((output) => setFlag(output, '--database-id', 'other-database'));
changedDigest((output) => setFlag(output, '--generation', 'other-generation'));
changedDigest((output) => setFlag(output, '--audit-receipt', 'other-audit-receipt'));
changedDigest((output) => setFlag(output, '--expected-input-digest', '7'.repeat(64)));
changedDigest((output) => { output.planDigest = '7'.repeat(64); });

changedDigest((output) => {
  const changedCommit = 'c'.repeat(40);
  output.identity.activationImplementationCommit = changedCommit;
  output.identity.stateAuditImplementationCommit = changedCommit;
  setFlag(output, '--expected-activation-implementation-commit', changedCommit);
  setFlag(output, '--expected-state-audit-implementation-commit', changedCommit);
});

assert.throws(() => {
  const output = clone(buildOutput());
  (output as unknown as { firebaseInitialization: boolean }).firebaseInitialization = true;
  buildG8V2StateAuditPreflightReceipt(output);
}, /Firebase initialization/);
assert.throws(() => {
  const output = clone(buildOutput());
  (output as unknown as { reads: number }).reads = 1;
  buildG8V2StateAuditPreflightReceipt(output);
}, /zero reads and writes/);
assert.throws(() => {
  const output = clone(buildOutput());
  output.audit.arguments.splice(4, 2);
  buildG8V2StateAuditPreflightReceipt(output);
}, /51 ordered arguments/);
assert.throws(() => {
  const output = clone(buildOutput());
  setFlag(output, '--audit-receipt', 'rollback-receipt');
  buildG8V2StateAuditPreflightReceipt(output);
}, /unique receipts/);
assert.throws(() => {
  const output = clone(buildOutput());
  output.expectedCounts.contentDocuments = 3353;
  setFlag(output, '--expected-content-documents', '3353');
  buildG8V2StateAuditPreflightReceipt(output);
}, /3,352 content documents/);
assert.throws(() => {
  const output = clone(buildOutput());
  output.identity.stateAuditImplementationCommit = 'c'.repeat(40);
  buildG8V2StateAuditPreflightReceipt(output);
}, /implementation identity/);
assert.throws(() => {
  const output = clone(buildOutput());
  output.namespaceDigest = '7'.repeat(64);
  buildG8V2StateAuditPreflightReceipt(output);
}, /namespace digest/);
assert.throws(() => {
  const output = clone(buildOutput());
  [output.audit.arguments[3], output.audit.arguments[5]] = [output.audit.arguments[5], output.audit.arguments[3]];
  buildG8V2StateAuditPreflightReceipt(output);
}, /ordered flag/);
assert.throws(() => {
  const output = clone(buildOutput());
  output.audit.executable = output.audit.cwd;
  buildG8V2StateAuditPreflightReceipt(output);
}, /process executable/);
assert.throws(() => {
  const output = clone(buildOutput());
  output.audit.cwd = process.cwd().replace(/.$/, 'x');
  buildG8V2StateAuditPreflightReceipt(output);
}, /working directory/);
assert.throws(() => parseG8V2StateAuditPreflightOutput(Buffer.from(`${JSON.stringify({ ...published, canonicalDigest: '0'.repeat(64) })}\n`)), /embedded canonical digest/);

for (let index = 0; index < baselineOutput.audit.arguments.length; index += 1) {
  changesOrRejects((output) => {
    const original = output.audit.arguments[index];
    if (index === 0) output.audit.arguments[index] = `${original}.tampered`;
    else if (index === 1 || index === 2 || index % 2 === 1) output.audit.arguments[index] = `${original}-tampered`;
    else {
      const flag = output.audit.arguments[index - 1];
      const changedCommit = 'c'.repeat(40);
      const changedDigestValue = '7'.repeat(64);
      if (flag === '--expected-activation-implementation-commit') { output.audit.arguments[index] = changedCommit; output.identity.activationImplementationCommit = changedCommit; }
      else if (flag === '--expected-state-audit-implementation-commit') { output.audit.arguments[index] = changedCommit; output.identity.stateAuditImplementationCommit = changedCommit; }
      else if (flag === '--expected-shadow-source-commit') output.audit.arguments[index] = changedCommit;
      else if (flag === '--expected-namespace-digest') { output.audit.arguments[index] = changedDigestValue; output.namespaceDigest = changedDigestValue; }
      else if (flag.startsWith('--expected-') && flag.endsWith('-digest')) output.audit.arguments[index] = changedDigestValue;
      else if (flag.startsWith('--expected-') && /^\d+$/.test(original)) output.audit.arguments[index] = String(Number(original) + 1);
      else output.audit.arguments[index] = `${original}-tampered`;
    }
  });
}

console.log(`G8.4BR2.1 canonical preflight receipt tests passed: ${baseline.digest}`);
