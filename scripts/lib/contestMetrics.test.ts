import assert from 'node:assert/strict';
import { buildMetricsForRace, getHistoricalPlan } from './contestMetrics.js';

const gaHousePlan = getHistoricalPlan(2026, 'House', 'GA');
assert.deepEqual(gaHousePlan, {
  historicalElectionYear: 2024,
  turnoutElectionYear: 2024,
  turnoutComparisonElectionYear: 2022,
});

const gaSenatePlan = getHistoricalPlan(2026, 'Senate', 'GA');
assert.deepEqual(gaSenatePlan, {
  historicalElectionYear: 2020,
  turnoutElectionYear: 2020,
  turnoutComparisonElectionYear: null,
});

assert.equal(
  getHistoricalPlan(2026, 'Senate', 'FL'),
  null,
  'special Senate seats must remain unlinked until races carry seat identity',
);

const metrics = buildMetricsForRace(
  {
    id: '2026-GA-house-001',
    state: 'GA',
    office: 'House',
    district: '001',
    electionYear: 2026,
    mode: 'live',
    status: 'upcoming',
    closeDate: '2026-11-03T23:59:59Z',
    candidates: [],
  },
  {
    prior: { dem: 600, rep: 400, total: 1_000 },
    current: undefined,
    nationalPriorMarginPct: 1.5,
    demo: { vap: 2_000 },
    historicalElectionYear: 2024,
    turnoutBasis: { dem: 600, rep: 400, total: 1_000 },
    turnoutElectionYear: 2024,
    turnoutComparison: { dem: 500, rep: 400, total: 900 },
    turnoutComparisonElectionYear: 2022,
  },
);

assert.equal(metrics.historical?.electionYear, 2024);
assert.equal(metrics.historical?.priorMargin, 20);
assert.equal(metrics.historical?.swingVsPrevious, null, 'an upcoming race has no current-result swing');
assert.equal(metrics.turnout?.turnoutRate, 0.5);
assert.equal(metrics.turnout?.turnoutChange, 0.111);
assert.equal(metrics.turnout?.electionYear, 2024);
assert.equal(metrics.turnout?.comparisonElectionYear, 2022);

console.log('contest metrics cycle regression tests passed');
