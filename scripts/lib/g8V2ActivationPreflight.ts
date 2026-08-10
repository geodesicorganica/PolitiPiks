import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { TextDecoder } from 'node:util';
import { buildG8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, type G8V2ActivationIdentity, type G8V2AuthorizationReceipts } from './g8V2Activation.js';
import { assertCommittedG8V2Implementation, assertG8V2ActivationGuards, type G8V2ActivationArguments } from './g8V2ActivationCli.js';
import { G8_V2_ACTIVATION_RESULT_CONTRACT } from './g8V2ActivationResult.js';
import { buildG8V2DirectNodeTsxInvocation, type G8V2DirectNodeTsxInvocation } from './g8V2StateAuditPreflight.js';
import { validateLocalProductBundle } from './localProductBundle.js';

const require = createRequire(import.meta.url);
const ACTIVATION_SCRIPT = 'scripts/activate-g8-3a-v2.ts' as const;
export const G8_V2_ACTIVATION_PREFLIGHT_CONTRACT = 'g8-4br4a-activation-preflight/v1' as const;
export const G8_V2_ACTIVATION_PREFLIGHT_PHASE = 'g8-4br4a-firebase-free-activation-preflight' as const;
export const G8_V2_ACTIVATION_STATE_MACHINE = {
  apply: ['validate-shadow', 'create-compatible-pending-selector', 'create-only-compatible-content-promotion', 'exact-content-verification', 'active-selector'] as const,
  verifyOnly: ['validate-shadow', 'require-active-selector', 'exact-content-verification'] as const,
  rollback: ['require-active-selector', 'selector-only-rollback', 'retain-all-content'] as const,
};

const ORDERED_VALUE_FLAGS = [
  '--bundle-in', '--manifest', '--project-id', '--database-id', '--generation',
  '--expected-shadow-source-commit', '--expected-activation-implementation-commit',
  '--expected-input-digest', '--expected-evidence-digest', '--expected-plan-digest', '--expected-bundle-digest', '--expected-namespace-digest',
  '--expected-races', '--expected-measures', '--expected-candidate-research', '--expected-measure-research', '--expected-metrics', '--expected-content-documents',
  '--shadow-verification-receipt', '--promotion-receipt', '--activation-receipt', '--rollback-receipt',
] as const;
type OrderedFlag = typeof ORDERED_VALUE_FLAGS[number];
type Json = Record<string, unknown>;

export type G8V2ProductionArgumentArrays = {
  apply: G8V2DirectNodeTsxInvocation;
  verifyOnly: G8V2DirectNodeTsxInvocation;
  rollback: G8V2DirectNodeTsxInvocation;
  identity: G8V2ActivationIdentity;
  receipts: G8V2AuthorizationReceipts;
  planDigest: string;
  namespaceDigest: string;
  expectedCounts: ReturnType<typeof buildG8ProductShadowWritePlan>['expectedCounts'];
};

export type G8V2ActivationPreflightOutput = G8V2ProductionArgumentArrays & {
  phase: typeof G8_V2_ACTIVATION_PREFLIGHT_PHASE;
  firebaseInitialization: false;
  reads: 0;
  writes: 0;
  commandsExecuted: 0;
  stateMachine: typeof G8_V2_ACTIVATION_STATE_MACHINE;
  canonicalReceipt?: G8V2ActivationPreflightReceipt;
  canonicalDigest?: string;
};

type LauncherReceipt = {
  contract: 'direct-node-tsx/v1';
  executable: string;
  cwd: string;
  tsxCliPath: string;
  scriptPath: typeof ACTIVATION_SCRIPT;
  mode: '--apply' | '--verify-only' | '--rollback';
  shell: false;
  argumentCount: 47;
  arguments: string[];
  argumentsDigest: string;
};

export type G8V2ActivationPreflightReceipt = {
  contract: typeof G8_V2_ACTIVATION_PREFLIGHT_CONTRACT;
  phase: typeof G8_V2_ACTIVATION_PREFLIGHT_PHASE;
  resultContract: typeof G8_V2_ACTIVATION_RESULT_CONTRACT;
  target: { projectId: string; databaseId: string; generation: string };
  inputs: { bundlePath: string; manifestPath: string };
  launchers: { apply: LauncherReceipt; verifyOnly: LauncherReceipt; rollback: LauncherReceipt };
  implementationIdentities: { shadowSourceCommit: string; activationImplementationCommit: string };
  receipts: G8V2AuthorizationReceipts & { count: 4; uniqueCount: 4; futureOperation: 'G8.4BR4B' };
  expectedCounts: G8V2ProductionArgumentArrays['expectedCounts'];
  certifiedDigests: { input: string; evidence: string; releasePlan: string; bundle: string; namespace: string; activationPlan: string };
  expectedStateMachine: typeof G8_V2_ACTIVATION_STATE_MACHINE;
  safety: { firebaseInitialization: false; reads: 0; writes: 0; commandsExecuted: 0; shell: false };
};

export type G8V2ActivationPreflightOptions = {
  manifestPath: string;
  bundlePath: string;
  shadowSourceCommit: string;
  activationImplementationCommit: string;
  receipts: G8V2AuthorizationReceipts;
  verifyImplementation?: boolean;
};

const flag = (name: string, value: string | number) => [name, String(value)];
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as any;
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('unsupported non-finite canonical activation-preflight value');
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('unsupported canonical activation-preflight value');
  return encoded;
};
const canonicalDigest = (value: unknown) => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');

function commonArguments(options: G8V2ActivationPreflightOptions, manifest: { release: { generation: string; target: { projectId: string; databaseId: string }; expectedDigests: Record<string, string> } }, plan: ReturnType<typeof buildG8V2ActivationPlan>) {
  const counts = plan.expectedCounts;
  return [
    ...flag('--bundle-in', options.bundlePath), ...flag('--manifest', options.manifestPath),
    ...flag('--project-id', manifest.release.target.projectId), ...flag('--database-id', manifest.release.target.databaseId),
    ...flag('--generation', manifest.release.generation),
    ...flag('--expected-shadow-source-commit', plan.shadowSourceCommit), ...flag('--expected-activation-implementation-commit', plan.activationImplementationCommit),
    ...flag('--expected-input-digest', manifest.release.expectedDigests.input), ...flag('--expected-evidence-digest', manifest.release.expectedDigests.evidence),
    ...flag('--expected-plan-digest', manifest.release.expectedDigests.plan), ...flag('--expected-bundle-digest', manifest.release.expectedDigests.bundle),
    ...flag('--expected-namespace-digest', plan.certifiedDigests.namespace),
    ...flag('--expected-races', counts.races), ...flag('--expected-measures', counts.measures),
    ...flag('--expected-candidate-research', counts.candidateResearch), ...flag('--expected-measure-research', counts.measureResearch),
    ...flag('--expected-metrics', counts.metrics), ...flag('--expected-content-documents', counts.contentDocuments),
    ...flag('--shadow-verification-receipt', options.receipts.shadowVerification), ...flag('--promotion-receipt', options.receipts.promotion),
    ...flag('--activation-receipt', options.receipts.activation), ...flag('--rollback-receipt', options.receipts.rollback),
  ];
}

function invocation(mode: '--apply' | '--verify-only' | '--rollback', common: string[]) {
  return buildG8V2DirectNodeTsxInvocation(ACTIVATION_SCRIPT, [mode, ...common]);
}

/** Builds sanitized future direct Node/tsx invocations only. It never imports
 * Firebase, starts a child, or performs any read or write. */
export function buildG8V2ProductionArgumentArrays(options: G8V2ActivationPreflightOptions): G8V2ProductionArgumentArrays {
  if (options.shadowSourceCommit !== CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT) throw new Error('preflight shadow source commit is not the certified historical identity');
  if (new Set(Object.values(options.receipts)).size !== 4) throw new Error('preflight requires four distinct operation receipts');
  if (Object.values(options.receipts).some((receipt) => !/^g8-4br4b-[a-z0-9._:-]+$/.test(receipt))) throw new Error('preflight requires distinct future G8.4BR4B operation receipts');
  const bundle = validateLocalProductBundle(readJson(options.bundlePath));
  const manifest = readJson(options.manifestPath) as { release: { generation: string; target: { projectId: string; databaseId: string }; expectedDigests: Record<string, string> } };
  const identity: G8V2ActivationIdentity = { identitySchemaVersion: 2, shadowSourceCommit: options.shadowSourceCommit, activationImplementationCommit: options.activationImplementationCommit };
  const shadowPlan = buildG8ProductShadowWritePlan(bundle, identity.shadowSourceCommit);
  const plan = buildG8V2ActivationPlan(shadowPlan, options.receipts, identity);
  const common = commonArguments(options, manifest, plan);
  const operationArguments = { dryRun: false, apply: false, verifyOnly: false, rollback: false, bundleIn: options.bundlePath, manifest: options.manifestPath, projectId: manifest.release.target.projectId, databaseId: manifest.release.target.databaseId, generation: manifest.release.generation, expectedShadowSourceCommit: identity.shadowSourceCommit, expectedActivationImplementationCommit: identity.activationImplementationCommit, expectedInputDigest: manifest.release.expectedDigests.input, expectedEvidenceDigest: manifest.release.expectedDigests.evidence, expectedPlanDigest: manifest.release.expectedDigests.plan, expectedBundleDigest: manifest.release.expectedDigests.bundle, expectedNamespaceDigest: plan.certifiedDigests.namespace, expectedRaces: String(plan.expectedCounts.races), expectedMeasures: String(plan.expectedCounts.measures), expectedCandidateResearch: String(plan.expectedCounts.candidateResearch), expectedMeasureResearch: String(plan.expectedCounts.measureResearch), expectedMetrics: String(plan.expectedCounts.metrics), expectedContentDocuments: String(plan.expectedCounts.contentDocuments), shadowVerificationReceipt: options.receipts.shadowVerification, promotionReceipt: options.receipts.promotion, activationReceipt: options.receipts.activation, rollbackReceipt: options.receipts.rollback } satisfies G8V2ActivationArguments;
  for (const mode of ['apply', 'verifyOnly', 'rollback'] as const) assertG8V2ActivationGuards({ ...operationArguments, apply: mode === 'apply', verifyOnly: mode === 'verifyOnly', rollback: mode === 'rollback' }, plan, manifest);
  if (options.verifyImplementation !== false) assertCommittedG8V2Implementation(identity);
  return { apply: invocation('--apply', common), verifyOnly: invocation('--verify-only', common), rollback: invocation('--rollback', common), identity, receipts: { ...options.receipts }, planDigest: plan.planDigest, namespaceDigest: plan.certifiedDigests.namespace, expectedCounts: plan.expectedCounts };
}

function assertOutput(value: unknown): asserts value is G8V2ActivationPreflightOutput {
  if (!isRecord(value)) throw new Error('activation preflight output must be a JSON object');
  const allowed = new Set(['phase', 'firebaseInitialization', 'reads', 'writes', 'commandsExecuted', 'identity', 'receipts', 'expectedCounts', 'planDigest', 'namespaceDigest', 'stateMachine', 'apply', 'verifyOnly', 'rollback', 'canonicalReceipt', 'canonicalDigest']);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`unexpected activation preflight output field: ${unexpected[0]}`);
  if (value.phase !== G8_V2_ACTIVATION_PREFLIGHT_PHASE || value.firebaseInitialization !== false || value.reads !== 0 || value.writes !== 0 || value.commandsExecuted !== 0) throw new Error('activation preflight must be Firebase-free with zero reads, writes, and executed commands');
  if (!isRecord(value.identity) || typeof value.identity.shadowSourceCommit !== 'string' || typeof value.identity.activationImplementationCommit !== 'string') throw new Error('missing activation preflight identity');
  if (!isRecord(value.receipts) || !isRecord(value.expectedCounts) || !isRecord(value.apply) || !isRecord(value.verifyOnly) || !isRecord(value.rollback)) throw new Error('malformed activation preflight body');
  if (typeof value.planDigest !== 'string' || typeof value.namespaceDigest !== 'string' || !isRecord(value.stateMachine)) throw new Error('missing activation preflight semantic fields');
}

function parseOrdered(invocationValue: G8V2DirectNodeTsxInvocation, expectedMode: '--apply' | '--verify-only' | '--rollback') {
  if (invocationValue.executable !== process.execPath || !isAbsolute(invocationValue.executable)) throw new Error('activation preflight requires direct process.execPath');
  if (invocationValue.cwd !== process.cwd() || !isAbsolute(invocationValue.cwd)) throw new Error('activation preflight requires the direct absolute working directory');
  const expectedTsxCli = require.resolve('tsx/cli');
  if (invocationValue.arguments.length !== 47) throw new Error('activation preflight requires exactly 47 ordered arguments');
  if (invocationValue.arguments[0] !== expectedTsxCli || !isAbsolute(invocationValue.arguments[0])) throw new Error('activation preflight requires repository-resolved tsx/cli');
  if (invocationValue.arguments[1] !== ACTIVATION_SCRIPT || invocationValue.arguments[2] !== expectedMode) throw new Error('activation preflight mode or script differs');
  const values = {} as Record<OrderedFlag, string>;
  for (let index = 0; index < ORDERED_VALUE_FLAGS.length; index += 1) {
    const offset = 3 + index * 2;
    const expected = ORDERED_VALUE_FLAGS[index];
    if (invocationValue.arguments[offset] !== expected) throw new Error(`activation preflight ordered flag mismatch at argument ${offset}: expected ${expected}`);
    const value = invocationValue.arguments[offset + 1];
    if (!value || value.startsWith('--')) throw new Error(`activation preflight missing value for ${expected}`);
    values[expected] = value;
  }
  return values;
}

function launcherReceipt(value: G8V2DirectNodeTsxInvocation, mode: LauncherReceipt['mode']): LauncherReceipt {
  return { contract: 'direct-node-tsx/v1', executable: value.executable, cwd: value.cwd, tsxCliPath: value.arguments[0], scriptPath: ACTIVATION_SCRIPT, mode, shell: false, argumentCount: 47, arguments: [...value.arguments], argumentsDigest: canonicalDigest(value.arguments) };
}

export function buildG8V2ActivationPreflightReceipt(outputValue: unknown) {
  assertOutput(outputValue);
  const output = outputValue;
  const applyValues = parseOrdered(output.apply, '--apply');
  const verifyValues = parseOrdered(output.verifyOnly, '--verify-only');
  const rollbackValues = parseOrdered(output.rollback, '--rollback');
  for (const flagName of ORDERED_VALUE_FLAGS) if (applyValues[flagName] !== verifyValues[flagName] || applyValues[flagName] !== rollbackValues[flagName]) throw new Error(`activation preflight operation arguments differ for ${flagName}`);
  const commitPattern = /^[a-f0-9]{40}$/;
  if (!commitPattern.test(applyValues['--expected-shadow-source-commit']) || !commitPattern.test(applyValues['--expected-activation-implementation-commit'])) throw new Error('invalid activation preflight implementation identity');
  if (output.identity.shadowSourceCommit !== applyValues['--expected-shadow-source-commit'] || output.identity.activationImplementationCommit !== applyValues['--expected-activation-implementation-commit']) throw new Error('activation preflight identity differs from ordered arguments');
  const digestFlags = ['--expected-input-digest', '--expected-evidence-digest', '--expected-plan-digest', '--expected-bundle-digest', '--expected-namespace-digest'] as const;
  if (digestFlags.some((name) => !/^[a-f0-9]{64}$/.test(applyValues[name])) || !/^[a-f0-9]{64}$/.test(output.planDigest) || !/^[a-f0-9]{64}$/.test(output.namespaceDigest)) throw new Error('invalid activation preflight digest');
  if (output.namespaceDigest !== applyValues['--expected-namespace-digest']) throw new Error('activation preflight namespace digest differs from arguments');
  const countKeys = { races: '--expected-races', measures: '--expected-measures', candidateResearch: '--expected-candidate-research', measureResearch: '--expected-measure-research', metrics: '--expected-metrics', contentDocuments: '--expected-content-documents' } as const;
  for (const [key, flagName] of Object.entries(countKeys)) {
    const count = Number(applyValues[flagName as OrderedFlag]);
    if (!Number.isSafeInteger(count) || String(count) !== applyValues[flagName as OrderedFlag] || output.expectedCounts[key] !== count) throw new Error(`activation preflight expected count differs: ${key}`);
  }
  if (output.expectedCounts.contentDocuments !== 3352 || output.expectedCounts.totalBundleDocuments !== 3353 || output.expectedCounts.selectorsExcluded !== 1) throw new Error('activation preflight requires exact 3,352 content documents and one excluded selector');
  const receipts = { shadowVerification: applyValues['--shadow-verification-receipt'], promotion: applyValues['--promotion-receipt'], activation: applyValues['--activation-receipt'], rollback: applyValues['--rollback-receipt'] };
  if (Object.values(receipts).some((receipt) => !/^g8-4br4b-[a-z0-9._:-]+$/.test(receipt)) || new Set(Object.values(receipts)).size !== 4) throw new Error('activation preflight requires four distinct future G8.4BR4B receipts');
  if (canonicalJson(output.receipts) !== canonicalJson(receipts)) throw new Error('activation preflight receipts differ from ordered arguments');
  if (canonicalJson(output.stateMachine) !== canonicalJson(G8_V2_ACTIVATION_STATE_MACHINE)) throw new Error('activation preflight state machine differs');
  const receipt: G8V2ActivationPreflightReceipt = {
    contract: G8_V2_ACTIVATION_PREFLIGHT_CONTRACT,
    phase: G8_V2_ACTIVATION_PREFLIGHT_PHASE,
    resultContract: G8_V2_ACTIVATION_RESULT_CONTRACT,
    target: { projectId: applyValues['--project-id'], databaseId: applyValues['--database-id'], generation: applyValues['--generation'] },
    inputs: { bundlePath: applyValues['--bundle-in'], manifestPath: applyValues['--manifest'] },
    launchers: { apply: launcherReceipt(output.apply, '--apply'), verifyOnly: launcherReceipt(output.verifyOnly, '--verify-only'), rollback: launcherReceipt(output.rollback, '--rollback') },
    implementationIdentities: { shadowSourceCommit: output.identity.shadowSourceCommit, activationImplementationCommit: output.identity.activationImplementationCommit },
    receipts: { ...receipts, count: 4, uniqueCount: 4, futureOperation: 'G8.4BR4B' },
    expectedCounts: { ...output.expectedCounts } as G8V2ProductionArgumentArrays['expectedCounts'],
    certifiedDigests: { input: applyValues['--expected-input-digest'], evidence: applyValues['--expected-evidence-digest'], releasePlan: applyValues['--expected-plan-digest'], bundle: applyValues['--expected-bundle-digest'], namespace: output.namespaceDigest, activationPlan: output.planDigest },
    expectedStateMachine: G8_V2_ACTIVATION_STATE_MACHINE,
    safety: { firebaseInitialization: false, reads: 0, writes: 0, commandsExecuted: 0, shell: false },
  };
  return { receipt, digest: canonicalDigest(receipt) };
}

export function parseG8V2ActivationPreflightOutput(raw: string | Uint8Array) {
  const text = typeof raw === 'string' ? raw : new TextDecoder('utf-8', { fatal: true }).decode(raw);
  const withoutBom = text.replace(/^\uFEFF/, '');
  const jsonStart = withoutBom.indexOf('{');
  if (jsonStart < 0) throw new Error('activation preflight output does not contain JSON');
  let value: unknown;
  try { value = JSON.parse(withoutBom.slice(jsonStart).trim()) as unknown; } catch { throw new Error('activation preflight output contains malformed JSON'); }
  const canonical = buildG8V2ActivationPreflightReceipt(value);
  const embedded = value as G8V2ActivationPreflightOutput;
  if (embedded.canonicalReceipt !== undefined && canonicalJson(embedded.canonicalReceipt) !== canonicalJson(canonical.receipt)) throw new Error('embedded activation canonical receipt differs');
  if (embedded.canonicalDigest !== undefined && embedded.canonicalDigest !== canonical.digest) throw new Error('embedded activation canonical digest differs');
  return { output: embedded, ...canonical };
}

export function buildG8V2ActivationPreflightOutput(options: G8V2ActivationPreflightOptions): G8V2ActivationPreflightOutput {
  const generated = buildG8V2ProductionArgumentArrays(options);
  const base: G8V2ActivationPreflightOutput = {
    phase: G8_V2_ACTIVATION_PREFLIGHT_PHASE,
    firebaseInitialization: false,
    reads: 0,
    writes: 0,
    commandsExecuted: 0,
    identity: generated.identity,
    receipts: generated.receipts,
    expectedCounts: generated.expectedCounts,
    planDigest: generated.planDigest,
    namespaceDigest: generated.namespaceDigest,
    stateMachine: G8_V2_ACTIVATION_STATE_MACHINE,
    apply: generated.apply,
    verifyOnly: generated.verifyOnly,
    rollback: generated.rollback,
  };
  const canonical = buildG8V2ActivationPreflightReceipt(base);
  return { ...base, canonicalReceipt: canonical.receipt, canonicalDigest: canonical.digest };
}
