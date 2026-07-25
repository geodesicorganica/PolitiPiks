import type { BallotMeasure, Race } from '../types';

export type ContestCatalogActivation = {
  state: 'pending' | 'active' | 'rollback';
  activeFederalGeneration: string;
};

export type ContestCatalogResult =
  | { status: 'ready'; races: Race[]; measures: BallotMeasure[]; activeFederalGeneration: string }
  | { status: 'error'; message: string };

export const LEGACY_FEDERAL_GENERATION = 'legacy-2026';

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
  if (activation?.state === 'pending') return { status: 'error', message: 'The federal contest catalog is pending activation.' };
  const generation = activation?.activeFederalGeneration ?? LEGACY_FEDERAL_GENERATION;
  if (generation !== LEGACY_FEDERAL_GENERATION && !/^canonical-[a-z0-9-]+$/.test(generation)) {
    return { status: 'error', message: 'The federal contest catalog has an incompatible active generation.' };
  }
  const selected = races.filter((race) => isFederalRaceId(race.id)
    ? selectFederalRace(race, generation)
    : race.catalogScope !== 'federal');
  return { status: 'ready', races: sortById(selected), measures: sortById(measures), activeFederalGeneration: generation };
}
