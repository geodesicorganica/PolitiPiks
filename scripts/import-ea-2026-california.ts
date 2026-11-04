import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { assessRelease, PROFILE_FIELDS, type ReleaseInput, type CandidateProfile, type Contest, type Source } from './lib/ea2026Release.js';
import { inspectFecBulkCandidateSummary } from './lib/fecBulkFinance.js';

const args = process.argv.slice(2);
const option = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const inputPath = option('--input'), capturesPath = option('--captures'), outputPath = option('--out');
if (!inputPath || !capturesPath || !outputPath) throw new Error('--input, --captures, --out required');
const captures = resolve(capturesPath);
const receipt = JSON.parse(readFileSync(join(captures, 'capture-receipt.json'), 'utf8'));
const ballot = receipt.captures.find((x: { purpose: string }) => x.purpose === 'candidate_list_to_review');
const finance = receipt.captures.find((x: { purpose: string }) => x.purpose === 'finance_not_ballot_eligibility');
for (const capture of [ballot, finance]) {
  if (capture?.status !== 'captured_unreviewed') throw new Error('source capture unavailable');
  if (createHash('sha256').update(readFileSync(join(captures, capture.bodyFile))).digest('hex') !== capture.sha256) throw new Error('source capture changed');
}
const text = readFileSync(join(captures, ballot.bodyFile.replace(/\.pdf$/, '.txt')), 'utf8');
if (!text.includes('NOVEMBER 3, 2026, GENERAL ELECTION') || !text.includes('Official Certified List of Candidates')) throw new Error('not the certified general-election list');
const fecText = readFileSync(join(captures, finance.bodyFile.replace(/\.zip$/, '.txt')), 'utf8');
const fec = inspectFecBulkCandidateSummary(fecText);
const fecRows = fecText.split(/\r?\n/).filter(Boolean).map(row => row.split('|'));
const normalizedName = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const input: ReleaseInput = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
if (input.contests.some(c => c.state === 'CA')) throw new Error('California import already present; do not overwrite reviewed work');
const now = new Date().toISOString();
const source = (capture: typeof ballot, id: string, kind: Source['kind'], authority: string, locator: string): Source => ({ id, kind, authority, locator, url: capture.url, sha256: capture.sha256, retrievedAt: capture.retrievedAt, reviewedAt: now, reviewer: 'codex-source-review', });
input.sources.push(source(ballot, 'ca-certified-2026-general', 'election_authority', 'California Secretary of State', 'Certified August 27, 2026; PDF pages 2 and 4-14, Governor and 52 U.S. House districts. Text extracted from retained PDF; governor and representative pages visually checked.'));
input.sources.push(source(finance, 'fec-bulk-2026-september', 'government', 'Federal Election Commission', 'weball26.txt; documented 30-column format, exact normalized name/state/office joins only; no inferred ballot status.'));
const pending = () => ({ status: 'unreviewed' as const, reason: 'Source research remains outstanding.', sourceIds: [] });
const records: Contest[] = [];
let current: Contest | null = null;
let exactFinanceMatches = 0;
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  const house = /^United States Representative District (\d+)$/.exec(line);
  if (line === 'Governor' || house) {
    const district = house ? house[1].padStart(3, '0') : undefined;
    current = { id: house ? `2026-CA-house-${district}` : '2026-CA-governor', state: 'CA', office: house ? 'House' : 'Governor', electionDate: '2026-11-03', seatKind: 'regular', ...(district ? { district } : {}), sourceIds: ['ca-certified-2026-general'], candidates: [], metrics: { historical: pending(), turnout: pending(), demographics: pending() } };
    records.push(current); continue;
  }
  if (/^(Lieutenant Governor|Secretary of State|Controller|Treasurer|Attorney General|Insurance Commissioner|Superintendent of Public Instruction|Board of Equalization Member District|State Senat(?:or|e) District|State Assembly Member District|Member of the State Assembly|Justice)/.test(line)) current = null;
  if (!current) continue;
  const candidate = /^(.+?)\s+(Democratic|Republican|No Party Preference|Green|Libertarian|American Independent|Peace and Freedom)$/.exec(line);
  if (!candidate) continue;
  const name = candidate[1].replace(/\*/g, '').trim(), party = candidate[2];
  const matches = current.office === 'House' ? fecRows.filter(row => row[0].startsWith('H') && row[18] === 'CA' && normalizedName(row[1]) === normalizedName(name)) : [];
  const ids = [...new Set(matches.map(row => row[0]))];
  const fecId = ids.length === 1 ? ids[0] : undefined;
  const candidateId = fecId ? `fec-${fecId}` : `ballot-ca-${createHash('sha256').update(`${current.office}:${normalizedName(name)}`).digest('hex').slice(0, 20)}`;
  const profile = Object.fromEntries(PROFILE_FIELDS.map(key => [key, pending()])) as CandidateProfile;
  const facts = fecId ? fec.rows.filter(row => row.fecCandidateId === fecId) : [];
  if (facts.length === 1) {
    const fact = facts[0];
    const amount = (v: number | null) => v === null ? 'not reported' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
    profile.finance = { status: 'present', attribution: 'government_record', sourceIds: ['fec-bulk-2026-september'], value: [`FEC candidate ID: ${fecId}. Reporting period through ${fact.coverageEndDate}.`, `Receipts: ${amount(fact.receipts)}; disbursements: ${amount(fact.disbursements)}; cash on hand: ${amount(fact.cashOnHand)}; debts owed: ${amount(fact.debtsOwed)}.`] };
    exactFinanceMatches++;
  }
  current.candidates.push({ id: candidateId, name, party, ballotSourceIds: ['ca-certified-2026-general'], qualificationStatus: 'on_ballot', ...(fecId ? { externalIds: { fecCandidateId: fecId } } : {}), profile });
}
const districts = records.filter(c => c.office === 'House');
if (districts.length !== 52 || new Set(districts.map(c => c.district)).size !== 52 || records.length !== 53 || records.some(c => c.candidates.length < 1 || c.candidates.length > 2)) throw new Error(`California extraction needs manual reconciliation: ${JSON.stringify({ contests: records.length, districts: districts.length, invalid: records.filter(c => c.candidates.length < 1 || c.candidates.length > 2).map(c => ({ id: c.id, count: c.candidates.length })) })}`);
const state = input.coverage.find(c => c.state === 'CA')!;
for (const office of ['House', 'Governor'] as const) state.scopes[office] = { status: 'available', expectedContestIds: records.filter(c => c.office === office).map(c => c.id), sourceIds: ['ca-certified-2026-general'] };
state.scopes.Senate = { status: 'officially_none', expectedContestIds: [], sourceIds: ['ca-certified-2026-general'], reason: 'The official complete November general-election list contains no U.S. Senate contest.' };
input.contests.push(...records);
input.asOf = now;
const report = assessRelease(input);
writeFileSync(resolve(outputPath), `${JSON.stringify(input, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ importedContests: records.length, ballotCandidates: records.reduce((n, c) => n + c.candidates.length, 0), exactFinanceMatches, profilesReviewed: report.profilesReviewed, releaseReady: report.releaseReady, blockers: report.blockers.length }));
