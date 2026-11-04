import { readFileSync, openSync, closeSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { CaptureQueue, type Task } from './lib/ea2026Capture.js';

// Public-source reads only. No Firebase or credential loading.
const args = process.argv.slice(2);
const option = (key: string) => {
  const at = args.indexOf(key);
  if (at === -1) return undefined;
  if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(`missing ${key} value`);
  return args[at + 1];
};
const out = option('--out'), state = option('--state'), url = option('--url'), purpose = option('--purpose');
if (!out || (!state && !url && !purpose)) throw new Error('--out and explicit selection required');
const maximum = Number(option('--max') ?? '25');
if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100) throw new Error('--max must be 1..100');
const registry = JSON.parse(readFileSync(resolve('data/2026/state-election-source-registry.json'), 'utf8'));
const tasks: Task[] = registry.states.flatMap((s: any) => [...new Set<string>([s.authorityUrl, s.candidateListUrl, s.governorRaceUrl, s.statewideMeasureUrl, ...s.evidenceUrls].filter(Boolean))].map(url => ({ state: s.state, url, purpose: 'discovery_only' })));
tasks.push({ state: 'CA', url: 'https://elections.cdn.sos.ca.gov/statewide-elections/2026-general/cert-list-candidates.pdf', purpose: 'candidate_list_to_review' });
tasks.push({ state: 'US', url: 'https://www.usa.gov/state-election-office', purpose: 'authority_directory' });
tasks.push({ state: 'US', url: 'https://www.fec.gov/files/bulk-downloads/2026/weball26.zip', purpose: 'finance_not_ballot_eligibility' });
if (url) {
  if (!state || !purpose) throw new Error('custom --url requires --state and --purpose');
  tasks.push({ state, url, purpose });
}
const taskFile = option('--tasks');
if (taskFile) {
  const selected = JSON.parse(readFileSync(resolve(taskFile), 'utf8'));
  if (!Array.isArray(selected) || selected.some(x => typeof x.state !== 'string' || typeof x.url !== 'string' || typeof x.purpose !== 'string')) throw new Error('invalid task file');
  tasks.push(...selected);
}
const directory = resolve(out);
const execution = resolve('.artifacts/private/canonical-migration/ea-2026-execution');
mkdirSync(execution, { recursive: true });
const lockPath = join(execution, 'capture-operator.lock');
const lock = openSync(lockPath, 'wx');
try {
  const queue = new CaptureQueue(directory, resolve(option('--ledger') ?? join(execution, 'requests.jsonl')));
  queue.add(tasks);
  const reuse = option('--reuse');
  if (reuse) console.log(JSON.stringify({ reused: queue.reuse(resolve(reuse)) }));
  if (args.includes('--refresh')) {
    if (!url) throw new Error('--refresh requires one explicit --url');
    queue.refresh(url);
  }
  if (!args.includes('--offline')) console.log(JSON.stringify(await queue.run(entry => (!url || entry.url === new URL(url).href.split('#')[0]) && entry.uses.some(use => (!state || use.state === state) && (!purpose || use.purpose === purpose)), maximum, args.includes('--paced'))));
  else console.log(JSON.stringify({ queued: Object.keys(queue.state.entries).length, networkRequests: 0 }));
} finally { closeSync(lock); unlinkSync(lockPath); }
