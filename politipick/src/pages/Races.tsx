import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Race, BallotMeasure } from '../types';
import { SEED_RACES, SEED_MEASURES } from '../constants/electionData';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { ALLOW_ADMIN_SEED, USE_MOCK_CONTESTS } from '../lib/config';

function formatDateTime(date: string) {
  const ms = Date.parse(date);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function Races() {
  const { profile, isAdmin } = useAuth();
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }

    if (USE_MOCK_CONTESTS) {
      setRaces(SEED_RACES);
      setMeasures(SEED_MEASURES);
      setLoading(false);
    }

    // 1. Fetch Races & Seed
    const unsubscribeRaces = onSnapshot(collection(db, 'races'), async (snapshot) => {
      if (snapshot.empty) {
        setRaces([]);
        // Dev-only: admins may seed mock contests into Firestore if explicitly enabled.
        if (isAdmin && ALLOW_ADMIN_SEED) {
          try {
            for (const race of SEED_RACES) {
              await setDoc(doc(db, 'races', race.id), race);
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'races(seed)');
          }
        }
      } else {
        setRaces(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Race)));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'races');
    });

    // 2. Fetch Measures & Seed
    const unsubscribeMeasures = onSnapshot(collection(db, 'ballotMeasures'), async (snapshot) => {
      if (snapshot.empty) {
        setMeasures([]);
        // Dev-only: admins may seed mock contests into Firestore if explicitly enabled.
        if (isAdmin && ALLOW_ADMIN_SEED) {
          try {
            for (const measure of SEED_MEASURES) {
              await setDoc(doc(db, 'ballotMeasures', measure.id), measure);
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'ballotMeasures(seed)');
          }
        }
      } else {
        setMeasures(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BallotMeasure)));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ballotMeasures');
    });

    setLoading(false);

    return () => {
      unsubscribeRaces();
      unsubscribeMeasures();
    };
  }, [profile, isAdmin]);

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="animate-spin text-brand-blue" size={32} />
    </div>
  );

  return (
    <div className="space-y-12 pb-12">
      {!USE_MOCK_CONTESTS && races.length === 0 && measures.length === 0 && (
        <div className="card-surface p-4 font-mono text-[10px] uppercase text-black/50">
          No contests loaded yet. This environment expects an ingest job to populate Firestore.
        </div>
      )}
      {/* Races Section */}
      <section className="space-y-6 section-shell p-5 sm:p-6">
        <div className="border-b border-brand-blue/10 pb-4">
          <h1 className="page-title text-4xl font-black italic uppercase">Browse Contests</h1>
          <p className="text-xs font-mono uppercase text-black/40 mt-1">View-only 2024 sandbox contests. Make picks inside a league.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {races.map((race) => (
            <div key={race.id} className="card-surface overflow-hidden transition-shadow hover:shadow-xl hover:shadow-brand-blue/10">
              <div className="bg-brand-slate text-white p-4 flex justify-between items-start gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase bg-brand-red px-1.5 py-0.5 rounded-sm">{race.state}</span>
                  <p className="text-xs font-black uppercase tracking-tight">{race.office} {race.district ? `District ${race.district}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-2 text-right">
                  <span className="text-[10px] font-mono uppercase opacity-80">
                    Closes {formatDateTime(race.closeDate)}
                  </span>
                  <span className="text-[10px] font-black uppercase bg-white/15 px-2 py-1 rounded-sm">
                    View Only
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  {race.candidates.map((candidate) => {
                    return (
                      <div
                        key={candidate.id}
                        className="w-full rounded-xl border-2 border-black/5 bg-slate-50 p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-3 h-3 rounded-full",
                            candidate.party === 'Democrat' ? "bg-blue-600" : 
                            candidate.party === 'Republican' ? "bg-brand-red" : "bg-slate-400"
                          )} />
                          <div className="text-left">
                            <p className="font-extrabold text-sm uppercase leading-none">{candidate.name}</p>
                            <p className="text-[9px] font-mono text-black/40 uppercase mt-1">{candidate.party}</p>
                          </div>
                        </div>
                        {race.winnerId === candidate.id && (
                          <span className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                            <CheckCircle2 size={12} /> Result
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Measures Section */}
      <section className="space-y-6 section-shell p-5 sm:p-6">
        <div className="border-b border-brand-red/15 pb-4">
          <h1 className="page-title text-4xl font-black italic uppercase text-brand-red">Ballot Measures</h1>
          <p className="text-xs font-mono uppercase text-black/40 mt-1">View measure outcomes. League picks live in the Leagues tab.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {measures.map((measure) => (
            <div key={measure.id} className="card-surface overflow-hidden">
              <div className="bg-brand-red text-white p-4 flex justify-between items-center text-xs font-black uppercase gap-3">
                <div className="flex items-center gap-2">
                  <span>{measure.state} • Initiative</span>
                  <span className="text-[10px] font-black uppercase bg-white/20 px-2 py-1 rounded-sm">
                    View Only
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase opacity-80">
                  Closes {formatDateTime(measure.closeDate)}
                </span>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="font-black uppercase tracking-tight text-sm mb-1">{measure.title}</h3>
                  <p className="text-[10px] font-mono text-black/60 uppercase leading-tight">{measure.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {['pass', 'fail'].map((option) => {
                    return (
                      <div
                        key={option}
                        className={cn(
                          "rounded-xl p-3 border-2 font-black uppercase text-xs tracking-tight text-center",
                          measure.result === option ? "bg-brand-red text-white border-brand-red" : "bg-slate-50 border-black/5 text-black/45"
                        )}
                      >
                        {option}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
