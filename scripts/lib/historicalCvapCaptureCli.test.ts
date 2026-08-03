import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseHistoricalCvapArgs } from './historicalCvapCaptureCli.js';
import { validateHistoricalCvapCheckpoint } from './historicalCvapDepth.js';
const cwd = 'C:/Projects/Politipiks';
const base = ['--publication-snapshot','.artifacts/private/canonical-migration/publication.json','--finance-snapshot','.artifacts/private/canonical-migration/finance.json','--congress-snapshot','.artifacts/private/canonical-migration/congress.json'];
const capture = parseHistoricalCvapArgs([...base, '--checkpoint-dir','.artifacts/private/canonical-migration/g6-4-checkpoints','--snapshot-out','.artifacts/private/canonical-migration/g6-4.json','--preflight'], { cwd, exists: () => false });
assert.equal(capture.maxCalls, 60); assert.equal(capture.preflight, true);
const replay = parseHistoricalCvapArgs([...base, '--snapshot-in','.artifacts/private/canonical-migration/g6-4.json','--verify-replay'], { cwd, exists: () => false });
assert.ok(replay.snapshotIn); assert.throws(() => parseHistoricalCvapArgs([...base, '--snapshot-in','outside.json'], { cwd, exists: () => false }), /private/);
assert.equal(parseHistoricalCvapArgs([...base, '--checkpoint-dir','.artifacts/private/canonical-migration/g6-4-checkpoints','--snapshot-out','.artifacts/private/canonical-migration/g6-4.json','--diagnostic'], { cwd, exists: () => false }).diagnostic, true, 'diagnostic mode is explicit');
assert.throws(() => parseHistoricalCvapArgs([...base, '--checkpoint-dir','.artifacts/private/canonical-migration/x','--snapshot-out','.artifacts/private/canonical-migration/g6-4.json'], { cwd, exists: (path) => path.endsWith('g6-4.json') }), /refusing overwrite/);
assert.throws(() => parseHistoricalCvapArgs([...base, '--snapshot-in','.artifacts/private/canonical-migration/g6-4.json','--checkpoint-dir','.artifacts/private/canonical-migration/x'], { cwd, exists: () => false }), /offline replay/);
assert.throws(() => parseHistoricalCvapArgs([...base, '--checkpoint-dir','.artifacts/private/canonical-migration/x','--snapshot-out','.artifacts/private/canonical-migration/out.json','--max-calls','61'], { cwd, exists: () => false }), /between 1 and 60/, 'G6.4R prevents a larger Census-call budget');
const preserved = `${process.cwd()}/.artifacts/private/canonical-migration/g6-4-historical-cvap-checkpoints`;
const names = readdirSync(preserved)
  .filter((name) => name.endsWith('.json') && !name.startsWith('census-failure-') && !name.startsWith('census-response-'))
  .sort();
const historicalNames = names.filter((name) => !name.startsWith('census-2024-cd-') && !/^census-20(?:20|22|24)-state-cvap\.json$/.test(name));
assert.equal(historicalNames.length, 102, 'the preserved historical source set remains exactly 102 checkpoints');
assert.equal(names.length, 155, 'the complete district and statewide Census sets supplement the preserved historical checkpoints');
for (const name of names) validateHistoricalCvapCheckpoint(JSON.parse(readFileSync(`${preserved}/${name}`, 'utf8')));
console.log('historical/CVAP capture CLI tests passed');
