import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, onSnapshot, setDoc, doc, query, getDocs, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Race, Prediction, BallotMeasure } from '../types';
import { SEED_RACES, SEED_MEASURES } from '../constants/electionData';
import { motion } from 'motion/react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { Check, Loader2 } from 'lucide-react';
import { ALLOW_ADMIN_SEED, USE_MOCK_CONTESTS } from '../lib/config';

const PICK_LOCK_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getPickLockMs(closeDate: string) {
  const closeMs = Date.parse(closeDate);
  if (!Number.isFinite(closeMs)) return null;
  return closeMs - PICK_LOCK_WINDOW_MS;
}

function isPickLocked(closeDate: string) {
  const lockMs = getPickLockMs(closeDate);
  if (lockMs === null) return false;
  return Date.now() >= lockMs;
}

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
  const [predictions, setPredictions] = useState<Record<string, string>>({}); // targetId -> pick
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

    // 3. Fetch User's current predictions
    if (profile) {
      const q = query(collection(db, 'predictions'), where('userId', '==', profile.uid));
      const unsubscribePicks = onSnapshot(q, (snapshot) => {
        const picks: Record<string, string> = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          picks[data.targetId] = data.pick;
        });
        setPredictions(picks);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'predictions');
      });
      
      return () => {
        unsubscribeRaces();
        unsubscribeMeasures();
        unsubscribePicks();
      };
    }

    return () => {
      unsubscribeRaces();
      unsubscribeMeasures();
    };
  }, [profile, isAdmin]);

  const handlePick = async (targetId: string, pick: string, type: 'race' | 'measure', closeDate: string) => {
    if (!profile) return;
    if (isPickLocked(closeDate)) {
      setNotice(`Picks are locked for this contest. Locked 1 hour before close (${formatDateTime(closeDate)}).`);
      return;
    }
    setNotice(null);
    setSubmitting(targetId);
    try {
      const q = query(
        collection(db, 'predictions'), 
        where('userId', '==', profile.uid), 
        where('targetId', '==', targetId)
      );
      
      let existing;
      try {
        existing = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'predictions');
        return;
      }
      
      try {
        if (!existing.empty) {
          await setDoc(existing.docs[0].ref, { 
            pick,
            updatedAt: serverTimestamp() 
          }, { merge: true });
        } else {
          await addDoc(collection(db, 'predictions'), {
            userId: profile.uid,
            targetId,
            type,
            pick,
            status: 'pending',
            createdAt: serverTimestamp()
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'predictions');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="animate-spin text-brand-blue" size={32} />
    </div>
  );

  return (
    <div className="space-y-12 pb-12">
      {notice && (
        <div className="border border-brand-red/40 bg-brand-red/10 text-brand-red p-3 font-mono text-[10px] uppercase">
          {notice}
        </div>
      )}

      {!USE_MOCK_CONTESTS && races.length === 0 && measures.length === 0 && (
        <div className="border border-black/10 bg-white p-4 font-mono text-[10px] uppercase text-black/50">
          No contests loaded yet. This environment expects an ingest job to populate Firestore.
        </div>
      )}
      {/* Races Section */}
      <section className="space-y-6">
        <div className="border-b-2 border-brand-blue pb-4">
          <h1 className="text-4xl font-black italic tracking-tighter uppercase italic">Midterm Races</h1>
          <p className="text-xs font-mono uppercase text-black/40 mt-1">Pick your winners for the key 2026 contests.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {races.map((race) => (
            <div key={race.id} className="bg-white border border-black/10 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="bg-brand-slate text-white p-3 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-mono uppercase bg-brand-red px-1.5 py-0.5 mr-2">{race.state}</span>
                  <span className="text-xs font-black uppercase tracking-tight">{race.office} {race.district ? `District ${race.district}` : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase opacity-80">
                    Closes {formatDateTime(race.closeDate)}
                  </span>
                  {isPickLocked(race.closeDate) && (
                    <span className="text-[10px] font-black uppercase bg-brand-red px-2 py-1">
                      Locked
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  {race.candidates.map((candidate) => {
                    const isSelected = predictions[race.id] === candidate.id;
                    const isSubmitting = submitting === race.id;
                    const locked = isPickLocked(race.closeDate);

                    return (
                      <button
                        key={candidate.id}
                        disabled={isSubmitting || locked}
                        onClick={() => handlePick(race.id, candidate.id, 'race', race.closeDate)}
                        className={cn(
                          "w-full p-4 flex items-center justify-between border-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed",
                          isSelected 
                            ? "border-brand-blue bg-brand-blue/5" 
                            : "border-black/5 hover:border-black/20 bg-slate-50"
                        )}
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
                        {isSelected && <Check className="text-brand-blue" size={18} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Measures Section */}
      <section className="space-y-6">
        <div className="border-b-2 border-brand-red pb-4">
          <h1 className="text-4xl font-black italic tracking-tighter uppercase italic text-brand-red">Ballot Measures</h1>
          <p className="text-xs font-mono uppercase text-black/40 mt-1">Predict the outcome of state-level initiatives.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {measures.map((measure) => (
            <div key={measure.id} className="bg-white border border-black/10 overflow-hidden shadow-sm">
              <div className="bg-brand-red text-white p-3 flex justify-between items-center text-xs font-black uppercase">
                <div className="flex items-center gap-2">
                  <span>{measure.state} • Initiative</span>
                  {isPickLocked(measure.closeDate) && (
                    <span className="text-[10px] font-black uppercase bg-white/20 px-2 py-1">
                      Locked
                    </span>
                  )}
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
                    const isSelected = predictions[measure.id] === option;
                    const locked = isPickLocked(measure.closeDate);
                    return (
                      <button
                        key={option}
                        disabled={locked}
                        onClick={() => handlePick(measure.id, option, 'measure', measure.closeDate)}
                        className={cn(
                          "p-3 border-2 font-black uppercase text-xs tracking-tighter transition-all disabled:opacity-60 disabled:cursor-not-allowed",
                          isSelected ? "bg-brand-red text-white border-brand-red" : "bg-slate-50 border-black/5 hover:border-black/20"
                        )}
                      >
                        {option}
                      </button>
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
