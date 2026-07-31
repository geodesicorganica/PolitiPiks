import assert from 'node:assert/strict';
import { buildFecFinancePreflight, loadFecApiKey } from './fecFinanceCaptureCli.js';

const calls: Array<{ path: string; override: boolean; quiet: boolean }> = []; const dotenvEnv: Record<string, string | undefined> = {};
const loaded = loadFecApiKey({ env: dotenvEnv, cwd: 'C:/Projects/Politipiks', exists: () => true, config: ({ path, override, quiet }) => { calls.push({ path: String(path), override: Boolean(override), quiet: Boolean(quiet) }); if (!override) dotenvEnv.FEC_API_KEY = 'dotenv-test-key'; return { parsed: { FEC_API_KEY: 'dotenv-test-key' } }; } });
assert.equal(loaded.present, true, 'dotenv-provided key is accepted when shell is absent'); assert.equal(calls.length, 1); assert.match(calls[0]!.path.replace(/\\/g, '/'), /C:\/Projects\/Politipiks\/.env\.local$/); assert.deepEqual(calls[0], { ...calls[0], override: false, quiet: true }); assert.equal(JSON.stringify(loaded).includes('dotenv-test-key'), false, 'key value is not projected');
const shellEnv = { FEC_API_KEY: 'shell-test-key' }; const shell = loadFecApiKey({ env: shellEnv, cwd: 'C:/Projects/Politipiks', exists: () => true, config: () => { if (!shellEnv.FEC_API_KEY) shellEnv.FEC_API_KEY = 'dotenv-test-key'; return { parsed: { FEC_API_KEY: 'dotenv-test-key' } }; } });
assert.equal(shell.source, 'shell', 'shell key retains precedence'); assert.equal(JSON.stringify(shell).includes('shell-test-key'), false);
const preflight = buildFecFinancePreflight({ sourceSnapshotInputDigest: 'a'.repeat(64), state: 'GA', candidateCount: 100, maxCalls: 300, outputPath: 'C:/Projects/Politipiks/.artifacts/private/canonical-migration/g6-2-ga-fec-finance.json', outputExists: false, ignored: true, key: loaded });
assert.deepEqual(preflight, { operation: 'fec-finance-preflight', dryRun: true, firebaseInitialized: false, FEC_API_KEY_PRESENT: true, state: 'GA', canonicalCandidates: 100, plannedMaximumCalls: 200, maxCalls: 300, sourceSnapshotInputDigest: 'a'.repeat(64), outputPathPrivate: true, outputPathIgnored: true, outputPathAbsent: true });
assert.equal(JSON.stringify(preflight).includes('test-key'), false, 'preflight never exposes the key');
console.log('FEC finance capture CLI tests passed');
