export type G8V2ConflictOfflineStep = {
  label: string;
  verifyReplay: boolean;
};

export type G8V2ConflictOfflineChildResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
  errorCode: string | null;
  stdout: Buffer;
  stderr: Buffer;
};

export function runG8V2ConflictOfflineSteps(
  steps: readonly G8V2ConflictOfflineStep[],
  invoke: (step: G8V2ConflictOfflineStep) => G8V2ConflictOfflineChildResult,
  validate: (step: G8V2ConflictOfflineStep, result: G8V2ConflictOfflineChildResult) => void,
) {
  const results: Array<{ step: G8V2ConflictOfflineStep; child: G8V2ConflictOfflineChildResult }> = [];
  for (const step of steps) {
    const child = invoke(step);
    results.push({ step, child });
    if (child.status !== 0) return { status: 'failed' as const, results };
    validate(step, child);
  }
  return { status: 'completed' as const, results };
}
