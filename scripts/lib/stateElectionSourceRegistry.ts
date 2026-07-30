import { createHash } from 'node:crypto';

export const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'] as const;
export type Capability = 'candidateList' | 'governorRace' | 'statewideMeasure';
export type Format = 'API' | 'JSON' | 'CSV' | 'XLSX' | 'HTML' | 'PDF' | 'reviewed-manual' | 'unavailable';
export type Status = 'available' | 'preliminary' | 'not_yet_published' | 'officially_none' | 'access_blocked' | 'unresolved';
export type Wave = 'A' | 'B' | 'C' | 'D';
type Row = { state:string; authorityName:string; authorityUrl:string; candidateListUrl?:string; governorRaceUrl?:string; statewideMeasureUrl?:string; capabilities:Capability[]; format:Format; publicationStatus:Status; accessRequirements:'public'|'login'|'captcha'|'unknown'; electionApplicability:'2026_general'|'unknown'; expectedPublicationTiming?:string; checkedAt:string; sourceUpdatedAt?:string; nextReviewAt?:string; extractionMode?:'reviewed_text_fixture'|'born_digital_text'; evidenceUrls:string[]; reviewedEvidenceDigest?:string; reviewedEvidenceVersion?:1; adapterStatus:'not_implemented'|'fixture_proven'|'implemented'; wave:Wave; refreshCadenceDays:number; staleAfterDays:number; reason:string };
type Registry = { schemaVersion:1; states:Row[] };
const record = (value:unknown): value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value:unknown) => typeof value === 'string' ? value.trim() : '';
const canonical = (value:unknown):string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : record(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const hash = (value:unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const iso = (value:unknown) => Boolean(text(value)) && !Number.isNaN(Date.parse(text(value)));
const https = (value:unknown) => /^https:\/\//.test(text(value));

export function normalizeRegistry(value:unknown):Registry {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.states) || value.states.length !== 50) throw Error('registry must contain exactly 50 states');
  const seen = new Set<string>();
  const states = (value.states as Row[]).map((row) => {
    const state = text(row?.state);
    if (!record(row) || !STATES.includes(state as typeof STATES[number]) || seen.has(state) || !https(row.authorityUrl) || !text(row.authorityName) || !Array.isArray(row.capabilities) || row.capabilities.some((capability) => !['candidateList','governorRace','statewideMeasure'].includes(text(capability))) || new Set(row.capabilities).size !== row.capabilities.length || !Array.isArray(row.evidenceUrls) || !row.evidenceUrls.length || !row.evidenceUrls.every(https) || !['API','JSON','CSV','XLSX','HTML','PDF','reviewed-manual','unavailable'].includes(text(row.format)) || !['available','preliminary','not_yet_published','officially_none','access_blocked','unresolved'].includes(text(row.publicationStatus)) || !['public','login','captcha','unknown'].includes(text(row.accessRequirements)) || !['2026_general','unknown'].includes(text(row.electionApplicability)) || !['not_implemented','fixture_proven','implemented'].includes(text(row.adapterStatus)) || !['A','B','C','D'].includes(text(row.wave)) || !iso(row.checkedAt) || !(row.nextReviewAt === undefined || iso(row.nextReviewAt)) || !(row.extractionMode === undefined || ['reviewed_text_fixture','born_digital_text'].includes(text(row.extractionMode))) || !Number.isInteger(row.refreshCadenceDays) || !Number.isInteger(row.staleAfterDays) || !text(row.reason)) throw Error(`invalid state source record: ${state}`);
    seen.add(state);
    if (row.publicationStatus === 'officially_none' && !row.evidenceUrls.length) throw Error(`officially_none needs evidence: ${state}`);
    if ((row.adapterStatus === 'fixture_proven' || row.adapterStatus === 'implemented') && row.format === 'reviewed-manual') throw Error(`manual source cannot claim adapter: ${state}`);
    if (row.publicationStatus === 'not_yet_published' && (row.wave === 'B' || row.wave === 'C') && !iso(row.nextReviewAt)) throw Error(`Wave ${row.wave} unpublished source requires next review: ${state}`);
    if (row.wave === 'C' && row.adapterStatus === 'implemented' && !row.extractionMode) throw Error(`Wave C implemented source requires extraction mode: ${state}`);
    if (row.wave === 'D') {
      if (!iso(row.nextReviewAt) || row.evidenceUrls.length !== 3 || !/^[a-f0-9]{64}$/.test(text(row.reviewedEvidenceDigest)) || row.reviewedEvidenceVersion !== 1) throw Error(`Wave D requires versioned reviewed evidence and next review: ${state}`);
      if (/publication endpoints require review/i.test(row.reason)) throw Error(`generic Wave D placeholder rejected: ${state}`);
    }
    return { ...row, state, capabilities:[...row.capabilities].sort(), evidenceUrls:[...row.evidenceUrls].sort() };
  }).sort((left, right) => left.state.localeCompare(right.state));
  if (seen.size !== 50) throw Error('missing state records');
  return { schemaVersion:1, states };
}
export const registryDigest = (value:unknown) => hash(normalizeRegistry(value));
export function auditRegistry(value:unknown) {
  const registry = normalizeRegistry(value);
  const count = (field:(row:Row)=>string) => Object.fromEntries([...new Set(registry.states.map(field))].sort().map((key) => [key, registry.states.filter((row) => field(row) === key).length]));
  const unresolved = registry.states.filter((row) => row.publicationStatus === 'unresolved' || row.publicationStatus === 'access_blocked').map((row) => ({ state:row.state, reason:row.reason }));
  return { registryDigest:registryDigest(registry), planDigest:hash({ states:registry.states.map((row) => ({ state:row.state,wave:row.wave,capabilities:row.capabilities,publicationStatus:row.publicationStatus,reviewedEvidenceDigest:row.reviewedEvidenceDigest ?? null })) }), counts:{ format:count((row) => row.format), status:count((row) => row.publicationStatus), wave:count((row) => row.wave), capability:Object.fromEntries((['candidateList','governorRace','statewideMeasure'] as Capability[]).map((capability) => [capability,registry.states.filter((row) => row.capabilities.includes(capability)).length])) }, unresolved };
}
