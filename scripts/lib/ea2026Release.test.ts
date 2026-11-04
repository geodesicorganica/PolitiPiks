import assert from 'node:assert/strict';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import { assessRelease, buildEaRelease, EA_STATES, EA_SCOPES, PROFILE_FIELDS, type ReleaseInput, type CandidateProfile } from './ea2026Release.js';
import { planEaPublication, publishEaRelease, rollbackEaRelease, SELECTOR_PATH, type PublicationStore, type Transaction } from './ea2026Publication.js';

const at = '2026-09-21T12:00:00.000Z';
const reference = { status: 'unavailable' as const, reason: 'Reviewed test fixture: source does not publish this field.', sourceIds: ['official'] };
const profile = Object.fromEntries(PROFILE_FIELDS.map(key => [key, reference])) as CandidateProfile;
const input: ReleaseInput = {
  schemaVersion: 1, releaseId: '2026-ea-test', asOf: at,
  sources: [{ id: 'official', url: 'https://www.sos.ca.gov/elections', sha256: 'a'.repeat(64), retrievedAt: at, reviewedAt: at, reviewer: 'test-only', kind: 'election_authority', authority: 'Test election office', locator: 'Synthetic fixture, not production data' }],
  coverage: EA_STATES.map(state => ({ state, authorityUrl: 'https://www.sos.ca.gov', scopes: Object.fromEntries(EA_SCOPES.map(scope => {
    const ids = CANONICAL_2026_FEDERAL_CONTESTS.filter(c => c.state === state && c.office === scope).map(c => c.id);
    return [scope, { status: ids.length ? 'available' : 'officially_none', expectedContestIds: ids, sourceIds: ['official'], reason: 'Synthetic scope inventory' }];
  })) as ReleaseInput['coverage'][number]['scopes'] })),
  contests: CANONICAL_2026_FEDERAL_CONTESTS.map(c => ({ id: c.id, state: c.state, office: c.office, electionDate: '2026-11-03', seatKind: c.seatKind, ...(c.district ? { district: c.district } : {}), sourceIds: ['official'], candidates: [{ id: 'candidate-a', name: 'Fixture Candidate', party: 'Fixture party', ballotSourceIds: ['official'], qualificationStatus: 'on_ballot', profile }], metrics: { historical: reference, turnout: reference, demographics: reference } })),
};
// JSON round-trip intentionally removes shared fixture references.
const clone = (): ReleaseInput => JSON.parse(JSON.stringify(input));
assert.equal(assessRelease(input).releaseReady, true);
const bundle = buildEaRelease(input);
assert.deepEqual(buildEaRelease(clone()), bundle);
assert.equal(bundle.counts.races, 470);
assert.equal(bundle.counts.profiles, 470);
assert.equal(bundle.counts.documents, 1410);
const missing = clone(); missing.coverage.pop();
assert.throws(() => buildEaRelease(missing), /50 states/);
const incomplete = clone(); incomplete.contests.pop();
assert.equal(assessRelease(incomplete).releaseReady, false);
assert.throws(() => buildEaRelease(incomplete), /incomplete/);
const partialProfile = clone(); partialProfile.contests[0].candidates[0].profile.biography = { status: 'unreviewed', sourceIds: [] };
assert.equal(assessRelease(partialProfile).profilesReviewed, 469);
assert.throws(() => buildEaRelease(partialProfile), /incomplete/);
const filedSource = clone(); filedSource.sources[0].kind = 'campaign';
assert.throws(() => buildEaRelease(filedSource), /non-official/);
const stale = clone(); stale.sources[0].retrievedAt = '2026-08-01T00:00:00Z';
assert.throws(() => buildEaRelease(stale), /incomplete/);
const duplicate = clone(); duplicate.contests.push(duplicate.contests[0]);
assert.throws(() => buildEaRelease(duplicate), /duplicate contest/);
const tampered = clone(); tampered.contests[0].candidates[0].profile.biography = { status: 'present', value: '', sourceIds: ['official'] };
assert.throws(() => buildEaRelease(tampered), /empty biography/);
const extra = clone();
extra.coverage.find(c => c.state === 'CA')!.scopes.Governor = { status: 'available', expectedContestIds: ['2026-CA-governor'], sourceIds: ['official'] };
extra.contests.push({ ...structuredClone(input.contests[0]), id: '2026-CA-governor', state: 'CA', office: 'Governor' });
assert.equal(buildEaRelease(extra).counts.races, 471);
const withMeasure = clone();
withMeasure.coverage.find(c => c.state === 'CA')!.scopes.Measure = { status: 'available', expectedContestIds: ['2026-CA-proposition-4'], sourceIds: ['official'] };
withMeasure.contests.push({ id: '2026-CA-proposition-4', state: 'CA', office: 'Measure', electionDate: '2026-11-03', seatKind: 'regular', sourceIds: ['official'], candidates: [], title: 'Proposition 1: Housing bonds', description: 'Synthetic housing fixture', fullTextUrl: 'https://www.sos.ca.gov/test-law.pdf', eligibleOptions: ['yes', 'no'], fiscalAnalysis: reference, metrics: {} as any, measureIdentity: { officialNumber: 'Proposition 1', officialAliases: ['SB 417'], legacyTitle: 'Veterans and Affordable Housing Bond Act of 2026', legacyRegistryDigest: 'b'.repeat(64), sourceIds: ['official'] } });
const measureBundle = buildEaRelease(withMeasure);
const measurePath = 'ballotMeasures/2026-CA-proposition-4';
const measureDocument = measureBundle.documents.find(d => d.path === measurePath)!;
assert.equal(measureDocument.data.officialNumber, 'Proposition 1', 'ballot label is independent of stable historical ID');
const measureBefore = Object.fromEntries(measureBundle.documents.map(d => [d.path, d.path === measurePath ? { title: 'Veterans and Affordable Housing Bond Act of 2026' } : null]));
assert.doesNotThrow(() => planEaPublication(withMeasure, measureBundle, measureBefore, null));
const wrongMeasureBefore = { ...measureBefore, [measurePath]: { title: 'Unrelated public financing measure' } };
assert.throws(() => planEaPublication(withMeasure, measureBundle, wrongMeasureBefore, null), /destination identity changed/);
const missingIdentity = structuredClone(withMeasure); delete missingIdentity.contests.at(-1)!.measureIdentity;
assert.throws(() => planEaPublication(missingIdentity, buildEaRelease(missingIdentity), measureBefore, null), /reviewed stable identity/);
const unknownScope = clone(); unknownScope.contests[0].id = 'unknown';
assert.throws(() => buildEaRelease(unknownScope), /outside reviewed/);

class MemoryStore implements PublicationStore {
  data = new Map<string, Record<string, unknown>>();
  batches: number[] = [];
  async read(path: string) { return structuredClone(this.data.get(path) ?? null); }
  async transaction<T>(run: (tx: Transaction) => Promise<T>) {
    const writes = new Map<string, Record<string, unknown>>();
    const result = await run({ read: p => this.read(p), write: (p, data) => { writes.set(p, structuredClone(data)); } });
    assert.ok(writes.size <= 100);
    this.batches.push(writes.size);
    for (const [p, data] of writes) this.data.set(p, data);
    return result;
  }
}
const before = Object.fromEntries(bundle.documents.map((d, i) => [d.path, i === 0 ? { operatorNote: 'preserve', status: 'upcoming' } : null]));
const plan = planEaPublication(input, bundle, before, null);
assert.equal(plan.operations[0].after.operatorNote, 'preserve');
const store = new MemoryStore();
store.data.set(plan.operations[0].path, before[plan.operations[0].path]!);
let interrupted = false;
await assert.rejects(publishEaRelease(store, plan, async p => { if (p.phase === 'batch-completed' && !interrupted) { interrupted = true; throw new Error('simulated interruption'); } }), /simulated/);
assert.equal((await store.read(SELECTOR_PATH))!.state, 'pending');
await publishEaRelease(store, plan, async () => {});
assert.deepEqual(await store.read(SELECTOR_PATH), plan.activeSelector);
const previousBatches = store.batches.length;
await publishEaRelease(store, plan, async () => {});
assert.equal(store.batches.length, previousBatches, 'active retry is read-only');
await rollbackEaRelease(store, plan, async () => {});
assert.deepEqual(await store.read(plan.operations[0].path), before[plan.operations[0].path]);
assert.deepEqual(await store.read(plan.operations[1].path), plan.operations[1].after, 'new records retained for inactive generation');
assert.equal((await store.read(SELECTOR_PATH))!.activeFederalGeneration, 'legacy-2026');
const conflicting = new MemoryStore(); conflicting.data.set(plan.operations[0].path, { unrecognized: true });
await assert.rejects(publishEaRelease(conflicting, plan, async () => {}), /destination changed/);
assert.equal(conflicting.batches.length, 0);
const changedDuringWrite = new MemoryStore(); changedDuringWrite.data.set(plan.operations[0].path, before[plan.operations[0].path]!);
await assert.rejects(publishEaRelease(changedDuringWrite, plan, async p => { if (p.phase === 'preclassified') changedDuringWrite.data.set(plan.operations[0].path, { concurrent: true }); }), /compare-before-write/);
assert.equal((await changedDuringWrite.read(SELECTOR_PATH))!.state, 'pending');
const modifiedBundle = structuredClone(bundle); modifiedBundle.documents[0].data.name = 'tampered';
assert.throws(() => planEaPublication(input, modifiedBundle, before, null), /does not reproduce/);
console.log('EA release and publication tests passed: completeness, provenance, 471-race expansion, interruption/resume, idempotence, rollback, conflict rejection');
