import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import {
  WAVE_D_STATES,
  buildWaveDReport,
  normalizeWaveDEvidence,
  waveDEvidenceDigest,
  type WaveDEvidence,
} from './waveDSourceResolution.js';

const load = () => Object.fromEntries(WAVE_D_STATES.map((state) => [
  state,
  JSON.parse(readFileSync(`data/2026/wave-d-reviewed/${state}.json`, 'utf8')),
] )) as Record<(typeof WAVE_D_STATES)[number], WaveDEvidence>;

const evidence = load();
const report = buildWaveDReport(evidence);
assert.equal(Object.keys(report.states).length, 36);
assert.equal(report.counts.genericPlaceholders, 0);
assert.equal(report.counts.unsupportedCapabilityClaims, 0);
assert.equal(report.counts.homepageOnlyEvidence, 0);
assert.equal(report.counts.missingNextReview, 0);
assert.equal(report.counts.duplicateEndpoints, 0);
assert.equal(report.counts.conflictingEndpoints, 0);
const shuffledEvidence = Object.fromEntries(Object.entries(evidence).reverse()) as typeof evidence;
assert.equal(buildWaveDReport(shuffledEvidence).planDigest, report.planDigest);
assert.equal(waveDEvidenceDigest(shuffledEvidence), report.evidenceDigest);

const homepageOnly = structuredClone(evidence.AL);
homepageOnly.capabilities[0].endpoint = homepageOnly.authorityUrl;
assert.throws(() => normalizeWaveDEvidence(homepageOnly), /homepage-only/);

const missingReview = structuredClone(evidence.AL);
delete missingReview.nextReviewAt;
assert.throws(() => normalizeWaveDEvidence(missingReview), /next review/);

const officialNone = structuredClone(evidence.AL);
officialNone.publicationStatus = 'officially_none';
officialNone.capabilities[0].publicationStatus = 'officially_none';
officialNone.capabilities[0].facts = ['No record'];
delete officialNone.capabilities[0].affirmativeOfficialEvidence;
assert.throws(() => normalizeWaveDEvidence(officialNone), /officially_none/);

const tampered = structuredClone(evidence.AL);
tampered.evidenceDigest = '0'.repeat(64);
assert.throws(() => normalizeWaveDEvidence(tampered), /digest/);

const claimed = structuredClone(evidence.AL);
claimed.capabilities[1].proven = true;
assert.throws(() => normalizeWaveDEvidence(claimed), /unsupported capability/);

const duplicate = structuredClone(evidence.AL);
duplicate.capabilities[1].endpoint = duplicate.capabilities[0].endpoint;
assert.throws(() => normalizeWaveDEvidence(duplicate), /duplicate endpoint/);

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const offline = execFileSync(executable, ['tsx', 'scripts/audit-2026-wave-d-source-resolution.ts', '--all-wave-d', '--verify-replay'], {
  cwd: process.cwd(), encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, FIREBASE_CONFIG: 'invalid', GOOGLE_APPLICATION_CREDENTIALS: 'C:\\credentials-unavailable.json' },
});
assert.equal(JSON.parse(offline).firebaseInitialized, false);

console.log('Wave D source-resolution tests passed');
