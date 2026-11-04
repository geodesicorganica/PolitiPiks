import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildG8Br7bInnerTsxInvocation } from './g8Br7bInnerTsxInvocation.js';

const inheritedNodeOptions = process.env.NODE_OPTIONS;
const testPathWithSpaces = String.raw`C:\BR7B invocation seam\g8 test (exact).ts`;
const innerTsxInvocation = buildG8Br7bInnerTsxInvocation(testPathWithSpaces);
const directHeapArgumentIndex = innerTsxInvocation.arguments.indexOf('--max-old-space-size=4096');
const tsxCliIndex = innerTsxInvocation.arguments.findIndex((argument) => /tsx[\\/]dist[\\/]cli\.(?:mjs|cjs)$/.test(argument));
assert.equal(innerTsxInvocation.executable, process.execPath);
assert.deepEqual(innerTsxInvocation.arguments.slice(0, 2), ['--expose-gc', '--max-old-space-size=4096']);
assert.ok(directHeapArgumentIndex >= 0 && directHeapArgumentIndex < tsxCliIndex);
assert.ok(innerTsxInvocation.arguments.indexOf('--max-old-space-size=4096', tsxCliIndex + 1) > tsxCliIndex);
assert.equal(innerTsxInvocation.arguments.at(-1), testPathWithSpaces);
assert.equal(
  innerTsxInvocation.emulatorsExecCommand,
  [innerTsxInvocation.executable, ...innerTsxInvocation.arguments].map((value) => `"${value}"`).join(' '),
);
assert.equal(process.env.NODE_OPTIONS, inheritedNodeOptions);

const effectiveProbeEnvironment = { ...process.env };
for (const key of Object.keys(effectiveProbeEnvironment)) {
  if (key.toUpperCase() === 'NODE_OPTIONS') delete effectiveProbeEnvironment[key];
}
const effectiveProbe = buildG8Br7bInnerTsxInvocation(resolve('scripts/lib/g8Br7bInnerTsxInvocation.probe.ts'));
const effectiveProbeResult = spawnSync(effectiveProbe.emulatorsExecCommand, {
  cwd: process.cwd(),
  env: effectiveProbeEnvironment,
  shell: true,
  windowsHide: true,
  encoding: 'utf8',
  timeout: 60_000,
});
assert.equal(effectiveProbeResult.status, 0, 'the real TSX execution seam must receive the certified direct heap policy');
assert.match(effectiveProbeResult.stdout, /effective inner TSX heap probe passed/);
assert.equal(process.env.NODE_OPTIONS, inheritedNodeOptions);

console.log('G8.4BR7BR2AR inner TSX invocation regression passed');
