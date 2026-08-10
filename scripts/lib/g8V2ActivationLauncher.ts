import { malformedG8V2StructuredActivationResult, parseG8V2StructuredActivationResult, type G8V2StructuredActivationResult } from './g8V2ActivationResult.js';
import { launchG8V2JsonChild, type G8V2DirectNodeTsxInvocation, type G8V2JsonChildLaunchEvidence } from './g8V2StateAuditPreflight.js';

type Spawn = Parameters<typeof launchG8V2JsonChild>[1] extends { spawn?: infer T } ? T : never;

export type G8V2ActivationLaunchResult = {
  invocation: G8V2DirectNodeTsxInvocation;
  evidence: G8V2JsonChildLaunchEvidence;
  result: G8V2StructuredActivationResult;
  launcherExitStatus: number;
};

/** Invokes exactly one direct Node/tsx activation child. Raw stdout/stderr are
 * deliberately discarded so credentials, document bodies, stacks, and
 * unbounded errors can never enter durable launcher evidence. */
export function launchG8V2StructuredActivationChild(
  invocation: G8V2DirectNodeTsxInvocation,
  options: { env?: NodeJS.ProcessEnv; spawn?: Spawn } = {},
): G8V2ActivationLaunchResult {
  const launched = launchG8V2JsonChild(invocation, options as Parameters<typeof launchG8V2JsonChild>[1]);
  let result = malformedG8V2StructuredActivationResult();
  let evidence = launched.evidence;
  let launcherExitStatus = launched.launcherExitStatus;
  if (launched.evidence.outputStatus === 'valid-json') {
    try {
      result = parseG8V2StructuredActivationResult(launched.stdout);
      if (result.status === 'failed' && launcherExitStatus === 0) launcherExitStatus = 1;
    }
    catch { evidence = { ...evidence, outputStatus: 'malformed-json' }; launcherExitStatus = 1; }
  }
  return { invocation, evidence, result, launcherExitStatus };
}
