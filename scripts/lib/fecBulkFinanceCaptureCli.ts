import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export type BulkFinanceOptions = { snapshotIn: string; publicationSnapshot?: string; archiveIn?: string; archiveOut?: string; snapshotOut?: string; preflight: boolean; verifyReplay: boolean };
type Dependencies = { cwd?: string; exists?: (path: string) => boolean };

export function parseBulkFinanceArgs(argv: string[], dependencies: Dependencies = {}): BulkFinanceOptions {
  const cwd = dependencies.cwd ?? process.cwd(); const exists = dependencies.exists ?? existsSync;
  const artifactRoot = resolve(cwd, '.artifacts', 'private', 'canonical-migration');
  const privatePath = (value: string, flag: string, extension: '.json' | '.zip'): string => {
    const path = resolve(cwd, value); const pathRelative = relative(artifactRoot, path);
    if (!pathRelative || pathRelative.startsWith('..') || !path.endsWith(extension)) throw new Error(`${flag} must be a private ${extension} artifact`);
    return path;
  };
  const options: Partial<BulkFinanceOptions> = { preflight: false, verifyReplay: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    if (flag === '--preflight' || flag === '--verify-replay') { const key = flag === '--preflight' ? 'preflight' : 'verifyReplay'; if (options[key]) throw new Error(`duplicate ${flag}`); options[key] = true; continue; }
    if (!['--snapshot-in', '--publication-snapshot', '--archive-in', '--archive-out', '--snapshot-out'].includes(flag)) throw new Error(`unsupported ${flag}`);
    const value = argv[++index]; if (!value || value.startsWith('--')) throw new Error(`missing ${flag}`);
    const key = flag === '--snapshot-in' ? 'snapshotIn' : flag === '--publication-snapshot' ? 'publicationSnapshot' : flag === '--archive-in' ? 'archiveIn' : flag === '--archive-out' ? 'archiveOut' : 'snapshotOut';
    if (options[key]) throw new Error(`duplicate ${flag}`);
    options[key] = privatePath(value, flag, key.includes('archive') ? '.zip' : '.json') as never;
  }
  if (!options.snapshotIn) throw new Error('requires --snapshot-in');
  if (options.archiveIn && options.archiveOut) throw new Error('--archive-in and --archive-out are mutually exclusive');
  if (options.publicationSnapshot && (options.archiveIn || options.archiveOut || options.snapshotOut)) throw new Error('--publication-snapshot is replay-only');
  if (!options.preflight && !options.publicationSnapshot && !options.snapshotOut) throw new Error('normalization requires --snapshot-out');
  if (!options.preflight && !options.publicationSnapshot && !options.archiveIn && !options.archiveOut) throw new Error('normalization requires --archive-in or --archive-out');
  for (const output of [options.archiveOut, options.snapshotOut]) if (output && exists(output)) throw new Error('output already exists; refusing overwrite');
  return options as BulkFinanceOptions;
}
