import { createG8V2StructuredAuditResult } from './lib/g8V2StateAuditResult.js';

const argv = process.argv.slice(2);
let result;
try {
  const { runG8V2StructuredAudit } = await import('./lib/g8V2StructuredAuditRunner.js');
  result = await runG8V2StructuredAudit(argv);
} catch {
  result = createG8V2StructuredAuditResult();
  result.error = { classification: 'result-contract', code: 'MALFORMED_RESULT' };
  result.phase = 'argument-parsing';
  result.failedPhase = 'argument-parsing';
  result.safeNextAction = 'stop for review; structured result boundary failed closed';
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.status === 'completed' ? 0 : 1);
