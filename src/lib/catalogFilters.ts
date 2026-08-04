import type { BallotMeasure, Race } from '../types';

export type CatalogFilters = {
  state: string;
  office: 'all' | Race['office'] | 'Measure';
  kind: 'all' | 'race' | 'measure';
  readiness: 'all' | 'ready' | 'unavailable';
};

export function emptyCatalogFilters(): CatalogFilters {
  return { state: '', office: 'all', kind: 'all', readiness: 'all' };
}

function stateMatches(state: string, filter: CatalogFilters) {
  return !filter.state || state === filter.state;
}

export function raceReady(race: Race) {
  const readinessAllowsPicks = race.catalogScope === 'federal'
    ? race.predictionReady === true
    : race.predictionReady !== false;
  return readinessAllowsPicks && (race.eligibleCandidateIds?.length ?? 0) > 0;
}

export function measureReady(measure: BallotMeasure) {
  return measure.predictionReady === true && (measure.eligibleOptions?.length ?? 0) > 0;
}

/** Applies only display filters. Server rules remain the pick-authorization boundary. */
export function applyCatalogFilters(races: Race[], measures: BallotMeasure[], filter: CatalogFilters) {
  const includeRace = filter.kind !== 'measure';
  const includeMeasure = filter.kind !== 'race';
  return {
    races: includeRace ? races.filter((race) => stateMatches(race.state, filter)
      && filter.office !== 'Measure'
      && (filter.office === 'all' || race.office === filter.office)
      && (filter.readiness === 'all' || (filter.readiness === 'ready' ? raceReady(race) : !raceReady(race)))) : [],
    measures: includeMeasure ? measures.filter((measure) => stateMatches(measure.state, filter)
      && (filter.office === 'all' || filter.office === 'Measure')
      && (filter.readiness === 'all' || (filter.readiness === 'ready' ? measureReady(measure) : !measureReady(measure)))) : [],
  };
}
