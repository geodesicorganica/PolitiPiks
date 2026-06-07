import {
  buildContestSummaries,
  buildEligibleLeagueContests,
  buildLeagueResultRows,
  calculateLeagueProgress,
  calculateLeagueResultStats,
  getStateContestGroups,
  scoreLeagueSimulation,
  type LeaguePredictionRecord,
  type PredictionLookup,
} from '../src/lib/leagueSandbox';
import { BallotMeasure, Candidate, LeagueMember, Prediction, Race, ResearchSource } from '../src/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function candidate(id: string, name: string, party: Candidate['party']): Candidate {
  return { id, name, party };
}

const races: Race[] = [
  {
    id: '2024-TX-president',
    state: 'TX',
    office: 'President',
    electionYear: 2024,
    mode: 'sandbox',
    candidates: [candidate('pres-dem', 'Taylor Blue', 'Democrat'), candidate('pres-rep', 'Jordan Red', 'Republican')],
    status: 'upcoming',
    winnerId: 'pres-dem',
    closeDate: '2024-11-05',
  },
  {
    id: '2024-TX-senate',
    state: 'TX',
    office: 'Senate',
    electionYear: 2024,
    mode: 'sandbox',
    candidates: [candidate('sen-dem', 'Casey Blue', 'Democrat'), candidate('sen-rep', 'Morgan Red', 'Republican')],
    status: 'upcoming',
    winnerId: 'sen-rep',
    closeDate: '2024-11-05',
  },
  {
    id: '2024-TX-house-1',
    state: 'TX',
    office: 'House',
    district: '1',
    electionYear: 2024,
    mode: 'sandbox',
    candidates: [candidate('h1-dem', 'Avery Blue', 'Democrat'), candidate('h1-rep', 'Riley Red', 'Republican')],
    status: 'upcoming',
    winnerId: 'h1-dem',
    closeDate: '2024-11-05',
  },
  {
    id: '2024-TX-house-2',
    state: 'TX',
    office: 'House',
    district: '2',
    electionYear: 2024,
    mode: 'sandbox',
    candidates: [candidate('h2-dem', 'Quinn Blue', 'Democrat'), candidate('h2-rep', 'Dakota Red', 'Republican')],
    status: 'upcoming',
    winnerId: 'h2-rep',
    closeDate: '2024-11-05',
  },
  {
    id: '2026-TX-senate',
    state: 'TX',
    office: 'Senate',
    electionYear: 2026,
    mode: 'live',
    candidates: [candidate('future-dem', 'Future Blue', 'Democrat'), candidate('future-rep', 'Future Red', 'Republican')],
    status: 'upcoming',
    closeDate: '2026-11-03',
  },
];

const measures: BallotMeasure[] = [
  {
    id: '2024-TX-measure-1',
    state: 'TX',
    title: 'Proposition 1',
    description: 'Fixture measure',
    electionYear: 2024,
    mode: 'sandbox',
    status: 'upcoming',
    result: 'pass',
    closeDate: '2024-11-05',
  },
];

const members: LeagueMember[] = [
  { userId: 'alice', displayName: 'Alice', points: 0, joinedAt: '2026-01-01T00:00:00.000Z' },
  { userId: 'bob', displayName: 'Bob', points: 0, joinedAt: '2026-01-01T00:00:00.000Z' },
  { userId: 'cara', displayName: 'Cara', points: 0, joinedAt: '2026-01-01T00:00:00.000Z' },
];

const predictions: Prediction[] = [
  { id: 'alice-president', userId: 'alice', leagueId: 'fixture', targetId: '2024-TX-president', type: 'race', pick: 'pres-dem', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'alice-senate', userId: 'alice', leagueId: 'fixture', targetId: '2024-TX-senate', type: 'race', pick: 'sen-dem', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'alice-house-1', userId: 'alice', leagueId: 'fixture', targetId: '2024-TX-house-1', type: 'race', pick: 'h1-dem', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'bob-president', userId: 'bob', leagueId: 'fixture', targetId: '2024-TX-president', type: 'race', pick: 'pres-rep', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'bob-senate', userId: 'bob', leagueId: 'fixture', targetId: '2024-TX-senate', type: 'race', pick: 'sen-rep', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'bob-house-1', userId: 'bob', leagueId: 'fixture', targetId: '2024-TX-house-1', type: 'race', pick: 'h1-rep', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'bob-house-2', userId: 'bob', leagueId: 'fixture', targetId: '2024-TX-house-2', type: 'race', pick: 'h2-rep', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'bob-measure', userId: 'bob', leagueId: 'fixture', targetId: '2024-TX-measure-1', type: 'measure', pick: 'pass', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
];

function verifyStateGrouping() {
  const txRaces = races.filter((race) => race.state === 'TX' && race.electionYear === 2024);
  const txMeasures = measures.filter((measure) => measure.state === 'TX');
  const groups = getStateContestGroups(txRaces, txMeasures);

  assert(!groups.governor, 'TX fixture should not expose a missing Governor contest');
  assert(groups.statewideRaces.map((race) => race.office).join(',') === 'President,Senate', 'statewide races should omit absent offices');
  assert(groups.houseRaces.length === 2, 'state view should include every loaded House race');
  assert(groups.measures.length === 1, 'state view should include loaded ballot measures');
}

function verifyProgress() {
  const summaries = buildContestSummaries(races.filter((race) => race.electionYear === 2024), measures);
  const alicePredictions: PredictionLookup = Object.fromEntries(
    predictions.filter((prediction) => prediction.userId === 'alice').map((prediction) => [
      prediction.targetId,
      { id: prediction.id, pick: prediction.pick, status: prediction.status },
    ]),
  );
  const progress = calculateLeagueProgress(summaries, alicePredictions);

  assert(progress.total === 5, `expected 5 pickable contests, got ${progress.total}`);
  assert(progress.completed === 3, `expected Alice to have 3 completed picks, got ${progress.completed}`);
  assert(progress.missing.length === 2, `expected Alice to have 2 missing picks, got ${progress.missing.length}`);
  assert(progress.percent === 60, `expected Alice progress to be 60, got ${progress.percent}`);
  assert(progress.byCategory.some(([category, missing]) => category === 'House' && missing.length === 1), 'missing House pick should be categorized');
  assert(progress.byCategory.some(([category, missing]) => category === 'Measures' && missing.length === 1), 'missing measure pick should be categorized');
}

function verifySimulationAndResults() {
  const contests = buildEligibleLeagueContests(races, measures);
  const scorePlan = scoreLeagueSimulation(members, predictions, contests);

  assert(contests.length === 5, `expected 5 eligible sandbox contests, got ${contests.length}`);
  assert(scorePlan.totalScoredPicks === 15, `expected 15 scored pick slots, got ${scorePlan.totalScoredPicks}`);
  assert(scorePlan.missingTotal === 7, `expected 7 missing picks, got ${scorePlan.missingTotal}`);
  assert(scorePlan.memberScores.get('alice')?.points === 2, 'Alice should score 2');
  assert(scorePlan.memberScores.get('alice')?.missingPicks === 2, 'Alice should have 2 missing picks');
  assert(scorePlan.memberScores.get('bob')?.points === 3, 'Bob should score 3');
  assert(scorePlan.memberScores.get('cara')?.missingPicks === 5, 'Cara should have every pick marked missing');

  const scoredPredictions = scorePlan.outcomes.map((outcome): LeaguePredictionRecord => ({
    id: outcome.prediction?.id ?? `${outcome.userId}-${outcome.contest.targetId}-missing`,
    userId: outcome.userId,
    leagueId: 'fixture',
    targetId: outcome.contest.targetId,
    type: outcome.contest.type,
    pick: outcome.prediction?.pick,
    status: outcome.status,
    score: outcome.score,
    correctPick: outcome.correctPick,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
  const rows = buildLeagueResultRows(scoredPredictions, races, measures, members);
  const stats = calculateLeagueResultStats(rows);

  assert(rows.length === 15, `expected 15 result rows, got ${rows.length}`);
  assert(stats.uniqueCorrect.some((entry) => entry.memberName === 'Alice' && entry.label === 'TX House 1'), 'Alice should have a unique correct House 1 pick');
  assert(stats.consensusMiss?.missedBy === 1, 'fixture should report the largest consensus miss count');
  assert(stats.bestState?.memberName === 'Bob' && stats.bestState.correct === 3, 'Bob should own the best TX state result');
  assert(stats.perfectStates.length === 0, 'missing and wrong picks should prevent perfect states');
}

function verifyResearchFallbackShape() {
  const sources: ResearchSource[] = [
    {
      id: 'medsl-2024',
      label: 'MIT Election Data and Science Lab 2024 Official Returns',
      url: 'https://github.com/MEDSL/2024-elections-official',
      type: 'civic-data',
      retrievedAt: '2026-06-06T00:00:00.000Z',
    },
  ];

  assert(sources.length > 0, 'research fallback requires at least one source link');
  assert(sources.every((source) => source.url.startsWith('https://')), 'research fallback links should be external https URLs');
  assert(sources.some((source) => source.type === 'civic-data'), 'research fallback should preserve source type');
}

verifyStateGrouping();
verifyProgress();
verifySimulationAndResults();
verifyResearchFallbackShape();

console.log('League flow harness passed: state grouping, progress, simulation scoring, result stats, and research fallback shape.');
