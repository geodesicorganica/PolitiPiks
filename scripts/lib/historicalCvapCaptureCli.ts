import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export type HistoricalCvapOptions = { publicationSnapshot: string; financeSnapshot: string; congressSnapshot: string; checkpointDir?: string; snapshotOut?: string; snapshotIn?: string; preflight: boolean; diagnostic: boolean; resume: boolean; verifyReplay: boolean; maxCalls: number };
type Dependencies = { cwd?: string; exists?: (path: string) => boolean };

export function parseHistoricalCvapArgs(argv: string[], dependencies: Dependencies = {}): HistoricalCvapOptions {
  const cwd = dependencies.cwd ?? process.cwd(); const exists = dependencies.exists ?? existsSync;
  const root = resolve(cwd, '.artifacts', 'private', 'canonical-migration');
  const privatePath = (value: string, flag: string, extension?: string) => { const path = resolve(cwd, value); const rel = relative(root, path); if (!rel || rel.startsWith('..') || (extension && !path.endsWith(extension))) throw new Error(`${flag} must be a private canonical-migration artifact`); return path; };
  const options: Partial<HistoricalCvapOptions> = { preflight: false, diagnostic: false, resume: false, verifyReplay: false, maxCalls: 60 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;
    if (flag === '--preflight' || flag === '--diagnostic' || flag === '--resume' || flag === '--verify-replay') { const key = flag === '--preflight' ? 'preflight' : flag === '--diagnostic' ? 'diagnostic' : flag === '--resume' ? 'resume' : 'verifyReplay'; if (options[key]) throw new Error(`duplicate ${flag}`); options[key] = true; continue; }
    if (!['--publication-snapshot','--finance-snapshot','--congress-snapshot','--checkpoint-dir','--snapshot-out','--snapshot-in','--max-calls'].includes(flag)) throw new Error(`unsupported ${flag}`);
    const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error(`missing ${flag}`);
    if (flag === '--max-calls') { const max = Number(value); if (!Number.isInteger(max) || max < 1 || max > 60) throw new Error('--max-calls must be an integer between 1 and 60'); options.maxCalls = max; continue; }
    const key = flag === '--publication-snapshot' ? 'publicationSnapshot' : flag === '--finance-snapshot' ? 'financeSnapshot' : flag === '--congress-snapshot' ? 'congressSnapshot' : flag === '--checkpoint-dir' ? 'checkpointDir' : flag === '--snapshot-out' ? 'snapshotOut' : 'snapshotIn';
    if (options[key]) throw new Error(`duplicate ${flag}`); options[key] = privatePath(value, flag, key === 'checkpointDir' ? undefined : '.json') as never;
  }
  for (const key of ['publicationSnapshot','financeSnapshot','congressSnapshot'] as const) if (!options[key]) throw new Error(`requires --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  if (options.snapshotIn) { if (options.preflight || options.diagnostic || options.resume || options.checkpointDir || options.snapshotOut) throw new Error('--snapshot-in is offline replay only'); }
  else { if (!options.checkpointDir || !options.snapshotOut) throw new Error('capture and preflight require --checkpoint-dir and --snapshot-out'); if (exists(options.snapshotOut)) throw new Error('snapshot output already exists; refusing overwrite'); }
  return options as HistoricalCvapOptions;
}
