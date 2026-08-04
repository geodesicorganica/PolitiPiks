import type { BallotMeasure, Candidate, Race } from '../types';
import { measureReady, raceReady } from './catalogFilters';

const candidateHasNegativeStatus = (candidate: Candidate) =>
  candidate.candidateState === 'withdrawn' ||
  candidate.candidateState === 'inactive' ||
  candidate.qualificationStatus === 'withdrawn' ||
  candidate.qualificationStatus === 'inactive' ||
  candidate.qualificationStatus === 'unresolved' ||
  candidate.pickEligibility === 'ineligible' ||
  candidate.ballotEligibility?.qualificationStatus === 'withdrawn' ||
  candidate.ballotEligibility?.qualificationStatus === 'ineligible';

export function candidatePickIsEligible(race: Race, candidate: Candidate) {
  if (!raceReady(race) || candidateHasNegativeStatus(candidate)) return false;
  if (!race.eligibleCandidateIds?.includes(candidate.id)) return false;
  if (race.catalogScope !== 'federal') return true;
  return candidate.pickEligibility === 'eligible' &&
    (candidate.qualificationStatus === 'qualified' || candidate.qualificationStatus === 'on_ballot');
}

export function racePickUnavailableReason(race: Race) {
  if (race.catalogScope === 'federal' && !raceReady(race)) {
    return 'Picks are unavailable until an official candidate allowlist is certified.';
  }
  if (!raceReady(race)) return 'Picks are unavailable because this contest is not prediction-ready.';
  return null;
}

export function measurePickIsEligible(measure: BallotMeasure, option: string) {
  return measureReady(measure) && measure.eligibleOptions?.includes(option) === true;
}
