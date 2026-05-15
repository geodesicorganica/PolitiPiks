import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, onSnapshot, setDoc, doc, query, getDocs, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Race, Prediction, BallotMeasure, Candidate } from '../types';
import { SEED_RACES, SEED_MEASURES } from '../constants/electionData';
import { motion } from 'motion/react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { Check, Loader2, ExternalLink, Clock } from 'lucide-react';

export function Races({ onSelectCandidate }: { onSelectCandidate: (candidate: Candidate) => void }) {
  const { profile } = useAuth();
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [predictions, setPredictions] = useState<Record<string, string>>({}); // targetId -> pick
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }

    // 1. Fetch Races & Seed
    const unsubscribeRaces = onSnapshot(collection(db, 'races'), async (snapshot) => {
      if (snapshot.empty) {
        for (const race of SEED_RACES) {
          await setDoc(doc(db, 'races', race.id), race);
        }
      } else {
        setRaces(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Race)));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'races');
    });

    // 2. Fetch Measures & Seed
    const unsubscribeMeasures = onSnapshot(collection(db, 'measures'), async (snapshot) => {
      if (snapshot.empty) {
        for (const measure of SEED_MEASURES) {
          await setDoc(doc(db, 'measures', measure.id), measure);
        }
      } else {
        setMeasures(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BallotMeasure)));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'measures');
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
  }, [profile]);

  const handlePick = async (targetId: string, pick: string, type: 'race' | 'measure') => {
    if (!profile) return;
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
    <div className="space-y-16 pb-12">
      {/* Races Section */}
      <section className="space-y-8">
        <div className="border-b-4 border-slate-800 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-5xl font-black italic tracking-tighter uppercase italic text-white">Predictions</h1>
            <p className="text-xs font-mono uppercase text-slate-500 mt-2">Identify winners. Maximize clout. Execute your picks.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {races.map((race) => (
            <div key={race.id} className="brutalist-card bg-slate-900 group">
              <div className="bg-brand-dark p-4 flex justify-between items-center border-b border-slate-800">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-mono uppercase bg-brand-red px-2 py-1 text-white font-black">{race.state}</span>
                  <span className="text-xs font-black uppercase tracking-tight text-white">{race.office} {race.district ? `District ${race.district}` : ''}</span>
                </div>
                <a href={race.ballotpediaUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-slate-500 hover:text-brand-red flex items-center gap-1 uppercase">
                   Ballotpedia <ExternalLink size={10} />
                </a>
              </div>

              <div className="p-6 space-y-6">
                <p className="text-[11px] text-slate-400 font-medium uppercase leading-relaxed border-l-2 border-slate-800 pl-4">
                   {race.summary}
                </p>

                <div className="grid grid-cols-1 gap-3">
                  {race.candidates.map((candidate) => {
                    const isSelected = predictions[race.id] === candidate.id;
                    const isSubmitting = submitting === race.id;

                    return (
                      <button
                        key={candidate.id}
                        disabled={isSubmitting}
                        onClick={() => handlePick(race.id, candidate.id, 'race')}
                        className={cn(
                          "w-full p-5 flex items-center justify-between border transition-all brutalist-card",
                          isSelected 
                            ? "border-brand-red bg-brand-red/10 scale-[1.01]" 
                            : "border-slate-800 bg-black/40 hover:border-slate-600"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-4 h-4 rotate-45",
                            candidate.party === 'Democrat' ? "bg-blue-600" : 
                            candidate.party === 'Republican' ? "bg-brand-red" : "bg-slate-400"
                          )} />
                          <div className="text-left space-y-1">
                            <p className="font-black text-sm uppercase leading-none text-white cursor-pointer hover:text-brand-red transition-colors" onClick={(e) => { e.stopPropagation(); onSelectCandidate(candidate); }}>{candidate.name}</p>
                            <p className="text-[9px] font-mono text-slate-500 uppercase flex items-center gap-2">
                               {candidate.party} • <span className="hover:text-brand-red cursor-pointer" onClick={(e) => { e.stopPropagation(); window.open(candidate.ballotpediaUrl, '_blank'); }}>BIOGRAPHY</span>
                            </p>
                          </div>
                        </div>
                        {isSelected && <div className="bg-brand-red text-white p-1 shadow-[2px_2px_0px_0px_#000]"><Check size={14} /></div>}
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
      <section className="space-y-8">
        <div className="border-b-4 border-slate-800 pb-6">
          <h1 className="text-5xl font-black italic tracking-tighter uppercase italic text-brand-red">Initiatives</h1>
          <p className="text-xs font-mono uppercase text-slate-500 mt-2">State-level legislative forecasts.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {measures.map((measure) => (
            <div key={measure.id} className="brutalist-card bg-slate-900 overflow-hidden">
              <div className="bg-brand-red text-white p-4 flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                <span>{measure.state} / LEGISLATIVE</span>
                <Clock size={14} />
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <h3 className="font-black uppercase tracking-tight text-xl text-white italic">{measure.title}</h3>
                  <p className="text-xs text-slate-400 font-medium uppercase leading-relaxed border-l-2 border-brand-red pl-4">{measure.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {['pass', 'fail'].map((option) => {
                    const isSelected = predictions[measure.id] === option;
                    return (
                      <button
                        key={option}
                        onClick={() => handlePick(measure.id, option, 'measure')}
                        className={cn(
                          "p-4 border font-black uppercase text-xs tracking-[0.2em] transition-all brutalist-card shadow-none",
                          isSelected ? "bg-brand-red text-white border-brand-red translate-y-1 translate-x-1" : "bg-black/40 border-slate-800 text-slate-500 hover:text-white"
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
