import { existsSync, readFileSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { validateLocalProductBundle } from './lib/localProductBundle.js';
import { validateG8ReleaseManifest } from './lib/g8ReleaseReadiness.js';

const defaultBundle = '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json';
const defaultManifest = 'docs/g8-catalog-beta-release-manifest.json';

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] ?? (() => { throw new Error(`${name} requires a value`); })();
}

for (const flag of process.argv.slice(2).filter((value) => value.startsWith('--'))) {
  if (!['--bundle', '--manifest'].includes(flag)) throw new Error(`unsupported ${flag}`);
}

const bundlePath = resolve(argument('--bundle', defaultBundle));
const privateRoot = resolve('.artifacts/private/canonical-migration') + sep;
if (!bundlePath.startsWith(privateRoot) || basename(bundlePath) !== 'g7-1-local-product-bundle.json') throw new Error('bundle must be the certified private G7.1 artifact');
const manifestPath = resolve(argument('--manifest', defaultManifest));
if (relative(resolve('.'), manifestPath).startsWith('..')) throw new Error('manifest must be inside the repository');
if (!existsSync(bundlePath) || !existsSync(manifestPath)) throw new Error('certified local artifact or manifest is missing');

const bundle = validateLocalProductBundle(JSON.parse(readFileSync(bundlePath, 'utf8')));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
const receipt = validateG8ReleaseManifest(manifest, bundle);
console.log(JSON.stringify(receipt, null, 2));
