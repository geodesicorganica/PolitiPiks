import { ContestMetrics, Race } from '../../src/types';

export type PartyTotals = { dem: number; rep: number; total: number };

export type DemographicsRecord = NonNullable<ContestMetrics['demographics']> & {
  vap?: number | null;
};

export type HistoricalPlan = {
  historicalElectionYear: number;
  turnoutElectionYear: number;
  turnoutComparisonElectionYear: number | null;
};

export type MetricsInputs = {
  prior?: PartyTotals;
  current?: PartyTotals;
  nationalPriorMarginPct: number | null;
  demo?: DemographicsRecord;
  historicalElectionYear?: number;
  turnoutBasis?: PartyTotals;
  turnoutElectionYear?: number;
  turnoutComparison?: PartyTotals;
  turnoutComparisonElectionYear?: number | null;
};

// The 2026 regular Senate map is Class 2. Additional Senate states in the FEC
// feed are special elections and cannot be matched safely until Race carries a
// seat class or special-election identifier.
const SENATE_CLASS_2_STATES = new Set([
  'AL', 'AK', 'AR', 'CO', 'DE', 'GA', 'ID', 'IL', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MA', 'MI', 'MN', 'MS', 'MT', 'NE', 'NH', 'NJ', 'NM', 'NC', 'OK', 'OR', 'RI',
  'SC', 'SD', 'TN', 'TX', 'VA', 'WV', 'WY',
]);

const PRESIDENT_HOME_STATES_2024 = new Set(['FL', 'CA']);

export function getHistoricalPlan(
  targetYear: number,
  office: Race['office'],
  state: string,
): HistoricalPlan | null {
  if (targetYear === 2024) {
    if (office === 'President') {
      return {
        historicalElectionYear: 2020,
        turnoutElectionYear: 2024,
        turnoutComparisonElectionYear: 2020,
      };
    }
    if (office === 'Senate') {
      return {
        historicalElectionYear: 2018,
        turnoutElectionYear: 2024,
        turnoutComparisonElectionYear: 2018,
      };
    }
    if (office === 'House') {
      return {
        historicalElectionYear: 2022,
        turnoutElectionYear: 2022,
        turnoutComparisonElectionYear: null,
      };
    }
  }

  if (targetYear === 2026) {
    if (office === 'President') {
      return {
        historicalElectionYear: 2024,
        turnoutElectionYear: 2024,
        turnoutComparisonElectionYear: 2020,
      };
    }
    if (office === 'House') {
      return {
        historicalElectionYear: 2024,
        turnoutElectionYear: 2024,
        turnoutComparisonElectionYear: 2022,
      };
    }
    if (office === 'Senate' && SENATE_CLASS_2_STATES.has(state.toUpperCase())) {
      return {
        historicalElectionYear: 2020,
        turnoutElectionYear: 2020,
        turnoutComparisonElectionYear: null,
      };
    }
  }

  return null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function marginPct(totals: PartyTotals): number | null {
  if (totals.total <= 0) return null;
  return round1(((totals.dem - totals.rep) / totals.total) * 100);
}

function stripVap(demo: DemographicsRecord | undefined): ContestMetrics['demographics'] | undefined {
  if (!demo) return undefined;
  const { vap: _vap, ...rest } = demo;
  return rest;
}

function winnerParty(race: Race): string | null {
  if (!race.winnerId) return null;
  const winner = (race.candidates || []).find((candidate) => candidate.id === race.winnerId);
  return winner?.party ?? null;
}

export function buildMetricsForRace(race: Race, inputs: MetricsInputs): ContestMetrics {
  const {
    prior,
    current,
    nationalPriorMarginPct,
    demo,
    historicalElectionYear,
    turnoutBasis,
    turnoutElectionYear,
    turnoutComparison,
    turnoutComparisonElectionYear,
  } = inputs;
  const metrics: ContestMetrics = { id: race.id, raceId: race.id };

  if (prior && prior.total > 0) {
    const priorMargin = marginPct(prior);
    const currentMargin = current && current.total > 0 ? marginPct(current) : null;
    metrics.historical = {
      electionYear: historicalElectionYear,
      priorVoteShareDem: round3(prior.dem / prior.total),
      priorVoteShareRep: round3(prior.rep / prior.total),
      priorMargin,
      swingVsPrevious: priorMargin !== null && currentMargin !== null
        ? round1(currentMargin - priorMargin)
        : null,
      partisanLean: priorMargin !== null && nationalPriorMarginPct !== null
        ? round1(priorMargin - nationalPriorMarginPct)
        : null,
    };
  }

  const priorMarginForFundamentals = metrics.historical?.priorMargin ?? null;
  const winner = winnerParty(race);
  metrics.fundamentals = {
    incumbencyFlag: (race.candidates || []).some((candidate) => candidate.incumbent === true),
    homeStateAdvantageFlag: race.office === 'President' && race.electionYear === 2024
      ? PRESIDENT_HOME_STATES_2024.has(race.state)
      : false,
    nationalHeadwindTailwind: null,
    priorCycleBaseline: priorMarginForFundamentals,
    partyContinuity: winner && priorMarginForFundamentals !== null
      ? (winner === 'Democrat') === (priorMarginForFundamentals > 0)
      : undefined,
    economicDirectionIndicator: null,
  };

  const turnout: NonNullable<ContestMetrics['turnout']> = {
    electionYear: turnoutElectionYear,
    comparisonElectionYear: turnoutComparisonElectionYear,
    turnoutRate: turnoutBasis && turnoutBasis.total > 0 && demo?.vap
      ? round3(Math.min(1, turnoutBasis.total / demo.vap))
      : null,
    turnoutChange: turnoutBasis && turnoutBasis.total > 0 && turnoutComparison && turnoutComparison.total > 0
      ? round3((turnoutBasis.total - turnoutComparison.total) / turnoutComparison.total)
      : null,
    earlyVoteShare: null,
  };
  if (turnout.turnoutRate !== null || turnout.turnoutChange !== null) {
    metrics.turnout = turnout;
  }

  const demographics = stripVap(demo);
  if (demographics) metrics.demographics = demographics;

  return metrics;
}
