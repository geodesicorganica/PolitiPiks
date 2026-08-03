export type EvidenceAvailability = 'present' | 'partial' | 'unavailable' | 'not_applicable' | 'stale' | 'source_error';
export type EvidenceSource = { sourceId?: string; sourceUrl?: string; asOf?: string; retrievedAt?: string; sourceVintage?: string; methodology?: string };
export type EvidenceField = EvidenceSource & { availability: EvidenceAvailability; reason?: string; value?: unknown };
export type FinanceEvidence = EvidenceSource & { availability: EvidenceAvailability; reason?: string; filingPeriod?: string; cycle?: number; totalReceipts?: number; totalDisbursements?: number; cashOnHand?: number; debtsOwed?: number };
export type CongressBill = { identifier: string; title: string; introducedDate?: string; sourceUrl?: string };
export type CongressVote = { chamber: string; rollNumber: number; date: string; title: string; vote: string; result?: string; sourceUrl: string };
export type CongressEvidence = { availability: EvidenceAvailability; reason?: string; methodology?: string; bioguideId?: string; officialName?: string; chamber?: string; state?: string; sourceUrl?: string; retrievedAt?: string; sponsored: CongressBill[]; cosponsored: CongressBill[]; votes: CongressVote[] };
export type HistoricalEvidence = EvidenceSource & { availability: EvidenceAvailability; reason?: string; electionYear?: number; demVotes?: number; repVotes?: number; totalVotes?: number; marginPct?: number };
export type TurnoutEvidence = EvidenceSource & { availability: EvidenceAvailability; reason?: string; electionYear?: number; votes?: number; cvapEstimate?: number; turnoutProxy?: number };
export type CvapEvidence = EvidenceSource & { availability: EvidenceAvailability; reason?: string; geography?: string; state?: string; district?: string | null; estimateVintage?: number; congressVintage?: number | null; cvapEstimate?: number; label?: string };
export type CanonicalEvidenceView = { identity: EvidenceField; filing: EvidenceField; finance: FinanceEvidence; congress: CongressEvidence; historical: HistoricalEvidence; turnout: TurnoutEvidence; cvap: CvapEvidence; issues: string[] };

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const availability = (value: unknown): EvidenceAvailability => ['present','partial','unavailable','not_applicable','stale','source_error'].includes(String(value)) ? value as EvidenceAvailability : 'unavailable';
const source = (value: Json): EvidenceSource => ({ sourceId: string(value.sourceId), sourceUrl: string(value.sourceUrl), asOf: string(value.asOf), retrievedAt: string(value.retrievedAt), sourceVintage: string(value.sourceVintage), methodology: string(value.methodology) });
const field = (value: unknown, fallback: string): EvidenceField => isRecord(value) ? { availability: availability(value.availability), reason: string(value.reason), value: value.value, ...source(value) } : { availability: 'unavailable', reason: fallback };
const list = (value: unknown) => Array.isArray(value) ? value : [];

function parseBill(value: unknown): CongressBill | null {
  if (!isRecord(value) || !string(value.identifier) || !string(value.title)) return null;
  return { identifier: string(value.identifier)!, title: string(value.title)!, introducedDate: string(value.introducedDate), sourceUrl: string(value.sourceUrl) };
}
function parseVote(value: unknown): CongressVote | null {
  if (!isRecord(value) || !string(value.chamber) || number(value.rollNumber) === undefined || !string(value.date) || !string(value.title) || !string(value.vote) || !string(value.sourceUrl)) return null;
  return { chamber: string(value.chamber)!, rollNumber: number(value.rollNumber)!, date: string(value.date)!, title: string(value.title)!, vote: string(value.vote)!, result: string(value.result), sourceUrl: string(value.sourceUrl)! };
}

export function parseCanonicalEvidence(researchValue: unknown, metricsValue: unknown): CanonicalEvidenceView {
  const issues: string[] = []; const research = isRecord(researchValue) ? researchValue : {}; const metrics = isRecord(metricsValue) ? metricsValue : {};
  if (researchValue !== null && !isRecord(researchValue)) issues.push('Candidate research has an unsupported shape.');
  if (metricsValue !== null && !isRecord(metricsValue)) issues.push('Contest metrics have an unsupported shape.');
  const baseline = isRecord(research.baselineResearch) && isRecord(research.baselineResearch.fields) ? research.baselineResearch.fields : {};
  const financeRaw = isRecord(research.fecFinance) ? research.fecFinance : {};
  const financeValues = isRecord(financeRaw.values) ? financeRaw.values : {};
  const finance: FinanceEvidence = { availability: availability(financeRaw.availability ?? (isRecord(baseline.finance) ? baseline.finance.availability : undefined)), reason: string(financeRaw.reason) ?? (isRecord(baseline.finance) ? string(baseline.finance.reason) : undefined), filingPeriod: string(financeRaw.filingPeriod), cycle: number(financeRaw.cycle), totalReceipts: number(financeValues.totalReceipts), totalDisbursements: number(financeValues.totalDisbursements), cashOnHand: number(financeValues.cashOnHand), debtsOwed: number(financeValues.debtsOwed), ...source(financeRaw) };
  if (finance.availability === 'present' && [finance.totalReceipts, finance.totalDisbursements, finance.cashOnHand, finance.debtsOwed].every((item) => item === undefined)) { finance.availability = 'unavailable'; finance.reason = 'The finance record did not contain displayable totals.'; issues.push('Malformed finance totals were withheld.'); }
  const congressRaw = isRecord(research.congressDepth) ? research.congressDepth : {};
  const profile = isRecord(congressRaw.profile) ? congressRaw.profile : {};
  const sponsoredRaw = list(congressRaw.sponsored); const cosponsoredRaw = list(congressRaw.cosponsored); const votesRaw = list(congressRaw.votes);
  const sponsored = sponsoredRaw.map(parseBill).filter((item): item is CongressBill => item !== null); const cosponsored = cosponsoredRaw.map(parseBill).filter((item): item is CongressBill => item !== null); const votes = votesRaw.map(parseVote).filter((item): item is CongressVote => item !== null);
  if (sponsored.length !== sponsoredRaw.length || cosponsored.length !== cosponsoredRaw.length || votes.length !== votesRaw.length) issues.push('Malformed legislative records were withheld.');
  const congress: CongressEvidence = { availability: availability(congressRaw.availability), reason: string(congressRaw.reason), methodology: string(congressRaw.methodology), bioguideId: string(congressRaw.bioguideId), officialName: string(profile.officialName), chamber: string(profile.chamber), state: string(profile.state), sourceUrl: string(profile.sourceUrl) ?? string(congressRaw.sourceUrl), retrievedAt: string(profile.retrievedAt), sponsored, cosponsored, votes };
  const historicalRaw = isRecord(metrics.historical) ? metrics.historical : {};
  const turnoutRaw = isRecord(metrics.turnout) ? metrics.turnout : {};
  const cvapRaw = isRecord(metrics.demographics) ? metrics.demographics : {};
  const historical: HistoricalEvidence = { availability: availability(historicalRaw.availability), reason: string(historicalRaw.reason), electionYear: number(historicalRaw.electionYear), demVotes: number(historicalRaw.demVotes), repVotes: number(historicalRaw.repVotes), totalVotes: number(historicalRaw.totalVotes), marginPct: number(historicalRaw.marginPct), ...source(historicalRaw) };
  const turnout: TurnoutEvidence = { availability: availability(turnoutRaw.availability), reason: string(turnoutRaw.reason), electionYear: number(turnoutRaw.electionYear), votes: number(turnoutRaw.votes), cvapEstimate: number(turnoutRaw.cvapEstimate), turnoutProxy: number(turnoutRaw.turnoutProxy), ...source(turnoutRaw) };
  const cvap: CvapEvidence = { availability: availability(cvapRaw.availability), reason: string(cvapRaw.reason), geography: string(cvapRaw.geography), state: string(cvapRaw.state), district: cvapRaw.district === null ? null : string(cvapRaw.district), estimateVintage: number(cvapRaw.estimateVintage), congressVintage: cvapRaw.congressVintage === null ? null : number(cvapRaw.congressVintage), cvapEstimate: number(cvapRaw.cvapEstimate), label: string(cvapRaw.label), ...source(cvapRaw) };
  return { identity: field(baseline.identity, 'Official identity evidence is unavailable.'), filing: field(baseline.filing, 'Official filing evidence is unavailable.'), finance, congress, historical, turnout, cvap, issues };
}

export const formatEvidenceCurrency = (value: number | undefined) => value === undefined ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export const formatEvidenceNumber = (value: number | undefined) => value === undefined ? 'Unavailable' : new Intl.NumberFormat('en-US').format(value);
export const partisanMarginLabel = (value: number | undefined) => value === undefined ? 'Unavailable' : value === 0 ? 'Even' : `${value > 0 ? 'D' : 'R'}+${Math.abs(value).toFixed(1)}`;
