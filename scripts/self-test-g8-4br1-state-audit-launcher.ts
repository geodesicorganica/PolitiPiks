import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { buildG8V2DirectNodeTsxInvocation, launchG8V2JsonChild } from './lib/g8V2StateAuditPreflight.js';

const expectedArguments = ['--self-test-receipt', 'g8-4br1 harmless child with spaces'];
const invocation = buildG8V2DirectNodeTsxInvocation(resolve('scripts/fixtures/g8-4br1 launcher child.ts'), expectedArguments);
const launch = launchG8V2JsonChild(invocation, { env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: undefined, FIRESTORE_EMULATOR_HOST: undefined } });
assert.deepEqual((launch.result as { arguments?: string[] } | null)?.arguments, expectedArguments);
assert.deepEqual(launch.evidence.invocationAccounting, { attempted: 1, started: 1, exited: 1 });
assert.equal(launch.launcherExitStatus, 0);
console.log(JSON.stringify({
  phase: 'g8-4br1-harmless-launcher-self-test',
  firebaseImported: false,
  credentialsLoaded: false,
  firestoreContacted: false,
  productionAuditorExecuted: false,
  argumentsPreserved: true,
  launch: launch.evidence,
  childResult: launch.result,
}, null, 2));
