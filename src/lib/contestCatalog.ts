import type { BallotMeasure, Race } from '../types';

export type ContestCatalogActivation = {
  state: 'pending' | 'active' | 'rollback';
  activeFederalGeneration: string;
  activeMeasureGeneration?: string;
};

export type ContestCatalogResult =
  | { status: 'ready'; races: Race[]; measures: BallotMeasure[]; activeFederalGeneration: string }
  | { status: 'error'; message: string };

export const LEGACY_FEDERAL_GENERATION = 'legacy-2026';
export const CANONICAL_V2_GENERATION = 'canonical-2026-shadow-v2';

/** Federal IDs are normalized 2026 Senate / US House identifiers; governors and state contests do not match. */
export function isFederalRaceId(raceId: string) {
  return /^2026-[A-Z]{2}-(?:senate(?:-(?:special-)?class-[123])?|house-\d{3})$/.test(raceId);
}

function sortById<T extends { id: string }>(items: T[]) {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function selectFederalRace(race: Race, generation: string) {
  if (generation === LEGACY_FEDERAL_GENERATION) return !race.registryGeneration;
  return race.catalogScope === 'federal' && race.registryGeneration === generation;
}

function isCanonical2026Measure(measure: BallotMeasure) {
  return measure.catalogScope === 'canonical-2026-measures' || /^2026-[A-Z]{2}-proposition-/.test(measure.id);
}

function selectMeasure(measure: BallotMeasure, activation: ContestCatalogActivation | null) {
  if (!isCanonical2026Measure(measure)) return true;
  return activation?.state === 'active' && activation.activeMeasureGeneration === CANONICAL_V2_GENERATION
    && measure.catalogScope === 'canonical-2026-measures' && measure.registryGeneration === CANONICAL_V2_GENERATION;
}

/** Selects exactly one federal generation while preserving valid non-federal contests and ballot measures. */
export function selectContestCatalog({
  races,
  measures,
  activation,
}: {
  races: Race[];
  measures: BallotMeasure[];
  activation: ContestCatalogActivation | null;
}): ContestCatalogResult {
  if (activation?.state === 'pending') {
    return {
      status: 'ready',
      races: sortById(races.filter((race) => !isFederalRaceId(race.id) && race.catalogScope !== 'federal')),
      measures: sortById(measures.filter((measure) => selectMeasure(measure, activation))),
      activeFederalGeneration: LEGACY_FEDERAL_GENERATION,
    };
  }
  const generation = activation?.activeFederalGeneration ?? LEGACY_FEDERAL_GENERATION;
  if (generation !== LEGACY_FEDERAL_GENERATION && !/^canonical-[a-z0-9-]+$/.test(generation)) {
    return { status: 'error', message: 'The federal contest catalog has an incompatible active generation.' };
  }
  const selected = races.filter((race) => isFederalRaceId(race.id)
    ? selectFederalRace(race, generation)
    : race.catalogScope !== 'federal');
  return { status: 'ready', races: sortById(selected), measures: sortById(measures.filter((measure) => selectMeasure(measure, activation))), activeFederalGeneration: generation };
}
