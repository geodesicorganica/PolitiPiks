import assert from 'node:assert/strict';
import { parseBulkFinanceArgs } from './fecBulkFinanceCaptureCli.js';

const root = 'C:/Projects/Politipiks';
const source = '.artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json';
const archive = '.artifacts/private/canonical-migration/g6-2-weball26.zip';
const output = '.artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json';
const archiveInput = parseBulkFinanceArgs(['--snapshot-in', source, '--archive-in', archive, '--snapshot-out', output], { cwd: root, exists: () => false });
assert.equal(archiveInput.archiveIn?.replace(/\\/g, '/'), `${root}/.artifacts/private/canonical-migration/g6-2-weball26.zip`);
assert.equal(archiveInput.archiveOut, undefined, 'archive-input normalization cannot select download mode');
assert.equal(archiveInput.snapshotOut?.replace(/\\/g, '/'), `${root}/.artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json`);
const replay = parseBulkFinanceArgs(['--snapshot-in', output, '--publication-snapshot', source, '--verify-replay'], { cwd: root, exists: () => false });
assert.equal(replay.publicationSnapshot?.replace(/\\/g, '/'), `${root}/.artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json`, 'replay requires an explicit publication snapshot');
assert.throws(() => parseBulkFinanceArgs(['--snapshot-in', source, '--archive-in', archive, '--archive-out', archive, '--snapshot-out', output], { cwd: root, exists: () => false }), /mutually exclusive/);
assert.throws(() => parseBulkFinanceArgs(['--snapshot-in', source, '--archive-in', archive, '--snapshot-out', output], { cwd: root, exists: (path) => path.endsWith('g6-2-fec-bulk-finance.json') }), /refusing overwrite/, 'no-clobber output behavior is enforced');
assert.throws(() => parseBulkFinanceArgs(['--snapshot-in', '../public.json', '--archive-in', archive, '--snapshot-out', output], { cwd: root, exists: () => false }), /private/, 'unsafe paths fail closed');
console.log('FEC bulk finance capture CLI tests passed');
