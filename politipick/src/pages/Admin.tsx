import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, updateDoc, doc, where, getDocs, writeBatch, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BallotMeasure, Prediction, Race } from '../types';
import { useAuth } from '../App';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';

const POINTS_PER_CORRECT = 10;

function byName(a: { state: string }, b: { state: string }) {
  return a.state.localeCompare(b.state);
}

export function Admin() {
  const { isAdmin } = useAuth();
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
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

    return () => {
      unsubRaces();
      unsubMeasures();
    };
  }, [isAdmin]);

  const calledRaces = useMemo(() => races.filter((r) => r.status === 'called'), [races]);
  const openRaces = useMemo(() => races.filter((r) => r.status !== 'called'), [races]);
  const calledMeasures = useMemo(() => measures.filter((m) => m.status === 'called'), [measures]);
  const openMeasures = useMemo(() => measures.filter((m) => m.status !== 'called'), [measures]);

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
