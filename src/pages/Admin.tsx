import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BallotMeasure, League, LeagueMember, Prediction, Race } from '../types';
import {
  buildEligibleLeagueContests,
  isSandboxMeasure,
  isSandboxRace,
  missingPredictionId,
  predictionKey,
  scoreLeagueSimulation,
} from '../lib/leagueSandbox';
import { useAuth } from '../App';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';

const POINTS_PER_CORRECT = 10;
const LEAGUE_POINTS_PER_CORRECT = 1;
const FIRESTORE_BATCH_LIMIT = 450;

function byName(a: { state: string }, b: { state: string }) {
  return a.state.localeCompare(b.state);
}

async function commitBatches(
  writes: Array<(batch: ReturnType<typeof writeBatch>) => void>,
) {
  for (let index = 0; index < writes.length; index += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    writes.slice(index, index + FIRESTORE_BATCH_LIMIT).forEach((write) => write(batch));
    await batch.commit();
  }
}

export function Admin() {
  const { isAdmin, user } = useAuth();
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    const qRaces = query(collection(db, 'races'), orderBy('state', 'asc'));
    const unsubRaces = onSnapshot(qRaces, (snap) => {
      setRaces(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Race)).sort(byName));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'races'));

    const qMeasures = query(collection(db, 'ballotMeasures'), orderBy('state', 'asc'));
    const unsubMeasures = onSnapshot(qMeasures, (snap) => {
      setMeasures(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BallotMeasure)).sort(byName));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'ballotMeasures'));

    const qLeagues = query(collection(db, 'leagues'), orderBy('createdAt', 'desc'));
    const unsubLeagues = onSnapshot(qLeagues, (snap) => {
      setLeagues(snap.docs.map((d) => ({ id: d.id, ...d.data() } as League)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leagues'));

    return () => {
      unsubRaces();
      unsubMeasures();
      unsubLeagues();
    };
  }, [isAdmin]);

  const calledRaces = useMemo(() => races.filter((r) => r.status === 'called'), [races]);
  const openRaces = useMemo(() => races.filter((r) => r.status !== 'called'), [races]);
  const calledMeasures = useMemo(() => measures.filter((m) => m.status === 'called'), [measures]);
  const openMeasures = useMemo(() => measures.filter((m) => m.status !== 'called'), [measures]);
  const eligibleRaces = useMemo(() => races.filter(isSandboxRace), [races]);
  const eligibleMeasures = useMemo(() => measures.filter(isSandboxMeasure), [measures]);
  const eligibleContestCount = eligibleRaces.length + eligibleMeasures.length;

  async function scoreTarget(targetId: string, correctPick: string) {
    const predsQ = query(collection(db, 'predictions'), where('targetId', '==', targetId));

    let predsSnap;
    try {
      predsSnap = await getDocs(predsQ);
    } catch (error) {
      throw handleFirestoreError(error, OperationType.LIST, 'predictions');
    }

    const batch = writeBatch(db);

    // Update prediction statuses and apply points
    for (const predDoc of predsSnap.docs) {
      const prediction = predDoc.data() as Omit<Prediction, 'id'>;
      const nextStatus = prediction.pick === correctPick ? 'correct' : 'incorrect';

      batch.update(predDoc.ref, { status: nextStatus });

      if (nextStatus === 'correct') {
        const userRef = doc(db, 'users', prediction.userId);
        batch.update(userRef, {
          totalPoints: increment(POINTS_PER_CORRECT),
          correctPredictions: increment(1),
        });
      }
    }

    await batch.commit();
  }

  async function getLeagueMembers(leagueId: string) {
    const membersSnap = await getDocs(collection(db, `leagues/${leagueId}/members`));
    return membersSnap.docs.map((memberDoc) => ({ id: memberDoc.id, ...memberDoc.data() } as LeagueMember & { id: string }));
  }

  async function getLeaguePredictions(leagueId: string) {
    const predictionsSnap = await getDocs(query(collection(db, 'predictions'), where('leagueId', '==', leagueId)));
    return predictionsSnap.docs.map((predictionDoc) => ({
      id: predictionDoc.id,
      ref: predictionDoc.ref,
      data: predictionDoc.data() as Omit<Prediction, 'id'>,
    }));
  }

  async function simulateLeague(league: League) {
    if (!isAdmin || !user) return;
    if (eligibleContestCount === 0) {
      setNotice({ kind: 'error', message: 'No eligible 2024 sandbox contests with results are loaded.' });
      return;
    }

    setBusyId(`simulate-${league.id}`);
    setNotice(null);

    try {
      const members = await getLeagueMembers(league.id);
      if (members.length === 0) {
        setNotice({ kind: 'error', message: 'This league has no members to score.' });
        return;
      }

      const leaguePredictions = await getLeaguePredictions(league.id);
      const predictionByMemberTarget = new Map<string, (typeof leaguePredictions)[number]>();
      for (const prediction of leaguePredictions) {
        predictionByMemberTarget.set(predictionKey(prediction.data.userId, prediction.data.targetId), prediction);
      }

      const contests = buildEligibleLeagueContests(eligibleRaces, eligibleMeasures);
      const scorePlan = scoreLeagueSimulation(
        members,
        leaguePredictions.map((prediction) => ({ id: prediction.id, ...prediction.data } as Prediction)),
        contests,
        LEAGUE_POINTS_PER_CORRECT,
      );

      if (scorePlan.missingTotal > 0) {
        const proceed = window.confirm(
          `${scorePlan.missingTotal} missing picks will be scored as 0 across ${members.length} league members. Simulate anyway?`,
        );
        if (!proceed) return;
      }

      const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

      for (const outcome of scorePlan.outcomes) {
        const existing = predictionByMemberTarget.get(predictionKey(outcome.userId, outcome.contest.targetId));
        if (!existing) {
          const ref = doc(db, 'predictions', missingPredictionId(league.id, outcome.userId, outcome.contest.targetId));
          writes.push((batch) => batch.set(ref, {
            userId: outcome.userId,
            leagueId: league.id,
            targetId: outcome.contest.targetId,
            type: outcome.contest.type,
            status: 'missing',
            score: 0,
            correctPick: outcome.correctPick,
            createdAt: serverTimestamp(),
            scoredAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }));
          continue;
        }

        writes.push((batch) => batch.update(existing.ref, {
          status: outcome.status,
          score: outcome.score,
          correctPick: outcome.correctPick,
          scoredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }));
      }

      for (const member of members) {
        const score = scorePlan.memberScores.get(member.userId)!;
        const memberRef = doc(db, `leagues/${league.id}/members`, member.userId);
        writes.push((batch) => batch.update(memberRef, {
          points: score.points,
          correctPicks: score.correctPicks,
          incorrectPicks: score.incorrectPicks,
          missingPicks: score.missingPicks,
          completedPicks: score.correctPicks + score.incorrectPicks,
          totalEligiblePicks: scorePlan.contests.length,
          updatedAt: serverTimestamp(),
        }));
      }

      writes.push((batch) => batch.update(doc(db, 'leagues', league.id), {
        contestMode: 'sandbox',
        contestYear: 2024,
        simulationStatus: 'simulated',
        simulatedAt: serverTimestamp(),
        simulatedBy: user.uid,
        eligibleContestCount: scorePlan.contests.length,
        totalScoredPicks: scorePlan.totalScoredPicks,
        totalMissingPicks: scorePlan.missingTotal,
      }));

      await commitBatches(writes);
      setNotice({ kind: 'success', message: `Simulated ${league.name}: ${scorePlan.contests.length} contests scored for ${members.length} members.` });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leagues/${league.id}/simulation`);
      setNotice({ kind: 'error', message: 'Failed to simulate league.' });
    } finally {
      setBusyId(null);
    }
  }

  async function resetLeague(league: League) {
    if (!isAdmin || !user) return;

    const proceed = window.confirm(`Reset simulation for ${league.name}? This clears league scores and reopens picks.`);
    if (!proceed) return;

    setBusyId(`reset-${league.id}`);
    setNotice(null);

    try {
      const [members, leaguePredictions] = await Promise.all([
        getLeagueMembers(league.id),
        getLeaguePredictions(league.id),
      ]);

      const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
      for (const prediction of leaguePredictions) {
        const isMissingRecord = prediction.data.status === 'missing' && !prediction.data.pick;
        if (isMissingRecord) {
          writes.push((batch) => batch.delete(prediction.ref));
          continue;
        }

        writes.push((batch) => batch.update(prediction.ref, {
          status: 'pending',
          score: deleteField(),
          correctPick: deleteField(),
          scoredAt: deleteField(),
          updatedAt: serverTimestamp(),
        }));
      }

      for (const member of members) {
        writes.push((batch) => batch.update(doc(db, `leagues/${league.id}/members`, member.userId), {
          points: 0,
          correctPicks: 0,
          incorrectPicks: 0,
          missingPicks: 0,
          completedPicks: 0,
          totalEligiblePicks: eligibleContestCount,
          updatedAt: serverTimestamp(),
        }));
      }

      writes.push((batch) => batch.update(doc(db, 'leagues', league.id), {
        simulationStatus: 'open',
        resetAt: serverTimestamp(),
        resetBy: user.uid,
        simulatedAt: deleteField(),
        simulatedBy: deleteField(),
        totalScoredPicks: 0,
        totalMissingPicks: 0,
      }));

      await commitBatches(writes);
      setNotice({ kind: 'success', message: `Reset ${league.name}. Picks are open again.` });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leagues/${league.id}/reset`);
      setNotice({ kind: 'error', message: 'Failed to reset league simulation.' });
    } finally {
      setBusyId(null);
    }
  }

  async function callRace(race: Race, winnerId: string) {
    if (!isAdmin) return;
    setBusyId(race.id);
    setNotice(null);
    try {
      await updateDoc(doc(db, 'races', race.id), {
        status: 'called',
        winnerId,
      });
      await scoreTarget(race.id, winnerId);
      setNotice({ kind: 'success', message: `Called ${race.state} ${race.office} and scored predictions.` });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `races/${race.id}`);
      setNotice({ kind: 'error', message: 'Failed to call race / score predictions.' });
    } finally {
      setBusyId(null);
    }
  }

  async function callMeasure(measure: BallotMeasure, result: 'pass' | 'fail') {
    if (!isAdmin) return;
    setBusyId(measure.id);
    setNotice(null);
    try {
      await updateDoc(doc(db, 'ballotMeasures', measure.id), {
        status: 'called',
        result,
      });
      await scoreTarget(measure.id, result);
      setNotice({ kind: 'success', message: `Called ${measure.state} measure and scored predictions.` });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ballotMeasures/${measure.id}`);
      setNotice({ kind: 'error', message: 'Failed to call measure / score predictions.' });
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-8 bg-white border border-black/10">
        <p className="font-mono text-xs uppercase text-black/50">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-12">
      <div className="border-b-2 border-black/20 pb-4">
        <h1 className="text-4xl font-black italic tracking-tighter uppercase italic">Admin Console</h1>
        <p className="text-xs font-mono uppercase text-black/40 mt-1">
          Call results and score predictions (+{POINTS_PER_CORRECT} per correct pick).
        </p>
      </div>

      {notice && (
        <div className={cn(
          "border p-3 font-mono text-[10px] uppercase",
          notice.kind === 'error'
            ? "border-brand-red/40 bg-brand-red/10 text-brand-red"
            : "border-green-600/30 bg-green-600/10 text-green-700"
        )}>
          {notice.message}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-black/10 pb-2">
          <h2 className="font-black italic text-xl uppercase italic text-brand-blue">League Simulation</h2>
          <p className="text-[10px] font-mono uppercase text-black/40">{eligibleContestCount} eligible 2024 sandbox contests</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {leagues.map((league) => {
            const isSimulated = league.simulationStatus === 'simulated';
            const isBusy = busyId === `simulate-${league.id}` || busyId === `reset-${league.id}`;
            return (
              <div key={league.id} className="bg-white border border-black/10 p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-black uppercase tracking-tight text-sm">{league.name}</p>
                    <p className="text-[10px] font-mono uppercase text-black/40">Invite {league.inviteCode}</p>
                  </div>
                  <span className={cn(
                    "text-[10px] font-black px-2 py-1 uppercase transform -skew-x-12",
                    isSimulated ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                  )}>
                    {league.simulationStatus ?? 'open'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-[10px] font-mono uppercase text-black/40">Scored</p>
                    <p className="font-black">{league.totalScoredPicks ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-[10px] font-mono uppercase text-black/40">Missing</p>
                    <p className="font-black">{league.totalMissingPicks ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-[10px] font-mono uppercase text-black/40">Contests</p>
                    <p className="font-black">{league.eligibleContestCount ?? eligibleContestCount}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isBusy || isSimulated || eligibleContestCount === 0}
                    onClick={() => simulateLeague(league)}
                    className="rounded-lg bg-brand-blue px-3 py-3 text-xs font-black uppercase text-white transition hover:bg-brand-red disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Simulate
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || !isSimulated}
                    onClick={() => resetLeague(league)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-3 text-xs font-black uppercase transition hover:border-brand-red hover:text-brand-red disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>
              </div>
            );
          })}
          {leagues.length === 0 && (
            <div className="bg-white border border-black/10 p-6 font-mono text-[10px] uppercase text-black/40 lg:col-span-2">
              No leagues found.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-black/10 pb-2">
          <h2 className="font-black italic text-xl uppercase italic">Races</h2>
          <p className="text-[10px] font-mono uppercase text-black/40">{openRaces.length} open • {calledRaces.length} called</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {races.map((race) => {
            const isCalled = race.status === 'called';
            const isBusy = busyId === race.id;
            return (
              <div key={race.id} className="bg-white border border-black/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-black uppercase tracking-tight text-sm">{race.state} • {race.office}{race.district ? ` • District ${race.district}` : ''}</p>
                    <p className="text-[10px] font-mono uppercase text-black/40">Target: {race.id}</p>
                  </div>
                  <span className={cn(
                    "text-[10px] font-black px-2 py-1 uppercase transform -skew-x-12",
                    isCalled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                  )}>
                    {race.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {race.candidates.map((c) => (
                    <button
                      key={c.id}
                      disabled={isCalled || isBusy}
                      onClick={() => callRace(race, c.id)}
                      className={cn(
                        "w-full p-3 border-2 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed",
                        race.winnerId === c.id ? "border-brand-blue bg-brand-blue/5" : "border-black/5 hover:border-black/20 bg-slate-50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-extrabold text-sm uppercase leading-none">{c.name}</p>
                          <p className="text-[9px] font-mono text-black/40 uppercase mt-1">{c.party}</p>
                        </div>
                        <span className="text-[10px] font-mono uppercase text-black/40">
                          {isCalled ? 'Called' : 'Call winner'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-black/10 pb-2">
          <h2 className="font-black italic text-xl uppercase italic text-brand-red">Ballot Measures</h2>
          <p className="text-[10px] font-mono uppercase text-black/40">{openMeasures.length} open • {calledMeasures.length} called</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {measures.map((m) => {
            const isCalled = m.status === 'called';
            const isBusy = busyId === m.id;
            return (
              <div key={m.id} className="bg-white border border-black/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-black uppercase tracking-tight text-sm">{m.state} • Initiative</p>
                    <p className="text-[10px] font-mono uppercase text-black/40">Target: {m.id}</p>
                  </div>
                  <span className={cn(
                    "text-[10px] font-black px-2 py-1 uppercase transform -skew-x-12",
                    isCalled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                  )}>
                    {m.status}
                  </span>
                </div>

                <div>
                  <p className="font-black uppercase tracking-tight text-sm">{m.title}</p>
                  <p className="text-[10px] font-mono text-black/60 uppercase leading-tight mt-1">{m.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(['pass', 'fail'] as const).map((opt) => (
                    <button
                      key={opt}
                      disabled={isCalled || isBusy}
                      onClick={() => callMeasure(m, opt)}
                      className={cn(
                        "p-3 border-2 font-black uppercase text-xs tracking-tighter transition-all disabled:opacity-60 disabled:cursor-not-allowed",
                        m.result === opt ? "bg-brand-red text-white border-brand-red" : "bg-slate-50 border-black/5 hover:border-black/20"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
