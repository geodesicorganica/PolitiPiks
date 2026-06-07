import { BallotMeasure, LeagueMember, Prediction, Race } from '../types';

export type PredictionLookup = Record<string, Pick<Prediction, 'id' | 'pick' | 'status'> | undefined>;

export type ContestSummary = {
  id: string;
  state: string;
  category: string;
  label: string;
};

export type LeaguePredictionRecord = Prediction & { id: string };

export type EligibleLeagueContest = {
  targetId: string;
  type: 'race' | 'measure';
  correctPick: string;
};

export type LeagueSimulationMemberScore = {
  correctPicks: number;
  incorrectPicks: number;
  missingPicks: number;
  points: number;
};

export type LeagueSimulationOutcome = {
  userId: string;
  contest: EligibleLeagueContest;
  prediction?: Prediction;
  status: Prediction['status'];
  score: number;
  correctPick: string;
};

export type LeagueResultRow = {
  prediction: LeaguePredictionRecord;
  contest?: Race | BallotMeasure;
  member?: LeagueMember;
  state: string;
  category: string;
  contestLabel: string;
  pick: string;
  correctPick: string;
};

export function contestCategory(contest: Race | BallotMeasure) {
  if ('office' in contest) return contest.office;
  return 'Measures';
}

export function contestLabel(contest: Race | BallotMeasure) {
  if ('office' in contest) return `${contest.office}${contest.district ? ` ${contest.district}` : ''}`;
  return contest.title;
}

export function pickLabel(contest: Race | BallotMeasure | undefined, pick?: string) {
  if (!pick) return 'Missing';
  if (!contest) return pick;
  if ('candidates' in contest) {
    return contest.candidates.find((candidate) => candidate.id === pick)?.name ?? pick;
  }
  if (pick === 'pass') return 'Pass';
  if (pick === 'fail') return 'Fail';
  return pick;
}

export function isSandboxRace(race: Race) {
  return race.electionYear === 2024 && race.mode === 'sandbox' && Boolean(race.winnerId);
}

export function isSandboxMeasure(measure: BallotMeasure) {
  return measure.electionYear === 2024 && measure.mode === 'sandbox' && (measure.result === 'pass' || measure.result === 'fail');
}

export function predictionKey(userId: string, targetId: string) {
  return `${userId}::${targetId}`;
}

export function missingPredictionId(leagueId: string, userId: string, targetId: string) {
  return `${leagueId}_${userId}_${targetId}_missing`.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 180);
}

export function buildEligibleLeagueContests(races: Race[], measures: BallotMeasure[]) {
  return [
    ...races.filter(isSandboxRace).map((race) => ({
      targetId: race.id,
      type: 'race' as const,
      correctPick: race.winnerId!,
    })),
    ...measures.filter(isSandboxMeasure).map((measure) => ({
      targetId: measure.id,
      type: 'measure' as const,
      correctPick: measure.result!,
    })),
  ];
}

export function buildContestSummaries(races: Race[], measures: BallotMeasure[]) {
  const raceSummaries = races.map((race) => ({
    id: race.id,
    state: race.state,
    category: contestCategory(race),
    label: contestLabel(race),
  }));
  const measureSummaries = measures.map((measure) => ({
    id: measure.id,
    state: measure.state,
    category: contestCategory(measure),
    label: contestLabel(measure),
  }));
  return [...raceSummaries, ...measureSummaries].sort((a, b) =>
    a.state.localeCompare(b.state) ||
    a.category.localeCompare(b.category) ||
    a.label.localeCompare(b.label)
  );
}

export function calculateLeagueProgress(contestSummaries: ContestSummary[], predictions: PredictionLookup) {
  const missing = contestSummaries.filter((contest) => !predictions[contest.id]?.pick);
  const completed = contestSummaries.length - missing.length;
  const byState = new Map<string, ContestSummary[]>();
  const byCategory = new Map<string, ContestSummary[]>();

  missing.forEach((contest) => {
    byState.set(contest.state, [...(byState.get(contest.state) ?? []), contest]);
    byCategory.set(contest.category, [...(byCategory.get(contest.category) ?? []), contest]);
  });

  return {
    completed,
    total: contestSummaries.length,
    missing,
    percent: contestSummaries.length > 0 ? Math.round((completed / contestSummaries.length) * 100) : 0,
    byState: Array.from(byState.entries()).sort(([a], [b]) => a.localeCompare(b)),
    byCategory: Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b)),
  };
}

export function getStateContestGroups(races: Race[], measures: BallotMeasure[]) {
  const president = races.find((race) => race.office === 'President');
  const governor = races.find((race) => race.office === 'Governor');
  const senate = races.find((race) => race.office === 'Senate');
  const houseRaces = races.filter((race) => race.office === 'House');

  return {
    president,
    governor,
    senate,
    statewideRaces: [president, governor, senate].filter((race): race is Race => Boolean(race)),
    houseRaces,
    measures,
  };
}

export function scoreLeagueSimulation(
  members: Array<Pick<LeagueMember, 'userId'>>,
  predictions: Prediction[],
  contests: EligibleLeagueContest[],
  pointsPerCorrect = 1,
) {
  const predictionByMemberTarget = new Map<string, Prediction>();
  for (const prediction of predictions) {
    predictionByMemberTarget.set(predictionKey(prediction.userId, prediction.targetId), prediction);
  }

  let missingTotal = 0;
  const memberScores = new Map<string, LeagueSimulationMemberScore>();
  const outcomes: LeagueSimulationOutcome[] = [];

  for (const member of members) {
    memberScores.set(member.userId, {
      correctPicks: 0,
      incorrectPicks: 0,
      missingPicks: 0,
      points: 0,
    });
  }

  for (const member of members) {
    for (const contest of contests) {
      const existing = predictionByMemberTarget.get(predictionKey(member.userId, contest.targetId));
      const score = memberScores.get(member.userId)!;

      if (!existing?.pick) {
        score.missingPicks += 1;
        missingTotal += 1;
        outcomes.push({
          userId: member.userId,
          contest,
          prediction: existing,
          status: 'missing',
          score: 0,
          correctPick: contest.correctPick,
        });
        continue;
      }

      const isCorrect = existing.pick === contest.correctPick;
      if (isCorrect) {
        score.correctPicks += 1;
        score.points += pointsPerCorrect;
      } else {
        score.incorrectPicks += 1;
      }

      outcomes.push({
        userId: member.userId,
        contest,
        prediction: existing,
        status: isCorrect ? 'correct' : 'incorrect',
        score: isCorrect ? pointsPerCorrect : 0,
        correctPick: contest.correctPick,
      });
    }
  }

  return {
    contests,
    missingTotal,
    totalScoredPicks: members.length * contests.length,
    memberScores,
    outcomes,
  };
}

export function buildLeagueResultRows(
  predictions: LeaguePredictionRecord[],
  races: Race[],
  measures: BallotMeasure[],
  members: LeagueMember[],
) {
  const contestById = new Map<string, Race | BallotMeasure>();
  races.forEach((race) => contestById.set(race.id, race));
  measures.forEach((measure) => contestById.set(measure.id, measure));

  const memberById = new Map<string, LeagueMember>();
  members.forEach((member) => memberById.set(member.userId, member));

  return predictions
    .filter((prediction) => prediction.status !== 'pending')
    .map((prediction) => {
      const contest = contestById.get(prediction.targetId);
      const member = memberById.get(prediction.userId);
      return {
        prediction,
        contest,
        member,
        state: contest?.state ?? 'Unknown',
        category: contest ? contestCategory(contest) : prediction.type,
        contestLabel: contest ? contestLabel(contest) : prediction.targetId,
        pick: pickLabel(contest, prediction.pick),
        correctPick: pickLabel(contest, prediction.correctPick),
      };
    })
    .sort((a, b) =>
      a.state.localeCompare(b.state) ||
      a.category.localeCompare(b.category) ||
      a.contestLabel.localeCompare(b.contestLabel) ||
      (a.member?.displayName ?? '').localeCompare(b.member?.displayName ?? '')
    );
}

export function calculateLeagueResultStats(resultRows: LeagueResultRow[]) {
  const byTarget = new Map<string, LeagueResultRow[]>();
  for (const row of resultRows) {
    byTarget.set(row.prediction.targetId, [...(byTarget.get(row.prediction.targetId) ?? []), row]);
  }

  let biggestUpset: { label: string; pickedBy: number; memberName: string } | null = null;
  let consensusMiss: { label: string; missedBy: number; pick: string } | null = null;
  const uniqueCorrect: Array<{ label: string; memberName: string; pick: string }> = [];

  for (const rows of byTarget.values()) {
    const correctRows = rows.filter((row) => row.prediction.status === 'correct');
    const incorrectRows = rows.filter((row) => row.prediction.status === 'incorrect');
    const contestName = `${rows[0]?.state ?? ''} ${rows[0]?.contestLabel ?? ''}`.trim();

    if (correctRows.length > 0) {
      const candidate = {
        label: contestName,
        pickedBy: correctRows.length,
        memberName: correctRows.map((row) => row.member?.displayName ?? row.prediction.userId).join(', '),
      };
      if (!biggestUpset || candidate.pickedBy < biggestUpset.pickedBy) {
        biggestUpset = candidate;
      }
      if (correctRows.length === 1) {
        uniqueCorrect.push({
          label: contestName,
          memberName: correctRows[0].member?.displayName ?? correctRows[0].prediction.userId,
          pick: correctRows[0].pick,
        });
      }
    }

    if (incorrectRows.length > 0) {
      const missesByPick = new Map<string, LeagueResultRow[]>();
      incorrectRows.forEach((row) => {
        missesByPick.set(row.pick, [...(missesByPick.get(row.pick) ?? []), row]);
      });
      for (const [pick, missedRows] of missesByPick.entries()) {
        const candidate = { label: contestName, missedBy: missedRows.length, pick };
        if (!consensusMiss || candidate.missedBy > consensusMiss.missedBy) {
          consensusMiss = candidate;
        }
      }
    }
  }

  const stateAccuracy = new Map<string, { correct: number; total: number; memberName: string; state: string }>();
  const perfectStates: Array<{ memberName: string; state: string; total: number }> = [];

  resultRows.forEach((row) => {
    const key = `${row.prediction.userId}::${row.state}`;
    const entry = stateAccuracy.get(key) ?? {
      correct: 0,
      total: 0,
      memberName: row.member?.displayName ?? row.prediction.userId,
      state: row.state,
    };
    entry.total += 1;
    if (row.prediction.status === 'correct') entry.correct += 1;
    stateAccuracy.set(key, entry);
  });

  let bestState: { memberName: string; state: string; correct: number; total: number; pct: number } | null = null;
  for (const entry of stateAccuracy.values()) {
    if (entry.total === 0) continue;
    const pct = entry.correct / entry.total;
    const candidate = { ...entry, pct };
    if (!bestState || candidate.pct > bestState.pct || (candidate.pct === bestState.pct && candidate.total > bestState.total)) {
      bestState = candidate;
    }
    if (entry.correct === entry.total && entry.total > 0) {
      perfectStates.push({ memberName: entry.memberName, state: entry.state, total: entry.total });
    }
  }

  return {
    biggestUpset,
    consensusMiss,
    bestState,
    uniqueCorrect: uniqueCorrect.slice(0, 5),
    perfectStates: perfectStates.slice(0, 5),
  };
}
