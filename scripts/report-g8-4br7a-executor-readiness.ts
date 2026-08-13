import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { canonicalJson, loadG8V2ExecutorReadinessInputs, verifyG8V2ExecutorReadiness } from './lib/g8V2ExecutorReadinessReview.js';

const privateRoot = resolve('.artifacts/private/canonical-migration');
const args = process.argv.slice(2);
let replayReceipt: string | null = null;
if (args.length > 0) {
  if (args.length !== 2 || args[0] !== '--verify-replay') throw new Error('BR7A_ARGUMENT_MISMATCH');
  replayReceipt = resolve(args[1]);
  const rel = relative(privateRoot, replayReceipt);
  if (!rel || rel.startsWith('..') || !replayReceipt.endsWith('.json')) throw new Error('BR7A_REPLAY_RECEIPT_NOT_PRIVATE');
}

const receipt = verifyG8V2ExecutorReadiness(loadG8V2ExecutorReadinessInputs());
if (replayReceipt) {
  const previous = JSON.parse(readFileSync(replayReceipt, 'utf8')) as unknown;
  if (canonicalJson(previous) !== canonicalJson(receipt)) throw new Error('BR7A_REPLAY_RECEIPT_DRIFT');
}
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
