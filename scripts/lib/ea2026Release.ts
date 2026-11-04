import { createHash } from 'node:crypto';
import { HOUSE_SEATS_BY_STATE, CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';

export const EA_STATES = Object.keys(HOUSE_SEATS_BY_STATE).sort();
export const EA_SCOPES = ['House', 'Senate', 'Governor', 'Measure'] as const;
export const PROFILE_FIELDS = ['biography', 'positions', 'website', 'photo', 'finance', 'service'] as const;
export type Scope = typeof EA_SCOPES[number];
export type Json = Record<string, unknown>;
export type Source = {
  id: string; url: string; sha256: string; retrievedAt: string; reviewedAt: string;
  reviewer: string; kind: 'election_authority' | 'government' | 'campaign';
  authority: string; locator: string;
};
export type ProfileField = {
  status: 'present' | 'unavailable' | 'not_applicable' | 'unreviewed';
  value?: string | string[]; reason?: string; sourceIds: string[];
  attribution?: 'government_record' | 'candidate_statement';
};
export type CandidateProfile = Record<typeof PROFILE_FIELDS[number], ProfileField>;
export type Candidate = {
  id: string; name: string; party: string; ballotSourceIds: string[];
  qualificationStatus: 'on_ballot' | 'qualified_write_in' | 'withdrawn' | 'inactive';
  externalIds?: { fecCandidateId?: string; bioguideId?: string };
  profile: CandidateProfile;
};
export type Contest = {
  id: string; state: string; office: Scope; electionDate: string;
  seatKind: 'regular' | 'special'; district?: string; senateClass?: number;
  sourceIds: string[]; candidates: Candidate[];
  title?: string; description?: string; fullTextUrl?: string;
  fiscalAnalysis?: ProfileField; eligibleOptions?: string[];
  measureIdentity?: { officialNumber: string; officialAliases: string[]; legacyTitle: string; legacyRegistryDigest: string; sourceIds: string[] };
  metrics: Record<'historical' | 'turnout' | 'demographics', ProfileField>;
};
export type Coverage = {
  state: string; authorityUrl: string;
  scopes: Record<Scope, {
    status: 'unreviewed' | 'available' | 'officially_none' | 'not_yet_published' | 'blocked';
    expectedContestIds: string[]; sourceIds: string[]; reason?: string;
  }>;
};
export type ReleaseInput = {
  schemaVersion: 1; releaseId: string; asOf: string;
  sources: Source[]; coverage: Coverage[]; contests: Contest[];
};
export type ReleaseDocument = { path: string; data: Json };
export type ReleaseBundle = {
  contract: 'politipiks-ea-release/v1'; releaseId: string; generation: string; asOf: string;
  inputDigest: string; sourceDigests: Record<string, string>; coverage: Coverage[];
  counts: { states: number; races: number; measures: number; candidates: number; profiles: number; metrics: number; documents: number };
  documents: ReleaseDocument[]; selector: Json; digest: string;
};
export const canonical = (v: unknown): string => {
  if (v === null || typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
  throw new Error('non-JSON release value');
};
export const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
const record = (x: unknown): x is Json => !!x && typeof x === 'object' && !Array.isArray(x);
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const nonempty = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x);
const iso = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(x) && Number.isFinite(Date.parse(x));
function https(x: unknown): x is string {
  if (!nonempty(x)) return false;
  try { const u = new URL(x); return u.protocol === 'https:' && !u.username && !u.password && !/[?&](key|api_key|token)=/i.test(x); } catch { return false; }
}
function unique(values: string[], label: string) { requireThat(new Set(values).size === values.length, `duplicate ${label}`); }
function refs(ids: unknown, sources: Map<string, Source>, official = false): asserts ids is string[] {
  requireThat(Array.isArray(ids) && ids.length > 0, 'missing source references');
  unique(ids, 'source references');
  for (const key of ids) requireThat(typeof key === 'string' && sources.has(key) && (!official || sources.get(key)!.kind === 'election_authority'), 'unreviewed or non-official ballot source');
}
function field(value: unknown, sources: Map<string, Source>, label: string): asserts value is ProfileField {
  requireThat(record(value) && ['present', 'unavailable', 'not_applicable'].includes(String(value.status)), `unreviewed ${label}`);
  refs(value.sourceIds, sources);
  if (value.status === 'present') {
    requireThat(nonempty(value.value) || (Array.isArray(value.value) && value.value.length > 0 && value.value.every(nonempty)), `empty ${label}`);
    if (label === 'website' || label === 'photo') requireThat(https(value.value), `invalid ${label} URL`);
    requireThat(['government_record', 'candidate_statement'].includes(String(value.attribution)), `missing ${label} attribution`);
    if ((value.sourceIds as string[]).some(key => sources.get(key)!.kind === 'campaign')) requireThat(value.attribution === 'candidate_statement', 'campaign claim must be attributed');
    if (label === 'photo') requireThat(nonempty(value.reason), 'photo needs reuse basis');
  } else {
    requireThat(nonempty(value.reason) && value.value === undefined, `undocumented ${label} absence`);
  }
}

/** Returns incomplete coverage as blockers; structural corruption is always an error. */
export function assessRelease(value: unknown) {
  requireThat(record(value) && value.schemaVersion === 1 && id(value.releaseId) && iso(value.asOf), 'invalid release identity');
  requireThat(Array.isArray(value.sources) && Array.isArray(value.coverage) && Array.isArray(value.contests), 'invalid release arrays');
  canonical(value); // reject undefined, NaN, native timestamps and non-JSON inputs
  const input = value as unknown as ReleaseInput;
  const sources = new Map<string, Source>();
  const blockers: string[] = [];
  for (const s of input.sources) {
    requireThat(record(s) && id(s.id) && https(s.url) && /^[a-f0-9]{64}$/.test(s.sha256) && iso(s.retrievedAt) && iso(s.reviewedAt) && nonempty(s.reviewer) && nonempty(s.authority) && nonempty(s.locator) && ['election_authority', 'government', 'campaign'].includes(s.kind), 'invalid source evidence');
    requireThat(!sources.has(s.id), 'duplicate source ID');
    requireThat(Date.parse(s.retrievedAt) <= Date.parse(s.reviewedAt) && Date.parse(s.reviewedAt) <= Date.parse(input.asOf), 'invalid source review chronology');
    if (s.kind === 'election_authority' && Date.parse(input.asOf) - Date.parse(s.retrievedAt) > 7 * 86400000) blockers.push(`stale-ballot-source:${s.id}`);
    sources.set(s.id, s);
  }
  unique(input.coverage.map(x => x.state), 'state');
  requireThat(input.coverage.length === 50 && input.coverage.every(c => EA_STATES.includes(c.state) && https(c.authorityUrl) && record(c.scopes)), 'coverage must contain all 50 states');
  const expected = new Map<string, { state: string; scope: Scope }>();
  let reviewedStates = 0;
  for (const c of input.coverage) {
    let reviewed = true;
    for (const scope of EA_SCOPES) {
      const entry = c.scopes[scope];
      requireThat(record(entry) && ['unreviewed', 'available', 'officially_none', 'not_yet_published', 'blocked'].includes(entry.status) && Array.isArray(entry.expectedContestIds) && entry.expectedContestIds.every(id), 'invalid coverage scope');
      unique(entry.expectedContestIds, 'expected contest');
      if (entry.status === 'unreviewed' || entry.status === 'blocked') { blockers.push(`${c.state}:${scope}:${entry.status}`); reviewed = false; }
      else {
        refs(entry.sourceIds, sources, true);
        if (entry.status !== 'available') requireThat(nonempty(entry.reason), 'coverage exception needs official explanation');
        if (entry.status === 'officially_none') requireThat(entry.expectedContestIds.length === 0 && scope !== 'House', 'invalid officially-none scope');
        if (entry.status === 'available') requireThat(entry.expectedContestIds.length > 0, 'available scope cannot be empty');
      }
      for (const key of entry.expectedContestIds) {
        requireThat(!expected.has(key), 'contest declared in multiple scopes');
        expected.set(key, { state: c.state, scope });
      }
    }
    if (reviewed) reviewedStates += 1;
  }
  unique(input.contests.map(c => c.id), 'contest ID');
  let candidates = 0;
  let profilesReviewed = 0;
  for (const c of input.contests) {
    requireThat(record(c) && id(c.id) && EA_STATES.includes(c.state) && EA_SCOPES.includes(c.office) && /^2026-\d{2}-\d{2}$/.test(c.electionDate) && new Date(`${c.electionDate}T00:00:00Z`).toISOString().slice(0, 10) === c.electionDate && ['regular', 'special'].includes(c.seatKind), 'invalid contest identity');
    const declared = expected.get(c.id);
    requireThat(declared?.state === c.state && declared?.scope === c.office, 'contest outside reviewed inventory');
    const scopeStatus = input.coverage.find(state => state.state === c.state)!.scopes[c.office].status;
    refs(c.sourceIds, sources, true);
    if (Date.parse(`${c.electionDate}T00:00:00Z`) <= Date.parse(input.asOf)) blockers.push(`${c.id}:completed-or-current-election`);
    requireThat(Array.isArray(c.candidates), 'invalid candidates');
    unique(c.candidates.map(x => x.id), 'candidate ID within contest');
    if (c.office === 'Measure') {
      requireThat(c.candidates.length === 0 && nonempty(c.title) && nonempty(c.description) && https(c.fullTextUrl) && Array.isArray(c.eligibleOptions) && c.eligibleOptions.length >= 2 && c.eligibleOptions.every(id), 'incomplete measure');
      unique(c.eligibleOptions, 'measure option');
      if (c.measureIdentity) {
        const identity = c.measureIdentity;
        requireThat(nonempty(identity.officialNumber) && nonempty(identity.legacyTitle) && /^[a-f0-9]{64}$/.test(identity.legacyRegistryDigest) && Array.isArray(identity.officialAliases) && identity.officialAliases.length > 0 && identity.officialAliases.every(nonempty), 'invalid measure identity');
        unique(identity.officialAliases, 'measure aliases');
        refs(identity.sourceIds, sources, true);
      }
      field(c.fiscalAnalysis, sources, 'fiscalAnalysis');
    } else {
      requireThat(c.candidates.length > 0 || scopeStatus === 'not_yet_published', 'race has no candidates');
      requireThat(record(c.metrics), 'missing race context');
      for (const key of ['historical', 'turnout', 'demographics']) {
        if (c.metrics[key]?.status === 'unreviewed') blockers.push(`${c.id}:context:${key}`);
        else field(c.metrics[key], sources, key);
      }
      for (const candidate of c.candidates) {
        requireThat(record(candidate) && id(candidate.id) && nonempty(candidate.name) && nonempty(candidate.party) && ['on_ballot', 'qualified_write_in', 'withdrawn', 'inactive'].includes(candidate.qualificationStatus), 'invalid ballot candidate');
        refs(candidate.ballotSourceIds, sources, true);
        requireThat(record(candidate.profile), 'missing candidate profile');
        let profileComplete = true;
        for (const key of PROFILE_FIELDS) {
          if (candidate.profile[key]?.status === 'unreviewed') { blockers.push(`${c.id}:${candidate.id}:profile:${key}`); profileComplete = false; }
          else field(candidate.profile[key], sources, key);
        }
        candidates += 1;
        if (profileComplete) profilesReviewed += 1;
      }
      requireThat(c.candidates.some(x => ['on_ballot', 'qualified_write_in'].includes(x.qualificationStatus)) || scopeStatus === 'not_yet_published', 'race has no eligible ballot choices');
      if (scopeStatus === 'not_yet_published') requireThat(c.candidates.length === 0, 'unpublished scope cannot assert ballot choices');
    }
  }
  const imported = new Set(input.contests.map(x => x.id));
  for (const scheduled of CANONICAL_2026_FEDERAL_CONTESTS) {
    if (!expected.has(scheduled.id)) blockers.push(`missing-scheduled-federal-contest:${scheduled.id}`);
  }
  for (const key of expected.keys()) if (!imported.has(key)) blockers.push(`missing-contest:${key}`);
  return { input, sources, blockers: blockers.sort(), reviewedStates, expectedContests: expected.size, importedContests: imported.size, candidates, profilesReviewed, releaseReady: blockers.length === 0 && reviewedStates === 50 };
}

function profileWithSources(profile: CandidateProfile, sources: Map<string, Source>) {
  return Object.fromEntries(PROFILE_FIELDS.map(key => [key, { ...profile[key], sources: profile[key].sourceIds.map(id => sources.get(id)!) }]));
}

export function buildEaRelease(value: unknown): ReleaseBundle {
  const report = assessRelease(value);
  requireThat(report.releaseReady, `release incomplete: ${report.blockers.length} blockers`);
  const { input, sources } = report;
  const generation = `canonical-${input.releaseId}`;
  const documents: ReleaseDocument[] = [];
  let races = 0, measures = 0;
  for (const c of [...input.contests].sort((a, b) => a.id.localeCompare(b.id))) {
    // The existing general-election safety policy locks at 2026-11-03T00:00:00Z.
    // Other election dates use the same conservative start-of-date UTC boundary.
    const closeAt = { __firestoreType: 'timestamp/v1', seconds: Date.parse(`${c.electionDate}T00:00:00Z`) / 1000, nanoseconds: 0 };
    const common = { id: c.id, state: c.state, electionYear: 2026, mode: 'live', status: 'upcoming', closeDate: c.electionDate, electionDate: c.electionDate, closeAt, deadlineKind: 'product_safety_lock', registryGeneration: generation, catalogReady: true, predictionReady: true, sourceUrl: sources.get(c.sourceIds[0])!.url, lastRefreshedAt: input.asOf, sourceIds: c.sourceIds, verificationLevel: 'official', seatKind: c.seatKind };
    if (c.office === 'Measure') {
      measures += 1;
      documents.push({ path: `ballotMeasures/${c.id}`, data: { ...common, catalogScope: 'canonical-2026-measures', title: c.title!, description: c.description!, fullTextUrl: c.fullTextUrl!, eligibleOptions: c.eligibleOptions!, qualificationStatus: 'on_ballot', ...(c.measureIdentity ? { measureIdentity: c.measureIdentity, officialNumber: c.measureIdentity.officialNumber, officialAliases: c.measureIdentity.officialAliases } : {}) } });
      documents.push({ path: `ballotMeasures/${c.id}/research/baseline`, data: { measureId: c.id, registryGeneration: generation, fiscalAnalysis: c.fiscalAnalysis!, sources: c.sourceIds.map(key => sources.get(key)!) } });
    } else {
      races += 1;
      const normalized = c.candidates.map(candidate => {
        const eligible = ['on_ballot', 'qualified_write_in'].includes(candidate.qualificationStatus);
        return { id: candidate.id, name: candidate.name, party: candidate.party, externalIds: candidate.externalIds ?? {}, qualificationStatus: candidate.qualificationStatus === 'qualified_write_in' ? 'qualified' : candidate.qualificationStatus, ballotChoiceKind: candidate.qualificationStatus === 'qualified_write_in' ? 'write_in' : 'printed', candidateState: eligible ? 'active' : candidate.qualificationStatus, pickEligibility: eligible ? 'eligible' : 'ineligible', ballotSourceUrl: sources.get(candidate.ballotSourceIds[0])!.url, ...(candidate.profile.website.status === 'present' ? { websiteUrl: candidate.profile.website.value } : {}) };
      });
      documents.push({ path: `races/${c.id}`, data: { ...common, predictionReady: normalized.some(x => x.pickEligibility === 'eligible'), office: c.office, district: c.district ?? null, senateClass: c.senateClass ?? null, catalogScope: c.office === 'Governor' ? 'gubernatorial' : 'federal', candidates: normalized, eligibleCandidateIds: normalized.filter(x => x.pickEligibility === 'eligible').map(x => x.id), researchReady: true, metricsReady: true } });
      for (const candidate of c.candidates) documents.push({ path: `races/${c.id}/candidateResearch/${candidate.id}`, data: { raceId: c.id, candidateId: candidate.id, registryGeneration: generation, profile: profileWithSources(candidate.profile, sources) } });
      documents.push({ path: `contestMetrics/${c.id}`, data: { raceId: c.id, registryGeneration: generation, reviewedContext: Object.fromEntries(Object.entries(c.metrics).map(([key, value]) => [key, { ...value, sources: value.sourceIds.map(id => sources.get(id)!) }])) } });
    }
  }
  documents.sort((a, b) => a.path.localeCompare(b.path));
  unique(documents.map(x => x.path), 'document path');
  const payload = { contract: 'politipiks-ea-release/v1' as const, releaseId: input.releaseId, generation, asOf: input.asOf, inputDigest: digest(input), sourceDigests: Object.fromEntries(input.sources.map(s => [s.id, s.sha256]).sort(([a], [b]) => a.localeCompare(b))), coverage: [...input.coverage].sort((a, b) => a.state.localeCompare(b.state)), counts: { states: 50, races, measures, candidates: report.candidates, profiles: report.profilesReviewed, metrics: races, documents: documents.length }, documents, selector: { state: 'active', activeFederalGeneration: generation, activeGubernatorialGeneration: generation, activeMeasureGeneration: generation, releaseId: input.releaseId, releaseContract: 'politipiks-ea-release/v1' } };
  return { ...payload, digest: digest(payload) };
}

export function initialCoverage(registry: { states: Array<{ state: string; authorityUrl: string }> }): Coverage[] {
  return registry.states.map(s => ({ state: s.state, authorityUrl: s.authorityUrl, scopes: Object.fromEntries(EA_SCOPES.map(scope => [scope, { status: 'unreviewed', expectedContestIds: [], sourceIds: [], reason: 'Current official inventory and ballot sources have not been reviewed for this release.' }])) as Coverage['scopes'] })).sort((a, b) => a.state.localeCompare(b.state));
}
