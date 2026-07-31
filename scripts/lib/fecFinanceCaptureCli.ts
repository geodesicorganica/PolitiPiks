import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type Env = Record<string, string | undefined>;
type DotenvConfig = (options: { path: string; override: boolean; quiet: boolean }) => unknown;
export type FecKeyStatus = { present: boolean; source: 'shell' | 'dotenv' | 'absent' };

/** Loads the root dotenv file with shell precedence. It never returns the secret. */
export function loadFecApiKey(options: { env?: Env; cwd?: string; exists?: (path: string) => boolean; config?: DotenvConfig } = {}): FecKeyStatus {
  const env = options.env ?? process.env; const cwd = options.cwd ?? process.cwd(); const exists = options.exists ?? existsSync; const config = options.config ?? ((input) => dotenv.config(input));
  const shellValue = env.FEC_API_KEY; const path = resolve(cwd, '.env.local');
  if (exists(path)) config({ path, override: false, quiet: true });
  const value = env.FEC_API_KEY;
  return { present: typeof value === 'string' && value.trim().length > 0, source: typeof shellValue === 'string' && shellValue.trim().length > 0 ? 'shell' : typeof value === 'string' && value.trim().length > 0 ? 'dotenv' : 'absent' };
}
export function buildFecFinancePreflight(input: { sourceSnapshotInputDigest: string; state: string; candidateCount: number; maxCalls: number; outputPath: string; outputExists: boolean; ignored: boolean; key: FecKeyStatus }) {
  if (!/^[a-f0-9]{64}$/.test(input.sourceSnapshotInputDigest) || !/^[A-Z]{2}$/.test(input.state) || !Number.isInteger(input.candidateCount) || input.candidateCount < 0 || !Number.isInteger(input.maxCalls) || input.maxCalls <= 0 || input.candidateCount * 2 > input.maxCalls) throw new Error('invalid FEC finance preflight');
  return { operation: 'fec-finance-preflight', dryRun: true, firebaseInitialized: false, FEC_API_KEY_PRESENT: input.key.present, state: input.state, canonicalCandidates: input.candidateCount, plannedMaximumCalls: input.candidateCount * 2, maxCalls: input.maxCalls, sourceSnapshotInputDigest: input.sourceSnapshotInputDigest, outputPathPrivate: true, outputPathIgnored: input.ignored, outputPathAbsent: !input.outputExists };
}
