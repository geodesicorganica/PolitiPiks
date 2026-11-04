import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assessRelease, buildEaRelease } from './lib/ea2026Release.js';
import { verifyEaSourceCaptures } from './lib/ea2026SourceEvidence.js';

const args = process.argv.slice(2);
const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const inputPath = option('--input');
if (!inputPath) throw new Error('--input required');
const input = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
const assessment = assessRelease(input);
if (args.includes('--assess')) {
  const { input: _, sources: __, ...report } = assessment;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = assessment.releaseReady ? 0 : 2;
} else {
  const out = option('--out'), captures = option('--captures');
  if (!out || !captures) throw new Error('--out and --captures required; source bytes must be verified');
  verifyEaSourceCaptures([...assessment.sources.values()], captures);
  const bundle = buildEaRelease(input);
  writeFileSync(resolve(out), `${JSON.stringify(bundle, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ releaseId: bundle.releaseId, counts: bundle.counts, digest: bundle.digest, productionOperations: 0 }));
}
