import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../App';
import { collection, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Race, BallotMeasure } from '../types';
import { SEED_RACES, SEED_MEASURES } from '../constants/electionData';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { CheckCircle2, Info, Loader2 } from 'lucide-react';
import { ALLOW_ADMIN_SEED, USE_MOCK_CONTESTS } from '../lib/config';
import { ResearchDrawer } from '../components/ResearchDrawer';
import { useContestResearch, ResearchTarget } from '../hooks/useContestResearch';

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

type CycleKey = string; // `${electionYear}-${mode}`, e.g. "2024-sandbox", "2026-live"

function cycleKeyFor(contest: { electionYear?: number; mode?: string }): CycleKey {
  return `${contest.electionYear ?? 'unknown'}-${contest.mode ?? 'sandbox'}`;
}

function cycleLabel(key: CycleKey) {
  const [year, mode] = key.split('-');
  return `${year} ${mode === 'live' ? 'Live' : 'Sandbox'}`;
}

export function Races() {
  const { profile, isAdmin } = useAuth();
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState<CycleKey | null>(null);
  const [researchTarget, setResearchTarget] = useState<ResearchTarget>(null);
  const { bundle, loading: researchLoading, error: researchError } = useContestResearch(researchTarget);

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

  const availableCycles = useMemo(() => {
    const keys = new Set<CycleKey>();
    races.forEach((r) => keys.add(cycleKeyFor(r)));
    measures.forEach((m) => keys.add(cycleKeyFor(m)));
    return Array.from(keys).sort();
  }, [races, measures]);

  const activeCycle = selectedCycle && availableCycles.includes(selectedCycle)
    ? selectedCycle
    : availableCycles[0] ?? null;
  const visibleRaces = useMemo(
    () => races.filter((r) => !activeCycle || cycleKeyFor(r) === activeCycle),
    [races, activeCycle],
  );
  const visibleMeasures = useMemo(
    () => measures.filter((m) => !activeCycle || cycleKeyFor(m) === activeCycle),
    [measures, activeCycle],
  );

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
        <div className="border-b border-brand-blue/10 pb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title text-4xl font-black italic uppercase">Browse Contests</h1>
            <p className="text-xs font-mono uppercase text-black/40 mt-1">View contests and open research. Make picks inside a league.</p>
          </div>
          {availableCycles.length > 1 && (
            <div className="flex items-center gap-1 rounded-xl bg-black/5 p-1">
              {availableCycles.map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedCycle(key)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all',
                    activeCycle === key ? 'bg-white text-brand-blue shadow-sm' : 'text-black/50 hover:text-black/80',
                  )}
                >
                  {cycleLabel(key)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibleRaces.map((race) => (
            <div key={race.id} className="card-surface overflow-hidden transition-shadow hover:shadow-xl hover:shadow-brand-blue/10">
              <div className="bg-brand-slate text-white p-4 flex justify-between items-start gap-3">
                <button
                  onClick={() => setResearchTarget({ kind: 'race', raceId: race.id })}
                  className="space-y-1 text-left group"
                  title="Open contest research"
                >
                  <span className="text-[10px] font-mono uppercase bg-brand-red px-1.5 py-0.5 rounded-sm">{race.state}</span>
                  <p className="text-xs font-black uppercase tracking-tight flex items-center gap-1.5">
                    {race.office} {race.district ? `District ${race.district}` : ''}
                    <Info size={12} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                  </p>
                </button>
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
                      <button
                        key={candidate.id}
                        onClick={() => setResearchTarget({ kind: 'race', raceId: race.id, initialCandidateId: candidate.id })}
                        className="w-full rounded-xl border-2 border-black/5 bg-slate-50 p-4 flex items-center justify-between text-left transition-colors hover:border-brand-blue/30 hover:bg-white"
                        title={`Open research for ${candidate.name}`}
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
      <section className="space-y-6 section-shell p-5 sm:p-6">
        <div className="border-b border-brand-red/15 pb-4">
          <h1 className="page-title text-4xl font-black italic uppercase text-brand-red">Ballot Measures</h1>
          <p className="text-xs font-mono uppercase text-black/40 mt-1">View measure outcomes. League picks live in the Leagues tab.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibleMeasures.map((measure) => (
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
                <button
                  onClick={() => setResearchTarget({ kind: 'measure', measureId: measure.id })}
                  className="text-left group w-full"
                  title="Open measure research"
                >
                  <h3 className="font-black uppercase tracking-tight text-sm mb-1 flex items-center gap-1.5">
                    {measure.title}
                    <Info size={12} className="text-black/30 group-hover:text-brand-red transition-colors shrink-0" />
                  </h3>
                  <p className="text-[10px] font-mono text-black/60 uppercase leading-tight">{measure.description}</p>
                </button>

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

      <ResearchDrawer
        isOpen={!!researchTarget}
        target={researchTarget}
        bundle={bundle}
        loading={researchLoading}
        error={researchError}
        onClose={() => setResearchTarget(null)}
      />
    </div>
  );
}
