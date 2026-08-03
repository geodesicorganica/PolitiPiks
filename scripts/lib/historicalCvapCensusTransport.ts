import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type DotenvConfig = (options: { path: string; override: boolean; quiet: boolean }) => unknown;
export type CensusKeyStatus = { present: boolean; source: 'shell' | 'dotenv' | 'absent' };

/** Loads only the root .env.local with shell precedence and never returns its value. */
export function loadCensusApiKey(options: { env?: Record<string, string | undefined>; cwd?: string; exists?: (path: string) => boolean; config?: DotenvConfig } = {}): CensusKeyStatus {
  const env = options.env ?? process.env; const cwd = options.cwd ?? process.cwd(); const exists = options.exists ?? existsSync; const config = options.config ?? ((input) => dotenv.config(input));
  const shellValue = env.CENSUS_API_KEY; const path = resolve(cwd, '.env.local'); if (exists(path)) config({ path, override: false, quiet: true }); const loaded = env.CENSUS_API_KEY;
  return { present: typeof loaded === 'string' && loaded.trim().length > 0, source: typeof shellValue === 'string' && shellValue.trim().length > 0 ? 'shell' : typeof loaded === 'string' && loaded.trim().length > 0 ? 'dotenv' : 'absent' };
}
export function censusTransportUrl(canonicalSourceUrl: string, apiKey: string): string {
  const source = new URL(canonicalSourceUrl); if (source.protocol !== 'https:' || source.hostname !== 'api.census.gov' || source.searchParams.has('key')) throw new Error('invalid keyless Census source URL'); const key = apiKey.trim(); if (!key) throw new Error('CENSUS_API_KEY is required before Census network access'); source.searchParams.set('key', key); return source.toString();
}
export function sanitizeCensusLocation(value: string | null): string | null { if (!value) return null; try { const url = new URL(value); url.username = ''; url.password = ''; url.hash = ''; url.searchParams.delete('key'); url.searchParams.delete('api_key'); url.searchParams.delete('token'); return url.toString(); } catch { return '[invalid-location]'; } }
