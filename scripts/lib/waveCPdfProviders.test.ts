import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WAVE_C_STATES,
  buildWaveCReport,
  classifyOfficialPdf,
  extractPdfText,
  fetchWaveCPdfProvider,
  normalizeWaveCPdfFixture,
  parseWaveCPdfProviderResult,
} from './waveCPdfProviders.js';

const fixtures = Object.fromEntries(WAVE_C_STATES.map((state) => [state, JSON.parse(readFileSync(`data/2026/wave-c-pdf/${state}.json`, 'utf8'))])) as Record<string, any>;
const report = buildWaveCReport(fixtures);
assert.equal(report.counts.states, 2);
assert.equal(report.counts.classification.calendar, 2);
assert.equal(report.counts.status.unsupported_pdf, 2);
assert.equal(report.counts.records, 0);
assert.equal(report.counts.capabilities, 0);
assert.equal(report.counts.duplicateCanonicalIds, 0);
assert.equal(buildWaveCReport({ WV: fixtures.WV, RI: fixtures.RI }).planDigest, report.planDigest);
for (const state of WAVE_C_STATES) {
  const result = parseWaveCPdfProviderResult(fixtures[state]);
  assert.equal(result.classification, 'calendar');
  assert.equal(result.records.length, 0);
}
assert.equal(classifyOfficialPdf('2026 General Election Certified Candidate List\nJane Example'), 'candidate_list');
assert.equal(classifyOfficialPdf('2026 Election Calendar\nCandidate filing deadline'), 'calendar');
assert.equal(extractPdfText(Buffer.from('%PDF-1.4\n1 0 obj\n(General Election) Tj\n%%EOF')).text, 'General Election');
assert.throws(() => extractPdfText(Buffer.from('not a pdf')), /PDF/);
assert.throws(() => extractPdfText(Buffer.from('%PDF-1.4\n/Encrypt\n%%EOF')), /encrypted/);
assert.throws(() => extractPdfText(Buffer.from('%PDF-1.4\n/Image\n%%EOF')), /image-only/);
assert.throws(() => normalizeWaveCPdfFixture({ ...fixtures.RI, sourceUrl: 'https://example.com/ri.pdf' }), /allowlisted/);
assert.throws(() => parseWaveCPdfProviderResult({ ...fixtures.RI, records: [{ canonicalId: '2026-RI-candidate-example' }] }), /record/);
assert.throws(() => normalizeWaveCPdfFixture({ ...fixtures.RI, documentText: '2026 General Election Certified Candidate List' }), /schema drift/);
assert.throws(() => parseWaveCPdfProviderResult({ ...fixtures.RI, classification: 'candidate_list', status: 'available', documentText: '2026 General Election Certified Candidate List', records: [{ canonicalId: '2026-RI-candidate-example', title: 'Alex Example', qualificationStatus: 'on_ballot', finalBallot: true }, { canonicalId: '2026-RI-candidate-example', title: 'Alex Example', qualificationStatus: 'on_ballot', finalBallot: true }] }), /duplicate/);
await assert.rejects(() => fetchWaveCPdfProvider('RI', fixtures.RI, async () => new Response('', { status: 302, headers: { location: 'https://example.com/x.pdf' } })), /redirect/);
await assert.rejects(() => fetchWaveCPdfProvider('RI', fixtures.RI, async () => new Response('not pdf', { status: 200, headers: { 'content-type': 'text/html' } })), /content-type/);
await assert.rejects(() => fetchWaveCPdfProvider('RI', fixtures.RI, async () => new Response(Buffer.alloc(5 * 1024 * 1024 + 1), { status: 200, headers: { 'content-type': 'application/pdf' } })), /size limit/);
await assert.rejects(() => fetchWaveCPdfProvider('RI', { ...fixtures.RI, expectedDocumentSha256: '0'.repeat(64) }, async () => new Response('%PDF-1.4\n(2026 Election Calendar) Tj\n%%EOF', { status: 200, headers: { 'content-type': 'application/pdf' } })), /digest changed/);
const oldCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\deliberately-unavailable-firebase-credential.json';
assert.equal(buildWaveCReport(fixtures).counts.states, 2);
if (oldCredentials === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS; else process.env.GOOGLE_APPLICATION_CREDENTIALS = oldCredentials;
console.log('Wave C official-PDF provider tests passed');
