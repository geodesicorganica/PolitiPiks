import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { TextDecoder } from 'node:util';
import { buildG8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, type G8V2AuthorizationReceipts } from './g8V2Activation.js';
import { assertCommittedG8V2Implementation, assertCommittedG8V2StateAuditImplementation } from './g8V2ActivationCli.js';
import { validateLocalProductBundle } from './localProductBundle.js';
import { G8_V2_STATE_AUDIT_RESULT_CONTRACT } from './g8V2StateAuditResult.js';

const require = createRequire(import.meta.url);
const STATE_AUDIT_SCRIPT = 'scripts/audit-g8-4br0-state.ts';

export type G8V2StateAuditPreflightOptions = {
  manifestPath: string;
  bundlePath: string;
  shadowSourceCommit: string;
  activationImplementationCommit: string;
  stateAuditImplementationCommit: string;
  activationReceipts: G8V2AuthorizationReceipts;
  auditReceipt: string;
};

export type G8V2DirectNodeTsxInvocation = {
  executable: string;
  arguments: string[];
  cwd: string;
};

export type G8V2JsonChildLaunchEvidence = {
  childStarted: boolean;
  childExited: boolean;
  childExitStatus: number | null;
  childSignal: NodeJS.Signals | null;
  errorCode: string | null;
  stdoutPresent: boolean;
  stderrPresent: boolean;
  outputStatus: 'not-applicable' | 'valid-json' | 'missing-json' | 'malformed-json';
  argumentCount: number;
  invocationAccounting: { attempted: 1; started: 0 | 1; exited: 0 | 1 };
};

export type G8V2JsonChildLaunchResult = {
  invocation: G8V2DirectNodeTsxInvocation;
  evidence: G8V2JsonChildLaunchEvidence;
  stdout: string;
  stderr: string;
  result: unknown | null;
  launcherExitStatus: number;
};

type Spawn = (
  executable: string,
  arguments_: readonly string[],
  options: { cwd: string; encoding: 'utf8'; env: NodeJS.ProcessEnv; windowsHide: true; shell: false },
) => SpawnSyncReturns<string>;

export type G8V2StateAuditProductionArguments = { audit: G8V2DirectNodeTsxInvocation; identity: { activationImplementationCommit: string; stateAuditImplementationCommit: string }; expectedCounts: ReturnType<typeof buildG8ProductShadowWritePlan>['expectedCounts']; planDigest: string; namespaceDigest: string };
export type G8V2StateAuditPreflightOutput = {
  phase: 'g8-4br3a-firebase-free-preflight';
  firebaseInitialization: false;
  reads: 0;
  writes: 0;
  identity: G8V2StateAuditProductionArguments['identity'];
  expectedCounts: G8V2StateAuditProductionArguments['expectedCounts'];
  planDigest: string;
  namespaceDigest: string;
  audit: G8V2DirectNodeTsxInvocation;
  canonicalReceipt?: G8V2StateAuditPreflightReceipt;
  canonicalDigest?: string;
};
export type G8V2StateAuditPreflightReceipt = {
  contract: typeof G8_V2_STATE_AUDIT_PREFLIGHT_CONTRACT;
  phase: G8V2StateAuditPreflightOutput['phase'];
  resultContract: typeof G8_V2_STATE_AUDIT_RESULT_CONTRACT;
  target: { projectId: string; databaseId: string; generation: string };
  inputs: { bundlePath: string; manifestPath: string };
  launcher: {
    contract: 'direct-node-tsx/v1';
    executable: string;
    cwd: string;
    tsxCliPath: string;
    scriptPath: typeof STATE_AUDIT_SCRIPT;
    mode: '--audit';
    shell: false;
    argumentCount: 51;
    arguments: string[];
    argumentsDigest: string;
  };
  implementationIdentities: { shadowSourceCommit: string; activationImplementationCommit: string; stateAuditImplementationCommit: string };
  receipts: { shadowVerification: string; promotion: string; activation: string; rollback: string; audit: string; count: 5; uniqueCount: 5 };
  expectedCounts: G8V2StateAuditPreflightOutput['expectedCounts'];
  certifiedDigests: { input: string; evidence: string; releasePlan: string; bundle: string; namespace: string; activationPlan: string };
  safety: { firebaseInitialization: false; reads: 0; writes: 0 };
};

export const G8_V2_STATE_AUDIT_PREFLIGHT_CONTRACT = 'g8-4br3a-state-audit-preflight/v1' as const;
const STATE_AUDIT_ORDERED_VALUE_FLAGS = [
  '--bundle-in', '--manifest', '--project-id', '--database-id', '--generation',
  '--expected-shadow-source-commit', '--expected-activation-implementation-commit', '--expected-state-audit-implementation-commit',
  '--expected-input-digest', '--expected-evidence-digest', '--expected-plan-digest', '--expected-bundle-digest', '--expected-namespace-digest',
  '--expected-races', '--expected-measures', '--expected-candidate-research', '--expected-measure-research', '--expected-metrics', '--expected-content-documents',
  '--shadow-verification-receipt', '--promotion-receipt', '--activation-receipt', '--rollback-receipt', '--audit-receipt',
] as const;
type StateAuditFlag = typeof STATE_AUDIT_ORDERED_VALUE_FLAGS[number];
type JsonRecord = Record<string, unknown>;

const flag = (name: string, value: string | number) => [name, String(value)];
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as any;
const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('unsupported non-finite canonical preflight value');
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('unsupported canonical preflight value');
  return encoded;
};
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const canonicalDigest = (value: unknown) => sha256(canonicalJson(value));

function assertPreflightOutput(value: unknown): asserts value is G8V2StateAuditPreflightOutput {
  if (!isRecord(value)) throw new Error('preflight output must be a JSON object');
  const allowed = new Set(['phase', 'firebaseInitialization', 'reads', 'writes', 'identity', 'expectedCounts', 'planDigest', 'namespaceDigest', 'audit', 'canonicalReceipt', 'canonicalDigest']);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`unexpected preflight output field: ${unexpected[0]}`);
  if (value.phase !== 'g8-4br3a-firebase-free-preflight') throw new Error('unexpected preflight phase');
  if (value.firebaseInitialization !== false) throw new Error('canonical preflight requires Firebase initialization false');
  if (value.reads !== 0 || value.writes !== 0) throw new Error('canonical preflight requires zero reads and writes');
  if (!isRecord(value.identity) || typeof value.identity.activationImplementationCommit !== 'string' || typeof value.identity.stateAuditImplementationCommit !== 'string') throw new Error('missing preflight implementation identity');
  if (!isRecord(value.expectedCounts)) throw new Error('missing preflight expected counts');
  for (const key of ['races', 'measures', 'candidateResearch', 'measureResearch', 'metrics', 'contentDocuments', 'totalBundleDocuments', 'selectorsExcluded']) {
    const count = value.expectedCounts[key];
    if (!Number.isSafeInteger(count) || (count as number) < 0) throw new Error(`invalid preflight expected count: ${key}`);
  }
  if (typeof value.planDigest !== 'string' || typeof value.namespaceDigest !== 'string') throw new Error('missing preflight digest');
  if (!isRecord(value.audit) || typeof value.audit.executable !== 'string' || typeof value.audit.cwd !== 'string' || !Array.isArray(value.audit.arguments) || value.audit.arguments.some((argument) => typeof argument !== 'string')) throw new Error('invalid preflight audit invocation');
}

function parseOrderedStateAuditFlags(arguments_: readonly string[]) {
  if (arguments_.length !== 51) throw new Error('canonical preflight requires exactly 51 ordered arguments');
  const values = {} as Record<StateAuditFlag, string>;
  for (let index = 0; index < STATE_AUDIT_ORDERED_VALUE_FLAGS.length; index += 1) {
    const offset = 3 + index * 2;
    const expectedFlag = STATE_AUDIT_ORDERED_VALUE_FLAGS[index];
    if (arguments_[offset] !== expectedFlag) throw new Error(`canonical preflight ordered flag mismatch at argument ${offset}: expected ${expectedFlag}`);
    const value = arguments_[offset + 1];
    if (!value || value.startsWith('--')) throw new Error(`canonical preflight missing value for ${expectedFlag}`);
    values[expectedFlag] = value;
  }
  return values;
}

function parseCount(value: string, flagName: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || String(parsed) !== value) throw new Error(`invalid canonical preflight count for ${flagName}`);
  return parsed;
}

/** Maps preflight JSON to the only bytes that carry authorization-relevant
 * meaning. Presentation bytes (wrapper banners, indentation, encoding marks,
 * line endings, and trailing whitespace) never enter this receipt. */
export function buildG8V2StateAuditPreflightReceipt(outputValue: unknown) {
  assertPreflightOutput(outputValue);
  const output = outputValue;
  const expectedTsxCli = require.resolve('tsx/cli');
  if (output.audit.executable !== process.execPath) throw new Error('canonical preflight requires the direct process executable');
  if (output.audit.cwd !== process.cwd() || !isAbsolute(output.audit.cwd)) throw new Error('canonical preflight requires the direct absolute working directory');
  if (output.audit.arguments[0] !== expectedTsxCli || !isAbsolute(output.audit.arguments[0])) throw new Error('canonical preflight requires the repository-resolved tsx CLI');
  if (output.audit.arguments[1] !== STATE_AUDIT_SCRIPT || output.audit.arguments[2] !== '--audit') throw new Error('canonical preflight requires the bounded state-audit script in audit mode');
  const values = parseOrderedStateAuditFlags(output.audit.arguments);
  const commitPattern = /^[a-f0-9]{40}$/;
  for (const identity of [values['--expected-shadow-source-commit'], values['--expected-activation-implementation-commit'], values['--expected-state-audit-implementation-commit']]) {
    if (!commitPattern.test(identity)) throw new Error('invalid canonical preflight implementation identity');
  }
  if (output.identity.activationImplementationCommit !== values['--expected-activation-implementation-commit'] || output.identity.stateAuditImplementationCommit !== values['--expected-state-audit-implementation-commit']) throw new Error('preflight implementation identity does not match ordered arguments');
  const digestFlags = ['--expected-input-digest', '--expected-evidence-digest', '--expected-plan-digest', '--expected-bundle-digest', '--expected-namespace-digest'] as const;
  if (digestFlags.some((name) => !/^[a-f0-9]{64}$/.test(values[name])) || !/^[a-f0-9]{64}$/.test(output.planDigest) || !/^[a-f0-9]{64}$/.test(output.namespaceDigest)) throw new Error('invalid canonical preflight certified digest');
  if (output.namespaceDigest !== values['--expected-namespace-digest']) throw new Error('preflight namespace digest does not match ordered arguments');
  const flagCounts = {
    races: parseCount(values['--expected-races'], '--expected-races'),
    measures: parseCount(values['--expected-measures'], '--expected-measures'),
    candidateResearch: parseCount(values['--expected-candidate-research'], '--expected-candidate-research'),
    measureResearch: parseCount(values['--expected-measure-research'], '--expected-measure-research'),
    metrics: parseCount(values['--expected-metrics'], '--expected-metrics'),
    contentDocuments: parseCount(values['--expected-content-documents'], '--expected-content-documents'),
  };
  for (const [key, count] of Object.entries(flagCounts)) {
    if (output.expectedCounts[key as keyof typeof flagCounts] !== count) throw new Error(`preflight expected count does not match ordered arguments: ${key}`);
  }
  const contentSum = flagCounts.races + flagCounts.measures + flagCounts.candidateResearch + flagCounts.measureResearch + flagCounts.metrics;
  if (flagCounts.contentDocuments !== 3352 || contentSum !== 3352 || output.expectedCounts.totalBundleDocuments !== 3353 || output.expectedCounts.selectorsExcluded !== 1) throw new Error('canonical preflight requires the exact 3,352 content documents and one excluded selector');
  const receipts = {
    shadowVerification: values['--shadow-verification-receipt'],
    promotion: values['--promotion-receipt'],
    activation: values['--activation-receipt'],
    rollback: values['--rollback-receipt'],
    audit: values['--audit-receipt'],
  };
  if (Object.values(receipts).some((receipt) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(receipt)) || new Set(Object.values(receipts)).size !== 5) throw new Error('canonical preflight requires five valid unique receipts');
  const receipt: G8V2StateAuditPreflightReceipt = {
    contract: G8_V2_STATE_AUDIT_PREFLIGHT_CONTRACT,
    phase: output.phase,
    resultContract: G8_V2_STATE_AUDIT_RESULT_CONTRACT,
    target: { projectId: values['--project-id'], databaseId: values['--database-id'], generation: values['--generation'] },
    inputs: { bundlePath: values['--bundle-in'], manifestPath: values['--manifest'] },
    launcher: {
      contract: 'direct-node-tsx/v1', executable: output.audit.executable, cwd: output.audit.cwd,
      tsxCliPath: output.audit.arguments[0], scriptPath: STATE_AUDIT_SCRIPT, mode: '--audit', shell: false,
      argumentCount: 51, arguments: [...output.audit.arguments], argumentsDigest: canonicalDigest(output.audit.arguments),
    },
    implementationIdentities: {
      shadowSourceCommit: values['--expected-shadow-source-commit'],
      activationImplementationCommit: output.identity.activationImplementationCommit,
      stateAuditImplementationCommit: output.identity.stateAuditImplementationCommit,
    },
    receipts: { ...receipts, count: 5, uniqueCount: 5 },
    expectedCounts: { ...output.expectedCounts },
    certifiedDigests: {
      input: values['--expected-input-digest'], evidence: values['--expected-evidence-digest'], releasePlan: values['--expected-plan-digest'],
      bundle: values['--expected-bundle-digest'], namespace: output.namespaceDigest, activationPlan: output.planDigest,
    },
    safety: { firebaseInitialization: false, reads: 0, writes: 0 },
  };
  return { receipt, digest: canonicalDigest(receipt) };
}

/** Extracts a UTF-8 JSON document from direct output or presentation wrappers,
 * then recomputes and validates the semantic receipt and digest. */
export function parseG8V2StateAuditPreflightOutput(raw: string | Uint8Array) {
  const text = typeof raw === 'string' ? raw : new TextDecoder('utf-8', { fatal: true }).decode(raw);
  const withoutBom = text.replace(/^\uFEFF/, '');
  const jsonStart = withoutBom.indexOf('{');
  if (jsonStart < 0) throw new Error('preflight output does not contain JSON');
  let value: unknown;
  try {
    value = JSON.parse(withoutBom.slice(jsonStart).trim()) as unknown;
  } catch {
    throw new Error('preflight output contains malformed JSON');
  }
  const canonical = buildG8V2StateAuditPreflightReceipt(value);
  const embedded = value as G8V2StateAuditPreflightOutput;
  if (embedded.canonicalReceipt !== undefined && canonicalJson(embedded.canonicalReceipt) !== canonicalJson(canonical.receipt)) throw new Error('embedded canonical receipt does not match semantic preflight output');
  if (embedded.canonicalDigest !== undefined && embedded.canonicalDigest !== canonical.digest) throw new Error('embedded canonical digest does not match semantic preflight output');
  return { output: embedded, ...canonical };
}

/** Builds a shell-free Node/tsx invocation. Every token remains a distinct
 * argument, including executable and script paths containing spaces. */
export function buildG8V2DirectNodeTsxInvocation(
  scriptPath: string,
  scriptArguments: readonly string[],
  runtime: { executable?: string; tsxCliPath?: string; cwd?: string } = {},
): G8V2DirectNodeTsxInvocation {
  const executable = runtime.executable ?? process.execPath;
  const tsxCliPath = runtime.tsxCliPath ?? require.resolve('tsx/cli');
  const cwd = runtime.cwd ?? process.cwd();
  if (!isAbsolute(executable) || !isAbsolute(tsxCliPath) || !isAbsolute(cwd)) throw new Error('direct Node/tsx launcher paths must be absolute');
  if (!scriptPath.trim() || scriptArguments.some((argument) => typeof argument !== 'string')) throw new Error('direct Node/tsx launcher requires an argument array');
  return { executable, arguments: [tsxCliPath, scriptPath, ...scriptArguments], cwd };
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return error ? 'UNKNOWN' : null;
  return typeof error.code === 'string' ? error.code : 'UNKNOWN';
}

/** Starts exactly one child and never retries. Raw output is returned to the
 * caller, while evidence is deliberately limited to presence/status fields. */
export function launchG8V2JsonChild(
  invocation: G8V2DirectNodeTsxInvocation,
  options: { env?: NodeJS.ProcessEnv; spawn?: Spawn } = {},
): G8V2JsonChildLaunchResult {
  const spawn: Spawn = options.spawn ?? ((executable, arguments_, spawnOptions) => spawnSync(executable, [...arguments_], spawnOptions));
  let child: SpawnSyncReturns<string>;
  try {
    child = spawn(invocation.executable, invocation.arguments, { cwd: invocation.cwd, encoding: 'utf8', env: options.env ?? process.env, windowsHide: true, shell: false });
  } catch (error) {
    const evidence: G8V2JsonChildLaunchEvidence = {
      childStarted: false, childExited: false, childExitStatus: null, childSignal: null,
      errorCode: errorCode(error), stdoutPresent: false, stderrPresent: false,
      outputStatus: 'not-applicable', argumentCount: invocation.arguments.length,
      invocationAccounting: { attempted: 1, started: 0, exited: 0 },
    };
    return { invocation, evidence, stdout: '', stderr: '', result: null, launcherExitStatus: 1 };
  }
  const stdout = typeof child.stdout === 'string' ? child.stdout : '';
  const stderr = typeof child.stderr === 'string' ? child.stderr : '';
  const childStarted = Number.isInteger(child.pid) && child.pid > 0;
  const childExited = childStarted && (child.status !== null || child.signal !== null);
  let outputStatus: G8V2JsonChildLaunchEvidence['outputStatus'] = childStarted ? 'missing-json' : 'not-applicable';
  let result: unknown | null = null;
  if (childStarted && stdout.trim()) {
    try {
      result = JSON.parse(stdout.trim()) as unknown;
      outputStatus = 'valid-json';
    } catch {
      outputStatus = 'malformed-json';
    }
  }
  const evidence: G8V2JsonChildLaunchEvidence = {
    childStarted,
    childExited,
    childExitStatus: child.status,
    childSignal: child.signal,
    errorCode: errorCode(child.error),
    stdoutPresent: Boolean(stdout.trim()),
    stderrPresent: Boolean(stderr.trim()),
    outputStatus,
    argumentCount: invocation.arguments.length,
    invocationAccounting: { attempted: 1, started: childStarted ? 1 : 0, exited: childExited ? 1 : 0 },
  };
  const childExit = childStarted && child.status !== null ? child.status : 1;
  const launcherExitStatus = childExit === 0 && outputStatus !== 'valid-json' ? 1 : childExit;
  return { invocation, evidence, stdout, stderr, result, launcherExitStatus };
}

/** Builds the complete production audit command from certified local inputs;
 * it does not import Firebase or execute a command. */
export function buildG8V2StateAuditProductionArguments(options: G8V2StateAuditPreflightOptions): G8V2StateAuditProductionArguments {
  if (options.shadowSourceCommit !== CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT) throw new Error('state audit shadow source commit is not certified');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(options.auditReceipt)) throw new Error('invalid state audit receipt');
  const bundle = validateLocalProductBundle(readJson(options.bundlePath));
  const manifest = readJson(options.manifestPath);
  const shadowPlan = buildG8ProductShadowWritePlan(bundle, options.shadowSourceCommit);
  const plan = buildG8V2ActivationPlan(shadowPlan, options.activationReceipts, { identitySchemaVersion: 2, shadowSourceCommit: options.shadowSourceCommit, activationImplementationCommit: options.activationImplementationCommit });
  assertCommittedG8V2Implementation({ identitySchemaVersion: 2, shadowSourceCommit: options.shadowSourceCommit, activationImplementationCommit: options.activationImplementationCommit });
  assertCommittedG8V2StateAuditImplementation(options.stateAuditImplementationCommit);
  const common = [
    ...flag('--bundle-in', options.bundlePath), ...flag('--manifest', options.manifestPath),
    ...flag('--project-id', manifest.release.target.projectId), ...flag('--database-id', manifest.release.target.databaseId), ...flag('--generation', manifest.release.generation),
    ...flag('--expected-shadow-source-commit', plan.shadowSourceCommit), ...flag('--expected-activation-implementation-commit', plan.activationImplementationCommit), ...flag('--expected-state-audit-implementation-commit', options.stateAuditImplementationCommit),
    ...flag('--expected-input-digest', manifest.release.expectedDigests.input), ...flag('--expected-evidence-digest', manifest.release.expectedDigests.evidence), ...flag('--expected-plan-digest', manifest.release.expectedDigests.plan), ...flag('--expected-bundle-digest', manifest.release.expectedDigests.bundle), ...flag('--expected-namespace-digest', plan.certifiedDigests.namespace),
    ...flag('--expected-races', plan.expectedCounts.races), ...flag('--expected-measures', plan.expectedCounts.measures), ...flag('--expected-candidate-research', plan.expectedCounts.candidateResearch), ...flag('--expected-measure-research', plan.expectedCounts.measureResearch), ...flag('--expected-metrics', plan.expectedCounts.metrics), ...flag('--expected-content-documents', plan.expectedCounts.contentDocuments),
    ...flag('--shadow-verification-receipt', options.activationReceipts.shadowVerification), ...flag('--promotion-receipt', options.activationReceipts.promotion), ...flag('--activation-receipt', options.activationReceipts.activation), ...flag('--rollback-receipt', options.activationReceipts.rollback), ...flag('--audit-receipt', options.auditReceipt),
  ];
  return { audit: buildG8V2DirectNodeTsxInvocation(STATE_AUDIT_SCRIPT, ['--audit', ...common]), identity: { activationImplementationCommit: options.activationImplementationCommit, stateAuditImplementationCommit: options.stateAuditImplementationCommit }, expectedCounts: plan.expectedCounts, planDigest: plan.planDigest, namespaceDigest: plan.certifiedDigests.namespace };
}
