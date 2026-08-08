import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildG8V2DirectNodeTsxInvocation, launchG8V2JsonChild } from './g8V2StateAuditPreflight.js';

const fixturePath = resolve('scripts/fixtures/g8-4br1 launcher child.ts');
const preservedArguments = ['--label', 'value with spaces', '--literal', 'a=b&c', '--leading-dashes', '--still-a-value'];
const successInvocation = buildG8V2DirectNodeTsxInvocation(fixturePath, preservedArguments);
assert.equal(successInvocation.executable, process.execPath);
assert.equal(successInvocation.executable.includes(' ') || successInvocation.arguments.some((argument) => argument.includes(' ')), true, 'test contract requires a path containing spaces');
assert.deepEqual(successInvocation.arguments.slice(2), preservedArguments);

let successSpawnCalls = 0;
const success = launchG8V2JsonChild(successInvocation, { spawn: (...arguments_) => { successSpawnCalls += 1; return spawnSync(...arguments_); } });
assert.equal(successSpawnCalls, 1, 'success path must spawn exactly once');
assert.deepEqual(success.evidence.invocationAccounting, { attempted: 1, started: 1, exited: 1 });
assert.equal(success.evidence.childStarted, true);
assert.equal(success.evidence.childExitStatus, 0);
assert.equal(success.evidence.errorCode, null);
assert.equal(success.evidence.outputStatus, 'valid-json');
assert.equal(success.launcherExitStatus, 0);
assert.deepEqual((success.result as { arguments: string[] }).arguments, preservedArguments);
assert.equal(success.stderr, '');

const nonzero = launchG8V2JsonChild(buildG8V2DirectNodeTsxInvocation(fixturePath, ['--stderr-marker', '--exit-code', '7']));
assert.equal(nonzero.evidence.childStarted, true);
assert.equal(nonzero.evidence.childExited, true);
assert.equal(nonzero.evidence.childExitStatus, 7);
assert.equal(nonzero.evidence.stderrPresent, true);
assert.equal(nonzero.stderr, 'g8-4br1-stderr-marker');
assert.equal(nonzero.evidence.outputStatus, 'valid-json');
assert.equal(nonzero.launcherExitStatus, 7);

const missingExecutable = resolve('scripts/fixtures/g8-4br1 launcher missing executable.exe');
const rejected = launchG8V2JsonChild({ ...successInvocation, executable: missingExecutable });
assert.deepEqual(rejected.evidence.invocationAccounting, { attempted: 1, started: 0, exited: 0 });
assert.equal(rejected.evidence.childStarted, false);
assert.equal(rejected.evidence.childExitStatus, null);
assert.equal(rejected.evidence.errorCode, 'ENOENT');
assert.equal(rejected.evidence.outputStatus, 'not-applicable');
assert.equal(rejected.launcherExitStatus, 1);

let malformedSpawnCalls = 0;
const malformed = launchG8V2JsonChild(buildG8V2DirectNodeTsxInvocation(fixturePath, ['--malformed-json']), { spawn: (...arguments_) => { malformedSpawnCalls += 1; return spawnSync(...arguments_); } });
assert.equal(malformedSpawnCalls, 1, 'malformed output must not cause a retry');
assert.deepEqual(malformed.evidence.invocationAccounting, { attempted: 1, started: 1, exited: 1 });
assert.equal(malformed.evidence.childExitStatus, 0);
assert.equal(malformed.evidence.outputStatus, 'malformed-json');
assert.equal(malformed.stdout, 'g8-4br1-malformed-json');
assert.equal(malformed.result, null);
assert.equal(malformed.launcherExitStatus, 1);

assert.throws(() => buildG8V2DirectNodeTsxInvocation(fixturePath, preservedArguments, { executable: 'relative-node' }), /paths must be absolute/);
console.log('G8.4BR1 state audit launcher tests passed');
