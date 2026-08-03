import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildLocalProductBundle } from './lib/localProductBundle.js';

const defaults = {
  publication: '.artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json',
  finance: '.artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json',
  congress: '.artifacts/private/canonical-migration/g6-3-congress-depth-v2.json',
  historical: '.artifacts/private/canonical-migration/g6-4-historical-cvap-depth.json',
  measures: 'data/2026/statewide-ballot-measures.json',
  output: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
};
const args = process.argv.slice(2); const verifyReplay = args.includes('--verify-replay');
const value = (flag: string, fallback: string) => { const index = args.indexOf(flag); return index < 0 ? fallback : args[index + 1] || (() => { throw new Error(`missing ${flag}`); })(); };
for (const flag of args.filter((arg) => arg.startsWith('--'))) if (!['--verify-replay','--publication-snapshot','--finance-snapshot','--congress-snapshot','--historical-snapshot','--measure-registry','--snapshot-out'].includes(flag)) throw new Error(`unsupported ${flag}`);
const output = resolve(value('--snapshot-out', defaults.output));
if (!output.includes(`${resolve('.artifacts/private/canonical-migration')}\\`) && output !== resolve(defaults.output)) throw new Error('snapshot output must stay in the ignored private artifact directory');
const read = (path: string) => JSON.parse(readFileSync(resolve(path), 'utf8'));
const inputs = { publicationValue: read(value('--publication-snapshot', defaults.publication)), financeValue: read(value('--finance-snapshot', defaults.finance)), congressValue: read(value('--congress-snapshot', defaults.congress)), historicalValue: read(value('--historical-snapshot', defaults.historical)), measureRegistryValue: read(value('--measure-registry', defaults.measures)) };
const first = buildLocalProductBundle(inputs); const second = buildLocalProductBundle(inputs);
if (verifyReplay && JSON.stringify(first) !== JSON.stringify(second)) throw new Error('nondeterministic local-product replay');
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(first, null, 2)}\n`, { flag: 'w' });
console.log(JSON.stringify({ operation: 'build-local-product-bundle', firebaseInitialized: false, httpCalls: 0, output, counts: first.counts, readiness: first.readiness, audit: first.audit, inputDigest: first.inputDigest, evidenceDigest: first.evidenceDigest, planDigest: first.planDigest, bundleDigest: first.bundleDigest, replayVerified: verifyReplay }, null, 2));
