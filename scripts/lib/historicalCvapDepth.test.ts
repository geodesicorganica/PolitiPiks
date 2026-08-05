import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import { censusDistrictToCanonical, cvapVintageForRace, FEC_GA_2020_RUNOFF, buildHistoricalCvapCheckpoint, buildHistoricalCvapPlan, buildHistoricalCvapSnapshot, validateHistoricalCvapCheckpoint, validateHistoricalCvapSnapshot } from './historicalCvapDepth.js';
import { validateCanonicalPublicationSnapshot } from './canonicalPublication.js';
import { validateFecBulkFinanceSnapshot } from './fecBulkFinance.js';
import { validateCongressDepthSnapshot } from './congressDepth.js';

assert.equal(censusDistrictToCanonical('00'), 'AL', 'Census at-large 00 maps to canonical AL');
assert.equal(censusDistrictToCanonical('1'), '001');
assert.equal(censusDistrictToCanonical('ZZ'), null);
assert.equal(cvapVintageForRace({ id: '2026-GA-house-001', office: 'House' }), 2024);
assert.equal(cvapVintageForRace({ id: '2026-GA-senate-class-2', office: 'Senate' }), 2020);
assert.equal(cvapVintageForRace({ id: '2026-OH-senate-special-class-3', office: 'Senate' }), 2022);
assert.deepEqual(FEC_GA_2020_RUNOFF, { dem: 2_269_923, rep: 2_214_979, total: 4_484_902 });

const checkpoint = buildHistoricalCvapCheckpoint({ sourceKey: 'test', sourceUrl: 'https://example.gov/official', retrievedAt: '2026-07-31T00:00:00.000Z', responseDigest: 'a'.repeat(64), payload: { totals: [1, 2] } });
assert.deepEqual(validateHistoricalCvapCheckpoint(checkpoint), checkpoint);
assert.throws(() => validateHistoricalCvapCheckpoint({ ...checkpoint, digest: '0'.repeat(64) }), /digest/);
assert.throws(() => buildHistoricalCvapCheckpoint({ ...checkpoint, payload: { winner: 'not allowed' } }), /leakage/);

const root = process.cwd();
const publication = validateCanonicalPublicationSnapshot(JSON.parse(readFileSync(`${root}/.artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json`, 'utf8')));
const finance = validateFecBulkFinanceSnapshot(JSON.parse(readFileSync(`${root}/.artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json`, 'utf8')));
const congress = validateCongressDepthSnapshot(JSON.parse(readFileSync(`${root}/.artifacts/private/canonical-migration/g6-3-congress-depth-v2.json`, 'utf8')));
const capturedAt = '2026-07-31T00:00:00.000Z';
const snapshot = buildHistoricalCvapSnapshot({
  capturedAt, publicationInputDigest: publication.inputDigest, financeInputDigest: finance.inputDigest, congressInputDigest: congress.inputDigest, requestCount: 0, maxCalls: 200,
  provenance: { methodology: 'test only', sources: [{ sourceKey: 'test', sourceUrl: 'https://example.gov/official', responseDigest: 'b'.repeat(64), retrievedAt: capturedAt }], rawHouseRows: 0, rawSenateRows: 0, ignoredRows: 0, ignoredCensusDistrictRowsByState: [] },
  historical: CANONICAL_2026_FEDERAL_CONTESTS.map((race) => ({ raceId: race.id, availability: 'present' as const, electionYear: race.office === 'House' ? 2024 : race.id.includes('special-class-3') ? 2022 : 2020, demVotes: 40, repVotes: 60, totalVotes: 100, sourceUrl: 'https://example.gov/official', retrievedAt: capturedAt, methodology: 'test facts' })),
  cvap: CANONICAL_2026_FEDERAL_CONTESTS.map((race) => ({ raceId: race.id, availability: 'present' as const, geography: race.office === 'House' ? 'congressional-district' as const : 'state' as const, state: race.state, district: race.office === 'House' ? race.district : null, estimateVintage: race.office === 'House' ? 2024 : race.id.includes('special-class-3') ? 2022 : 2020, congressVintage: race.office === 'House' ? 119 : null, variable: 'B29001_001E' as const, cvapEstimate: 200, sourceUrl: 'https://example.gov/official', retrievedAt: capturedAt, methodology: 'ACS CVAP test fact' })),
});
assert.deepEqual(validateHistoricalCvapSnapshot(snapshot), snapshot, 'snapshot validates deterministically');
assert.throws(() => validateHistoricalCvapSnapshot({ ...snapshot, inputDigest: '0'.repeat(64) }), /digest/);
const plan = buildHistoricalCvapPlan(publication, finance, congress, snapshot);
assert.equal(plan.historicalCvapCoverage.historical.present, 470);
assert.equal(plan.historicalCvapCoverage.turnout.present, 470, 'unclamped compatible votes/CVAP are present');
assert.equal(plan.historicalCvapCoverage.demographicsCvap.present, 470);
assert.equal(plan.documents.filter((document) => /candidateResearch/.test(document.path)).length, 2384, 'G6.2/G6.3 research is preserved');
const captureMetadataVariant = { ...publication, capturedAt: '2026-08-04T00:00:00.000Z' };
const reorderedPublication = { ...publication, inputs: {
  ...publication.inputs,
  races: [...publication.inputs.races].reverse(),
  deadlines: [...publication.inputs.deadlines].reverse(),
  predictions: [...publication.inputs.predictions].reverse(),
  candidateResearch: [...publication.inputs.candidateResearch].reverse(),
  contestMetrics: [...publication.inputs.contestMetrics].reverse(),
} };
const metadataVariantPlan = buildHistoricalCvapPlan(captureMetadataVariant, finance, congress, snapshot);
const reorderedPlan = buildHistoricalCvapPlan(reorderedPublication, finance, congress, snapshot);
assert.equal(metadataVariantPlan.evidenceDigest, plan.evidenceDigest, 'publication capture metadata does not change G6.4 evidence digest');
assert.equal(metadataVariantPlan.planDigest, plan.planDigest, 'publication capture metadata does not change G6.4 plan digest');
assert.equal(reorderedPlan.evidenceDigest, plan.evidenceDigest, 'publication ordering does not change G6.4 evidence digest');
assert.equal(reorderedPlan.planDigest, plan.planDigest, 'publication ordering does not change G6.4 plan digest');
const gaMetric = plan.documents.find((document) => document.path === 'contestMetrics/2026-GA-house-001')!;
assert.equal((gaMetric.data.historical as { marginPct: number }).marginPct, -20, 'historical margin preserves all valid-vote denominator');
const implausible = buildHistoricalCvapSnapshot({ ...snapshot, cvap: snapshot.cvap.map((item) => item.raceId === '2026-GA-house-001' ? { ...item, cvapEstimate: 50 } : item) });
const implausiblePlan = buildHistoricalCvapPlan(publication, finance, congress, implausible);
assert.equal(((implausiblePlan.documents.find((document) => document.path === 'contestMetrics/2026-GA-house-001')!.data.turnout) as { availability: string }).availability, 'unavailable', 'no turnout clamping');
assert.throws(() => buildHistoricalCvapSnapshot({ ...snapshot, cvap: snapshot.cvap.map((item) => item.raceId === '2026-GA-house-001' ? { ...item, variable: 'DP05_0019PE' } : item) as never }), /CVAP/);
console.log('historical/CVAP depth tests passed');
