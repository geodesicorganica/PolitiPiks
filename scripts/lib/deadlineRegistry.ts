import { createHash } from 'node:crypto';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import type { FirestoreTimestampTag } from './canonicalMigration.js';

export const DEADLINE_REGISTRY_SCHEMA_VERSION = 3 as const;
export const GENERAL_ELECTION_DATE = '2026-11-03';
export const PRODUCT_LOCK_POLICY_ID = 'canonical-2026-pre-election-lock-v1' as const;
export const PRODUCT_LOCK_POLICY_VERSION = 1 as const;
export const PRODUCT_LOCK_CLOSE_AT: FirestoreTimestampTag = Object.freeze({ __firestoreType: 'timestamp/v1', seconds: 1793664000, nanoseconds: 0 });
export type RuleScope = 'uniform-statewide' | 'district-specific-earliest-close' | 'statewide-earliest-close' | 'local-option-earliest-close';
export type AuthorityRule = {
  id: string; jurisdiction: string; electionDate: string; scope: RuleScope;
  closingTimes: Array<{ id: string; localPollClosingTime: string; timeZone: string; districts?: string[]; counties?: string[] }>;
  sourceName: string; sourceUrl: string; citation: string; applicabilityBasis: string;
  retrievedAt: string; reviewedAt: string; researcher: string; reviewer: string; reviewStatus: 'reviewed';
  conflictDisposition: 'none'; notes: string;
};
export type SeatDeadlineAssignment = {
  electionId?: string; electionIds?: string[]; ruleIds: string[]; closingTimeIds: string[]; policy: RuleScope;
  assignmentBasis: string;
};
export type JurisdictionDeadline = {
  electionId: string; jurisdiction: string; electionDate: string; localPollClosingTime: string; timeZone: string;
  closeAt: FirestoreTimestampTag; sourceRuleIds: string[]; sourceName: string; sourceUrl: string; citation: string;
  retrievedAt: string; reviewedAt: string; reviewerStatus: 'reviewed'; notes: string;
  multiTimeZone?: { treatment: Exclude<RuleScope, 'uniform-statewide'>; basis: string };
};
export type ProductLockPolicy = {
  id: typeof PRODUCT_LOCK_POLICY_ID; version: typeof PRODUCT_LOCK_POLICY_VERSION; electionDate: typeof GENERAL_ELECTION_DATE;
  closeAt: FirestoreTimestampTag; scope: 'all-canonical-2026-federal-contests'; rationale: string;
  status: 'approved_product_policy'; supersession: string; electionDateSourceUrl: string; reviewedAt: string;
};
export const CANONICAL_2026_PRE_ELECTION_LOCK_POLICY: ProductLockPolicy = Object.freeze({
  id: PRODUCT_LOCK_POLICY_ID, version: PRODUCT_LOCK_POLICY_VERSION, electionDate: GENERAL_ELECTION_DATE, closeAt: PRODUCT_LOCK_CLOSE_AT,
  scope: 'all-canonical-2026-federal-contests', status: 'approved_product_policy',
  rationale: 'Locks before Election Day begins in every covered U.S. timezone, preventing partial-results leakage under fixed, variable, local-option, and conditional-close regimes.',
  supersession: 'A future policy may move individual locks later only after complete official evidence and a separately reviewed release.',
  electionDateSourceUrl: 'https://www.fec.gov/help-candidates-and-committees/dates-and-deadlines/', reviewedAt: '2026-07-24T00:00:00.000Z',
});
export type ProductLockRecord = {
  electionId: string; electionDate: string; closeAt: FirestoreTimestampTag; deadlineKind: 'product_safety_lock';
  lockPolicyId: typeof PRODUCT_LOCK_POLICY_ID; lockPolicyVersion: typeof PRODUCT_LOCK_POLICY_VERSION; lockReason: string;
  electionDateSourceUrl: string; reviewedAt: string;
};
export type DeadlineRegistry = { schemaVersion: typeof DEADLINE_REGISTRY_SCHEMA_VERSION; productLockPolicy: ProductLockPolicy; authorityRules: AuthorityRule[]; seatAssignments: SeatDeadlineAssignment[]; authorityAllowlist?: Array<{ host: string; evidenceUrl: string; notes: string }> };
export type DeadlineCoverageReport = {
  reviewedAuthorityRules: number; reviewedStates: number; total: number; singleTimeZoneRecords: number; multiTimeZoneRecords: number;
  statewideEarliestCloseRecords: number; districtSpecificEarliestCloseRecords: number; states: Array<{ state: string; records: number; timeZones: string[] }>;
  timeZones: Array<{ timeZone: string; records: number }>; digest: string;
  lockPolicyId: string; lockPolicyVersion: number; federalLockCoverage: number; contestsMissingCloseAt: number;
  invalidTimestamps: number; publicationLockReady: boolean; researchedContests: number; unresolvedOfficialResearch: number;
  officialResearchComplete: boolean; officialPollCloseKinds: Record<string, number>;
};

const canonicalSeats = CANONICAL_2026_FEDERAL_CONTESTS;
const canonicalIds = new Set(canonicalSeats.map((contest) => contest.id));
const seatById = new Map(canonicalSeats.map((contest) => [contest.id, contest]));
const officialHostSuffixes = ['.gov', '.us'];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const canonicalJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const sorted = <T>(items: T[], key: (item: T) => string) => [...items].sort((left, right) => key(left).localeCompare(key(right)));
const timestamp = (value: unknown): value is FirestoreTimestampTag => isRecord(value) && value.__firestoreType === 'timestamp/v1' && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds) && (value.nanoseconds as number) >= 0 && (value.nanoseconds as number) <= 999999999;

function assertDate(value: string, label: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`invalid ${label}`); }
function assertIso(value: string, label: string) { if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`invalid ${label}`); }
function assertTime(value: string, label: string) { if (!/^\d{2}:\d{2}$/.test(value)) throw new Error(`invalid ${label}`); const [hour, minute] = value.split(':').map(Number); if (hour > 23 || minute > 59) throw new Error(`invalid ${label}`); }
function assertZone(value: string) { try { if (Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone !== value) throw new Error(); } catch { throw new Error(`invalid IANA timezone: ${value}`); } }
function assertOfficialUrl(value: string, allowlist: Set<string>) {
  let url: URL; try { url = new URL(value); } catch { throw new Error('deadline source URL must be HTTPS'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (!officialHostSuffixes.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix)) && !allowlist.has(host))) throw new Error(`deadline source is not an official government authority: ${value}`);
}
function partsAt(seconds: number, timeZone: string) { return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(seconds * 1000)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])); }
const instantCache = new Map<string, FirestoreTimestampTag>();
export function closeAtForLocalTime(electionDate: string, localPollClosingTime: string, timeZone: string): FirestoreTimestampTag {
  const key = `${electionDate}/${localPollClosingTime}/${timeZone}`; const cached = instantCache.get(key); if (cached) return cached;
  const start = Date.parse(`${electionDate}T00:00:00.000Z`) / 1000;
  for (let seconds = start - 14 * 3600; seconds <= start + 38 * 3600; seconds += 60) {
    const parts = partsAt(seconds, timeZone);
    if (`${parts.year}-${parts.month}-${parts.day}` === electionDate && `${parts.hour}:${parts.minute}` === localPollClosingTime) {
      const result = { __firestoreType: 'timestamp/v1' as const, seconds, nanoseconds: 0 }; instantCache.set(key, result); return result;
    }
  }
  throw new Error(`local close cannot be converted to UTC: ${key}`);
}
function assertRoundTrip(record: JurisdictionDeadline) {
  if (!timestamp(record.closeAt) || record.closeAt.nanoseconds !== 0) throw new Error(`invalid lossless closeAt timestamp: ${record.electionId}`);
  const parts = partsAt(record.closeAt.seconds, record.timeZone);
  if (`${parts.year}-${parts.month}-${parts.day}` !== record.electionDate || `${parts.hour}:${parts.minute}` !== record.localPollClosingTime) throw new Error(`deadline UTC timestamp does not round-trip for ${record.electionId}`);
}
function unique(values: string[], label: string) { if (new Set(values).size !== values.length) throw new Error(`duplicate ${label}`); }

/** Product locks are immutable policy data, never derived from a host timezone or poll-close research. */
export function validateProductLockPolicy(value: unknown): ProductLockPolicy {
  if (!isRecord(value)) throw new Error('missing product lock policy');
  const policy = value as unknown as ProductLockPolicy;
  if (policy.id !== PRODUCT_LOCK_POLICY_ID || policy.version !== PRODUCT_LOCK_POLICY_VERSION || policy.electionDate !== GENERAL_ELECTION_DATE
    || policy.scope !== 'all-canonical-2026-federal-contests' || policy.status !== 'approved_product_policy'
    || !timestamp(policy.closeAt) || policy.closeAt.seconds !== PRODUCT_LOCK_CLOSE_AT.seconds || policy.closeAt.nanoseconds !== PRODUCT_LOCK_CLOSE_AT.nanoseconds
    || !text(policy.rationale) || !text(policy.supersession) || !text(policy.electionDateSourceUrl) || !text(policy.reviewedAt)) throw new Error('invalid canonical 2026 product lock policy');
  assertOfficialUrl(policy.electionDateSourceUrl, new Set()); assertIso(policy.reviewedAt, 'product lock policy reviewedAt');
  return { ...policy, closeAt: { ...policy.closeAt } };
}

export function generateProductLockRecords(value: unknown): ProductLockRecord[] {
  const policy = validateProductLockPolicy(value);
  return canonicalSeats.map((seat) => ({ electionId: seat.id, electionDate: policy.electionDate, closeAt: { ...policy.closeAt }, deadlineKind: 'product_safety_lock' as const,
    lockPolicyId: policy.id, lockPolicyVersion: policy.version, lockReason: policy.rationale, electionDateSourceUrl: policy.electionDateSourceUrl, reviewedAt: policy.reviewedAt }));
}

/** Validates generated publication records without accepting them as a mutable source of authority. */
export function validateGeneratedDeadlineRecords(value: unknown, requireComplete = true): JurisdictionDeadline[] {
  if (!Array.isArray(value)) throw new Error('generated deadline records must be an array');
  const records = value.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`malformed generated deadline record ${index}`);
    const record = raw as unknown as JurisdictionDeadline;
    const seat = seatById.get(record.electionId);
    if (!seat || seat.state !== record.jurisdiction || !text(record.sourceName) || !text(record.sourceUrl) || !text(record.citation) || !text(record.notes) || record.reviewerStatus !== 'reviewed' || !Array.isArray(record.sourceRuleIds) || !record.sourceRuleIds.length) throw new Error(`malformed generated deadline record: ${record.electionId || index}`);
    assertDate(record.electionDate, `election date for ${record.electionId}`); if (record.electionDate !== GENERAL_ELECTION_DATE) throw new Error(`unexpected election date for ${record.electionId}`);
    assertTime(record.localPollClosingTime, `close time for ${record.electionId}`); assertZone(record.timeZone); assertIso(record.retrievedAt, `retrievedAt for ${record.electionId}`); assertIso(record.reviewedAt, `reviewedAt for ${record.electionId}`); assertRoundTrip(record);
    if (record.multiTimeZone?.treatment === ('statewide-latest-close' as string)) throw new Error(`unsafe latest-close policy: ${record.electionId}`);
    return record;
  });
  unique(records.map((record) => record.electionId), 'generated deadline election ID');
  const missing = canonicalSeats.map((seat) => seat.id).filter((id) => !records.some((record) => record.electionId === id));
  if (requireComplete && missing.length) throw new Error(`generated deadline records are incomplete: ${missing.join(', ')}`);
  return sorted(records, (record) => record.electionId);
}

/** Validates reviewed authority evidence and generates every seat record deterministically; no handwritten record layer exists. */
export function generateDeadlineRecords(value: unknown, options: { requireComplete?: boolean } = {}): JurisdictionDeadline[] {
  if (!isRecord(value) || value.schemaVersion !== DEADLINE_REGISTRY_SCHEMA_VERSION || !Array.isArray(value.authorityRules) || !Array.isArray(value.seatAssignments)) throw new Error('unsupported jurisdiction deadline registry version');
  validateProductLockPolicy(value.productLockPolicy);
  const allowlist = new Set((Array.isArray(value.authorityAllowlist) ? value.authorityAllowlist : []).map((entry) => {
    if (!isRecord(entry) || !text(entry.host) || !text(entry.evidenceUrl) || !text(entry.notes)) throw new Error('malformed official authority allowlist');
    assertOfficialUrl(text(entry.evidenceUrl), new Set()); return text(entry.host).toLowerCase();
  }));
  const rules = (value.authorityRules as unknown[]).map((raw, index) => {
    if (!isRecord(raw) || !Array.isArray(raw.closingTimes)) throw new Error(`malformed deadline authority rule ${index}`);
    const rule = raw as unknown as AuthorityRule;
    if (!text(rule.id) || !text(rule.jurisdiction) || !text(rule.sourceName) || !text(rule.citation) || !text(rule.applicabilityBasis) || !text(rule.researcher) || !text(rule.reviewer) || !text(rule.notes) || rule.reviewStatus !== 'reviewed' || rule.conflictDisposition !== 'none' || !['uniform-statewide', 'district-specific-earliest-close', 'statewide-earliest-close', 'local-option-earliest-close'].includes(rule.scope)) throw new Error(`incomplete reviewed authority rule: ${rule.id || index}`);
    assertDate(rule.electionDate, `election date for ${rule.id}`); if (rule.electionDate !== GENERAL_ELECTION_DATE) throw new Error(`unexpected election date for ${rule.id}`);
    assertOfficialUrl(rule.sourceUrl, allowlist); assertIso(rule.retrievedAt, `retrievedAt for ${rule.id}`); assertIso(rule.reviewedAt, `reviewedAt for ${rule.id}`); if (Date.parse(rule.reviewedAt) < Date.parse(rule.retrievedAt)) throw new Error(`reviewedAt precedes retrievedAt for ${rule.id}`);
    if (rule.closingTimes.length === 0) throw new Error(`authority rule has no closing time: ${rule.id}`);
    unique(rule.closingTimes.map((closing) => closing.id), `closing-time ID in ${rule.id}`);
    for (const closing of rule.closingTimes) { if (!text(closing.id)) throw new Error(`missing closing-time ID in ${rule.id}`); assertTime(closing.localPollClosingTime, `close time in ${rule.id}`); assertZone(closing.timeZone); }
    if (rule.scope === 'uniform-statewide' && rule.closingTimes.length !== 1) throw new Error(`uniform-statewide rule has multiple closing times: ${rule.id}`);
    return { ...rule, closingTimes: sorted(rule.closingTimes.map((closing) => ({ ...closing, districts: closing.districts ? [...closing.districts].sort() : undefined, counties: closing.counties ? [...closing.counties].sort() : undefined })), (closing) => closing.id) };
  });
  unique(rules.map((rule) => rule.id), 'authority rule ID');
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const assignments = (value.seatAssignments as unknown[]).flatMap((raw, index) => {
    if (!isRecord(raw) || !Array.isArray(raw.ruleIds) || !Array.isArray(raw.closingTimeIds)) throw new Error(`malformed seat assignment ${index}`);
    const assignment = raw as unknown as SeatDeadlineAssignment;
    const electionIds = assignment.electionId ? [assignment.electionId] : assignment.electionIds;
    if ((assignment.electionId && assignment.electionIds) || !Array.isArray(electionIds) || !electionIds.length || !electionIds.every((electionId) => canonicalIds.has(electionId)) || !text(assignment.assignmentBasis) || !['uniform-statewide', 'district-specific-earliest-close', 'statewide-earliest-close', 'local-option-earliest-close'].includes(assignment.policy)) throw new Error(`invalid seat assignment: ${assignment.electionId || index}`);
    unique(electionIds, `election ID in assignment ${index}`); unique(assignment.ruleIds, `rule ID in assignment ${index}`); unique(assignment.closingTimeIds, `closing-time ID in assignment ${index}`);
    if (!assignment.ruleIds.length || !assignment.closingTimeIds.length) throw new Error(`seat assignment lacks evidence: ${index}`);
    return electionIds.map((electionId) => ({ electionId, ruleIds: [...assignment.ruleIds].sort(), closingTimeIds: [...assignment.closingTimeIds].sort(), policy: assignment.policy, assignmentBasis: assignment.assignmentBasis }));
  });
  unique(assignments.map((assignment) => assignment.electionId), 'seat assignment election ID');
  const missing = canonicalSeats.map((seat) => seat.id).filter((id) => !assignments.some((assignment) => assignment.electionId === id));
  if (options.requireComplete !== false && missing.length) throw new Error(`deadline registry is incomplete: ${missing.join(', ')}`);
  const records = assignments.map((assignment) => {
    const seat = seatById.get(assignment.electionId)!;
    const selected = assignment.ruleIds.flatMap((ruleId) => {
      const rule = rulesById.get(ruleId); if (!rule) throw new Error(`assignment references missing rule ${ruleId}: ${assignment.electionId}`);
      if (rule.jurisdiction !== seat.state) throw new Error(`assignment jurisdiction mismatch: ${assignment.electionId}/${ruleId}`);
      return rule.closingTimes.filter((closing) => assignment.closingTimeIds.includes(`${rule.id}/${closing.id}`)).map((closing) => ({ rule, closing, closeAt: closeAtForLocalTime(rule.electionDate, closing.localPollClosingTime, closing.timeZone) }));
    });
    if (selected.length !== assignment.closingTimeIds.length) throw new Error(`assignment closing-time evidence mismatch: ${assignment.electionId}`);
    const earliest = sorted(selected, (entry) => `${String(entry.closeAt.seconds).padStart(12, '0')}/${entry.rule.id}/${entry.closing.id}`)[0]!;
    if (assignment.policy === 'uniform-statewide' && selected.length !== 1) throw new Error(`uniform assignment has multiple closes: ${assignment.electionId}`);
    if (selected.length > 1 && assignment.policy === 'uniform-statewide') throw new Error(`multi-zone contest must use earliest-close policy: ${assignment.electionId}`);
    const timeZones = new Set(selected.map((entry) => entry.closing.timeZone));
    const sourceRules = sorted([...new Set(selected.map((entry) => entry.rule))], (rule) => rule.id);
    const record: JurisdictionDeadline = { electionId: seat.id, jurisdiction: seat.state, electionDate: earliest.rule.electionDate, localPollClosingTime: earliest.closing.localPollClosingTime, timeZone: earliest.closing.timeZone, closeAt: earliest.closeAt,
      sourceRuleIds: sourceRules.map((rule) => rule.id), sourceName: earliest.rule.sourceName, sourceUrl: earliest.rule.sourceUrl, citation: earliest.rule.citation, retrievedAt: earliest.rule.retrievedAt, reviewedAt: earliest.rule.reviewedAt, reviewerStatus: 'reviewed', notes: `${assignment.assignmentBasis} ${earliest.rule.notes}`,
      ...(timeZones.size > 1 || assignment.policy !== 'uniform-statewide' ? { multiTimeZone: { treatment: assignment.policy === 'uniform-statewide' ? 'statewide-earliest-close' : assignment.policy, basis: assignment.assignmentBasis } } : {}),
    };
    assertRoundTrip(record); return record;
  });
  return validateGeneratedDeadlineRecords(records, options.requireComplete !== false);
}
export function auditDeadlineRegistry(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== DEADLINE_REGISTRY_SCHEMA_VERSION || !Array.isArray(value.authorityRules) || !Array.isArray(value.seatAssignments)) throw new Error('unsupported jurisdiction deadline registry version');
  const policy = validateProductLockPolicy(value.productLockPolicy);
  const records = generateDeadlineRecords(value, { requireComplete: false });
  const locks = generateProductLockRecords(policy);
  const assigned = new Set(records.map((record) => record.electionId));
  const unresolvedElectionIds = canonicalSeats.map((seat) => seat.id).filter((id) => !assigned.has(id));
  return { reviewedAuthorityRules: value.authorityRules.length, reviewedStates: new Set(value.authorityRules.filter(isRecord).map((rule) => text(rule.jurisdiction))).size, generatedCanonicalRecords: records.length, unresolvedElectionIds, records, lockPolicyId: policy.id, federalLockCoverage: locks.length, publicationLockReady: locks.length === canonicalSeats.length };
}
export function normalizeDeadlineRegistry(value: unknown): DeadlineRegistry {
  // Generation performs strict validation without retaining a mutable manual record surface.
  validateProductLockPolicy(isRecord(value) ? value.productLockPolicy : undefined);
  generateDeadlineRecords(value, { requireComplete: false });
  const registry = value as DeadlineRegistry;
  return { schemaVersion: DEADLINE_REGISTRY_SCHEMA_VERSION, productLockPolicy: validateProductLockPolicy(registry.productLockPolicy), authorityRules: sorted(registry.authorityRules, (rule) => rule.id), seatAssignments: sorted(registry.seatAssignments, (assignment) => assignment.electionId ?? (assignment.electionIds ?? []).join(',')), ...(registry.authorityAllowlist ? { authorityAllowlist: sorted(registry.authorityAllowlist, (entry) => entry.host) } : {}) };
}
export function deadlineCoverageReport(value: unknown): DeadlineCoverageReport {
  const registry = normalizeDeadlineRegistry(value); const records = generateDeadlineRecords(registry, { requireComplete: false }); const locks = generateProductLockRecords(registry.productLockPolicy);
  const states = sorted([...new Set(records.map((record) => record.jurisdiction))].map((state) => { const stateRecords = records.filter((record) => record.jurisdiction === state); return { state, records: stateRecords.length, timeZones: [...new Set(stateRecords.map((record) => record.timeZone))].sort() }; }), (item) => item.state);
  const timeZones = sorted([...new Set(records.map((record) => record.timeZone))].map((timeZone) => ({ timeZone, records: records.filter((record) => record.timeZone === timeZone).length })), (item) => item.timeZone);
  return { reviewedAuthorityRules: registry.authorityRules.length, reviewedStates: new Set(registry.authorityRules.map((rule) => rule.jurisdiction)).size, total: records.length, singleTimeZoneRecords: records.filter((record) => !record.multiTimeZone).length, multiTimeZoneRecords: records.filter((record) => Boolean(record.multiTimeZone)).length, statewideEarliestCloseRecords: records.filter((record) => record.multiTimeZone?.treatment === 'statewide-earliest-close').length, districtSpecificEarliestCloseRecords: records.filter((record) => record.multiTimeZone?.treatment === 'district-specific-earliest-close').length, states, timeZones, digest: digest({ registry, records, locks }), lockPolicyId: registry.productLockPolicy.id, lockPolicyVersion: registry.productLockPolicy.version, federalLockCoverage: locks.length, contestsMissingCloseAt: canonicalSeats.length - locks.length, invalidTimestamps: locks.filter((lock) => !timestamp(lock.closeAt) || lock.closeAt.seconds > PRODUCT_LOCK_CLOSE_AT.seconds).length, publicationLockReady: locks.length === canonicalSeats.length, researchedContests: records.length, unresolvedOfficialResearch: canonicalSeats.length - records.length, officialResearchComplete: records.length === canonicalSeats.length, officialPollCloseKinds: { fixed: records.length, conditional: 0, 'local-option': 0, range: 0, unknown: canonicalSeats.length - records.length } };
}
export function serializeDeadlineRegistry(value: unknown) { return `${JSON.stringify(normalizeDeadlineRegistry(value), null, 2)}\n`; }
