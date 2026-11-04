import { readFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { CaptureQueue, sha256 } from './lib/ea2026Capture.js';
import { assessRelease } from './lib/ea2026Release.js';
import { verifyEaSourceCaptures } from './lib/ea2026SourceEvidence.js';
const args = process.argv.slice(2);
const option = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const inputPath = option('--input'), captures = option('--captures');
if (!inputPath || !captures) throw new Error('--input and --captures required');
const bytes = readFileSync(resolve(inputPath)), report = assessRelease(JSON.parse(bytes.toString('utf8')));
verifyEaSourceCaptures(report.input.sources, resolve(captures));
const execution = resolve('.artifacts/private/canonical-migration/ea-2026-execution');
const lockPath = join(execution, 'capture-operator.lock'), lock = openSync(lockPath, 'wx');
try {
  const queue = new CaptureQueue(resolve(captures), join(execution, 'requests.jsonl'));
  let recorded = 0; const pending: string[] = [];
  for (const source of report.input.sources) {
    const entry = queue.state.entries[sha256(source.url)];
    if (!entry?.extracted || entry.receipt?.sha256 !== source.sha256) { pending.push(source.id); continue; }
    queue.recordReview(source.url, source.sha256, { reviewer: source.reviewer, locator: source.locator, reviewedAt: source.reviewedAt }, sha256(bytes)); recorded++;
  }
  console.log(JSON.stringify({ recorded, pendingExtractionOrRefresh: pending }));
} finally { closeSync(lock); unlinkSync(lockPath); }
