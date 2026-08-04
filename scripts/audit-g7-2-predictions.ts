import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCanonicalPublicationSnapshot } from './lib/canonicalPublication.js';
import { validateLocalProductBundle } from './lib/localProductBundle.js';

const args = process.argv.slice(2);
const value = (flag: string, fallback: string) => {
  const index = args.indexOf(flag);
  return index < 0 ? fallback : args[index + 1] || (() => { throw new Error(`missing ${flag}`); })();
};
for (const flag of args.filter((arg) => arg.startsWith('--'))) {
  if (!['--publication-snapshot', '--product-bundle'].includes(flag)) throw new Error(`unsupported ${flag}`);
}
const read = (path: string) => JSON.parse(readFileSync(resolve(path), 'utf8'));
const publication = validateCanonicalPublicationSnapshot(read(value('--publication-snapshot', '.artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json')));
const bundle = validateLocalProductBundle(read(value('--product-bundle', '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json')));
const targets = new Map(bundle.documents.filter((document) => /^races\/[^/]+$|^ballotMeasures\/[^/]+$/.test(document.path)).map((document) => [document.path.split('/')[1], document]));
const seen = new Set<string>();
const duplicates: string[] = [];
const incompatibleReferences: Array<{ predictionId: string; targetId: string; reason: string }> = [];
let historicalOutOfScope = 0;
let live2026Evaluated = 0;
for (const prediction of publication.inputs.predictions) {
  if (seen.has(prediction.id)) duplicates.push(prediction.id);
  seen.add(prediction.id);
  if (!prediction.targetId.startsWith('2026-')) { historicalOutOfScope += 1; continue; }
  live2026Evaluated += 1;
  const target = targets.get(prediction.targetId);
  if (!target) { incompatibleReferences.push({ predictionId: prediction.id, targetId: prediction.targetId, reason: 'target is absent from the certified product bundle' }); continue; }
  const allowed = target.path.startsWith('races/') ? target.data.eligibleCandidateIds : target.data.eligibleOptions;
  const ready = target.data.predictionReady === true;
  if (!ready || !Array.isArray(allowed) || !allowed.includes(prediction.pick)) incompatibleReferences.push({ predictionId: prediction.id, targetId: prediction.targetId, reason: 'stored pick is not eligible under the certified target' });
}
if (duplicates.length > 0) throw new Error(`duplicate prediction IDs: ${duplicates.join(',')}`);
console.log(JSON.stringify({
  operation: 'audit-g7-2-predictions',
  firebaseInitialized: false,
  httpCalls: 0,
  writes: 0,
  bundleDigest: bundle.bundleDigest,
  predictionsScanned: publication.inputs.predictions.length,
  historicalOutOfScope,
  live2026Evaluated,
  incompatibleCount: incompatibleReferences.length,
  incompatibleReferences,
  silentlyRewritten: 0,
}, null, 2));
