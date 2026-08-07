import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {inspectHostingArtifact} from '../scripts/verify-hosting-artifact';

const root = mkdtempSync(path.join(tmpdir(), 'politipiks-hosting-'));
try {
  mkdirSync(path.join(root, 'assets'));
  writeFileSync(path.join(root, 'index.html'), '<div id="root"></div><script type="module" src="/assets/index-abc.js"></script>');
  writeFileSync(path.join(root, 'assets', 'index-abc.js'), 'console.log("browser asset");');
  assert.deepEqual(inspectHostingArtifact(root), []);

  writeFileSync(path.join(root, 'assets', 'unsafe.js'), 'const key = GEMINI_API_KEY;');
  assert.ok(inspectHostingArtifact(root).some((issue) => issue.message === 'Gemini key reference'));
} finally {
  rmSync(root, {recursive: true, force: true});
}

console.log('Hosting artifact tests passed.');
