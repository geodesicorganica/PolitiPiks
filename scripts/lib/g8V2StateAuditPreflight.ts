import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { buildG8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, type G8V2AuthorizationReceipts } from './g8V2Activation.js';
import { assertCommittedG8V2Implementation, assertCommittedG8V2StateAuditImplementation } from './g8V2ActivationCli.js';
import { validateLocalProductBundle } from './localProductBundle.js';

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
const flag = (name: string, value: string | number) => [name, String(value)];
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as any;

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
