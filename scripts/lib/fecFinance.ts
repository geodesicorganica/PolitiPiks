import { Candidate, Race, ResearchSection, ResearchSource } from '../../src/types';

export type FecCommittee = {
  committee_id?: string;
  name?: string;
  designation_full?: string;
  filing_frequency?: string;
};

export type FecCandidateTotal = {
  coverage_end_date?: string;
  receipts?: number | string;
  disbursements?: number | string;
  cash_on_hand_end_period?: number | string;
  debts_owed_by_committee?: number | string;
  individual_contributions?: number | string;
  candidate_contribution?: number | string;
};

export type FecIndependentExpenditure = {
  support_oppose_indicator?: string;
  total?: number | string;
  expenditure_amount?: number | string;
};

export type FecFinanceResult = {
  committees: FecCommittee[];
  totals: FecCandidateTotal[];
  independentExpenditures: FecIndependentExpenditure[];
};

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function latestTotals(totals: FecCandidateTotal[]) {
  return [...totals].sort((a, b) => {
    const aTime = a.coverage_end_date ? Date.parse(a.coverage_end_date) : 0;
    const bTime = b.coverage_end_date ? Date.parse(b.coverage_end_date) : 0;
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  })[0] ?? null;
}

function sumIndependentExpenditures(rows: FecIndependentExpenditure[], indicator: 'S' | 'O') {
  return rows.reduce((sum, row) => {
    if (row.support_oppose_indicator?.toUpperCase() !== indicator) return sum;
    return sum + (numberValue(row.total) ?? numberValue(row.expenditure_amount) ?? 0);
  }, 0);
}

function fecProfileSource(candidate: Candidate, cycle: number, retrievedAt: string): ResearchSource {
  const fecCandidateId = candidate.externalIds?.fecCandidateId;
  if (!fecCandidateId) throw new Error(`Candidate ${candidate.id} is missing a FEC candidate id.`);
  return {
    id: `fec-${fecCandidateId}-${cycle}`,
    label: `FEC — ${candidate.name}`,
    url: `https://www.fec.gov/data/candidate/${fecCandidateId}/?cycle=${cycle}&election_full=true`,
    type: 'official',
    retrievedAt,
  };
}

export function buildFecFilingResearch(
  candidate: Candidate,
  race: Race,
  committees: FecCommittee[] = [],
  retrievedAt = new Date().toISOString(),
): { section: ResearchSection; source: ResearchSource } {
  const fecCandidateId = candidate.externalIds?.fecCandidateId;
  if (!fecCandidateId) throw new Error(`Candidate ${candidate.id} is missing a FEC candidate id.`);

  const cycle = race.electionYear ?? new Date().getUTCFullYear();
  const source = fecProfileSource(candidate, cycle, retrievedAt);
  const officeLabel = race.office === 'House' && race.district
    ? `${race.state} House District ${race.district}`
    : `${race.state} ${race.office}`;
  const committeeNames = Array.from(new Set(
    committees
      .map((committee) => committee.name?.trim())
      .filter((name): name is string => Boolean(name)),
  ));
  const bullets = [
    `FEC candidate ID: ${fecCandidateId}.`,
    `Filing status in Politipiks: ${candidate.qualificationStatus ?? 'filed'}.`,
  ];
  if (committeeNames.length > 0) {
    bullets.push(`Authorized or linked committee${committeeNames.length === 1 ? '' : 's'}: ${committeeNames.join('; ')}.`);
  }
  bullets.push('An FEC filing identifies a federal campaign-finance filer; it does not confirm ballot qualification.');

  return {
    section: {
      title: 'Federal Filing Profile',
      body: `${candidate.name} has an FEC filing associated with the ${cycle} ${officeLabel} contest.`,
      bullets,
      links: [{ label: 'FEC candidate profile', url: source.url, sourceId: source.id }],
      sourceIds: source.id ? [source.id] : [],
    },
    source,
  };
}

export function buildFecFinanceResearch(
  candidate: Candidate,
  race: Race,
  finance: FecFinanceResult,
  retrievedAt = new Date().toISOString(),
): { section: ResearchSection; source: ResearchSource } {
  const fecCandidateId = candidate.externalIds?.fecCandidateId;
  if (!fecCandidateId) throw new Error(`Candidate ${candidate.id} is missing a FEC candidate id.`);

  const cycle = race.electionYear ?? new Date().getUTCFullYear();
  const source = fecProfileSource(candidate, cycle, retrievedAt);
  const sourceUrl = source.url;
  const sourceId = source.id!;
  const total = latestTotals(finance.totals);
  const bullets: string[] = [];

  const committees = finance.committees
    .filter((committee) => committee.name)
    .map((committee) => committee.name!.trim());
  if (committees.length > 0) {
    bullets.push(`Authorized or linked committee${committees.length === 1 ? '' : 's'}: ${Array.from(new Set(committees)).join('; ')}.`);
  }

  if (total) {
    const values: Array<[string, unknown]> = [
      ['Total receipts', total.receipts],
      ['Total disbursements', total.disbursements],
      ['Cash on hand', total.cash_on_hand_end_period],
      ['Debts owed', total.debts_owed_by_committee],
      ['Individual contributions', total.individual_contributions],
      ['Candidate contributions', total.candidate_contribution],
    ];
    for (const [label, raw] of values) {
      const value = numberValue(raw);
      if (value !== null) bullets.push(`${label}: ${money(value)}.`);
    }
  } else {
    bullets.push('No processed cycle financial totals are available from the FEC yet.');
  }

  const support = sumIndependentExpenditures(finance.independentExpenditures, 'S');
  const oppose = sumIndependentExpenditures(finance.independentExpenditures, 'O');
  if (support > 0) bullets.push(`Reported independent expenditures supporting the candidate: ${money(support)}.`);
  if (oppose > 0) bullets.push(`Reported independent expenditures opposing the candidate: ${money(oppose)}.`);

  return {
    section: {
      title: 'Federal Campaign Finance',
      body: total?.coverage_end_date
        ? `Latest processed FEC coverage period ends ${total.coverage_end_date.slice(0, 10)}.`
        : 'Federal filing and campaign-finance information from the FEC.',
      bullets,
      links: [{ label: 'FEC candidate profile', url: sourceUrl, sourceId }],
      sourceIds: [sourceId],
    },
    source,
  };
}
