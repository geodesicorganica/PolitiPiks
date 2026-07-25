import assert from 'node:assert/strict';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import { CANONICAL_2026_PRE_ELECTION_LOCK_POLICY, PRODUCT_LOCK_CLOSE_AT, deadlineCoverageReport, generateDeadlineRecords, generateProductLockRecords, normalizeDeadlineRegistry, serializeDeadlineRegistry, validateProductLockPolicy } from './deadlineRegistry.js';

const zoneByState: Record<string, string> = { AK: 'America/Anchorage', AZ: 'America/Phoenix', CA: 'America/Los_Angeles', CO: 'America/Denver', HI: 'Pacific/Honolulu', ID: 'America/Boise', MT: 'America/Denver', NM: 'America/Denver', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', UT: 'America/Denver', WA: 'America/Los_Angeles', WY: 'America/Denver' };
function fixture() {
  const states = [...new Set(CANONICAL_2026_FEDERAL_CONTESTS.map((seat) => seat.state))];
  const authorityRules = states.map((jurisdiction) => ({ id: `fixture-${jurisdiction}`, jurisdiction, electionDate: '2026-11-03', scope: 'uniform-statewide' as const,
    closingTimes: [{ id: 'state', localPollClosingTime: '19:00', timeZone: zoneByState[jurisdiction] ?? 'America/New_York' }], sourceName: 'Test-only government authority fixture', sourceUrl: 'https://elections.example.gov/fixture', citation: 'Fixture citation.', applicabilityBasis: 'Fixture only.', retrievedAt: '2026-07-24T00:00:00.000Z', reviewedAt: '2026-07-24T00:00:00.000Z', researcher: 'fixture-researcher', reviewer: 'fixture-reviewer', reviewStatus: 'reviewed' as const, conflictDisposition: 'none' as const, notes: 'Test-only fixture; not publication evidence.' }));
  const seatAssignments = CANONICAL_2026_FEDERAL_CONTESTS.map((seat) => ({ electionId: seat.id, ruleIds: [`fixture-${seat.state}`], closingTimeIds: [`fixture-${seat.state}/state`], policy: 'uniform-statewide' as const, assignmentBasis: 'Fixture statewide assignment.' }));
  return { schemaVersion: 3 as const, productLockPolicy: CANONICAL_2026_PRE_ELECTION_LOCK_POLICY, authorityRules, seatAssignments };
}
const complete = fixture();
const generated = generateDeadlineRecords(complete);
assert.equal(generated.length, 470, 'one reviewed state rule expands deterministically to every state seat');
const locks = generateProductLockRecords(complete.productLockPolicy);
assert.equal(locks.length, 470, 'the approved product policy covers every canonical contest');
assert.ok(locks.every((lock) => lock.closeAt.seconds === PRODUCT_LOCK_CLOSE_AT.seconds && lock.deadlineKind === 'product_safety_lock'), 'all product locks use the exact timezone-independent instant');
assert.equal(deadlineCoverageReport(complete).publicationLockReady, true, 'publication locks do not depend on full official research');
const partial = { ...complete, seatAssignments: complete.seatAssignments.slice(0, 1) };
assert.equal(deadlineCoverageReport(partial).publicationLockReady, true, 'partial official research remains a research gap, not a lock blocker');
assert.throws(() => validateProductLockPolicy({ ...complete.productLockPolicy, id: 'other-policy' }), /invalid/, 'policy identity is immutable');
assert.equal(new Set(generated.map((record) => record.sourceRuleIds[0])).size, 50, 'source evidence is shared rather than duplicated per seat');
assert.equal(deadlineCoverageReport({ ...complete, authorityRules: [...complete.authorityRules].reverse(), seatAssignments: [...complete.seatAssignments].reverse() }).digest, deadlineCoverageReport(complete).digest, 'shuffled rules and assignments have a stable digest');
assert.equal(normalizeDeadlineRegistry(complete).authorityRules.length, 50);
assert.throws(() => normalizeDeadlineRegistry({ schemaVersion: 2, records: [] }), /unsupported|missing product lock/, 'legacy v2 manual records cannot certify');
assert.throws(() => generateDeadlineRecords({ ...complete, seatAssignments: complete.seatAssignments.slice(1) }), /incomplete/, 'missing assignments fail');
assert.throws(() => generateDeadlineRecords({ ...complete, seatAssignments: [...complete.seatAssignments, complete.seatAssignments[0]] }), /duplicate/, 'duplicate assignments fail');
assert.throws(() => generateDeadlineRecords({ ...complete, authorityRules: complete.authorityRules.map((rule) => rule.id === 'fixture-GA' ? { ...rule, sourceUrl: 'https://example.com/not-official' } : rule) }), /official government/, 'unofficial domains fail');
const multi: any = fixture();
const ga = multi.authorityRules.find((rule) => rule.id === 'fixture-GA')!;
ga.scope = 'statewide-earliest-close'; ga.closingTimes = [{ id: 'east', localPollClosingTime: '19:00', timeZone: 'America/New_York' }, { id: 'central', localPollClosingTime: '19:00', timeZone: 'America/Chicago' }];
for (const assignment of multi.seatAssignments.filter((item) => item.electionId.startsWith('2026-GA-'))) { assignment.policy = assignment.electionId.includes('house-001') ? 'district-specific-earliest-close' : 'statewide-earliest-close'; assignment.closingTimeIds = assignment.electionId.includes('house-001') ? ['fixture-GA/central'] : ['fixture-GA/east', 'fixture-GA/central']; assignment.assignmentBasis = 'Fixture multi-zone earliest-close assignment.'; }
const multiGenerated = generateDeadlineRecords(multi);
assert.equal(multiGenerated.find((record) => record.electionId === '2026-GA-senate-class-2')?.timeZone, 'America/New_York', 'Senate uses the earliest absolute statewide close');
assert.equal(multiGenerated.find((record) => record.electionId === '2026-GA-house-001')?.timeZone, 'America/Chicago', 'House uses the district-specific close');
assert.throws(() => generateDeadlineRecords({ ...multi, seatAssignments: multi.seatAssignments.map((item) => item.electionId === '2026-GA-senate-class-2' ? { ...item, policy: 'uniform-statewide' as const } : item) }), /uniform assignment/, 'unsafe later/multiple close assumptions are rejected');
assert.equal(typeof serializeDeadlineRegistry, 'function');
console.log('deadline registry rule-expansion test passed');
