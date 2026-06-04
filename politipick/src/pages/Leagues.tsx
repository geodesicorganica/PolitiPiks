import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../App';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BallotMeasure, League, LeagueMember, Prediction, Race } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { ArrowLeft, ArrowRight, Check, Copy, Landmark, MapPinned, Plus, Trophy, Users, Vote } from 'lucide-react';

type LeagueTab = 'state' | 'statewide' | 'senate' | 'measures' | 'president';
type PredictionLookup = Record<string, Pick<Prediction, 'id' | 'pick' | 'status'>>;

const LEAGUE_TABS: Array<{ id: LeagueTab; label: string; icon: typeof MapPinned }> = [
  { id: 'state', label: 'State View', icon: MapPinned },
  { id: 'statewide', label: 'Statewide', icon: Landmark },
  { id: 'senate', label: 'Senate', icon: Vote },
  { id: 'measures', label: 'Measures', icon: Check },
  { id: 'president', label: 'President', icon: Trophy },
];

function formatOffice(race: Race) {
  return `${race.office}${race.district ? ` ${race.district}` : ''}`;
}

function byStateName(a: { state: string }, b: { state: string }) {
  return a.state.localeCompare(b.state);
}

function isCalled(contest: Race | BallotMeasure) {
  return contest.status === 'called';
}

export function Leagues() {
  const { profile } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [tab, setTab] = useState<'my' | 'join' | 'create'>('my');
  const [copied, setCopied] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!profile) return;

    let cancelled = false;
    const unsubscribe = onSnapshot(collection(db, 'leagues'), async (snapshot) => {
      try {
        const visibleLeagues = await Promise.all(snapshot.docs.map(async (leagueDoc) => {
          const league = { id: leagueDoc.id, ...leagueDoc.data() } as League;
          if (league.ownerId === profile.uid) return league;

          const memberSnap = await getDoc(doc(db, `leagues/${league.id}/members`, profile.uid));
          return memberSnap.exists() ? league : null;
        }));

        if (!cancelled) {
          setLeagues(visibleLeagues.filter((league): league is League => Boolean(league)));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'leagues');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leagues');
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [profile]);

  const handleCreate = async () => {
    if (!profile || !newLeagueName.trim()) return;
    setIsSubmitting(true);
    setNotice(null);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
      const docRef = await addDoc(collection(db, 'leagues'), {
        name: newLeagueName.trim(),
        ownerId: profile.uid,
        inviteCode: code,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, `leagues/${docRef.id}/members`, profile.uid), {
        userId: profile.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL || '',
        points: profile.totalPoints || 0,
        joinedAt: serverTimestamp()
      });

      setNewLeagueName('');
      setTab('my');
      setNotice({ tone: 'success', message: 'League created successfully.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'leagues');
      setNotice({ tone: 'error', message: 'Failed to create league. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleJoin = async () => {
    if (!profile || !inviteCode) return;
    setIsSubmitting(true);
    setNotice(null);
    try {
      const q = query(collection(db, 'leagues'), where('inviteCode', '==', inviteCode));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setNotice({ tone: 'error', message: 'Invalid invite code.' });
        setIsSubmitting(false);
        return;
      }

      const leagueId = snapshot.docs[0].id;

      await setDoc(doc(db, `leagues/${leagueId}/members`, profile.uid), {
        userId: profile.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL || '',
        points: profile.totalPoints || 0,
        joinedAt: serverTimestamp()
      });

      setInviteCode('');
      setTab('my');
      setNotice({ tone: 'success', message: 'Joined league successfully.' });
    } catch (err) {
      console.error(err);
      setNotice({ tone: 'error', message: 'Failed to join league. You might already be a member.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedLeague) {
    return (
      <LeagueOverview
        league={selectedLeague}
        onBack={() => setSelectedLeague(null)}
      />
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {notice && (
        <div className={cn(
          "rounded-lg border p-3 font-mono text-[10px] uppercase",
          notice.tone === 'success'
            ? "border-emerald-300/70 bg-emerald-50 text-emerald-700"
            : "border-brand-red/40 bg-brand-red/10 text-brand-red"
        )}>
          {notice.message}
        </div>
      )}
      <div className="border-b border-brand-blue/15 pb-4 flex justify-between items-end gap-3">
        <div>
          <h1 className="page-title text-4xl font-black italic uppercase">Leagues</h1>
          <p className="text-xs font-mono uppercase text-black/40 mt-1">Compete with friends in private groups.</p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={isSubmitting}
            onClick={() => setTab('join')}
            className={cn("px-4 py-2 rounded-lg font-bold uppercase text-xs transition-all", tab === 'join' ? "bg-brand-blue text-white" : "bg-white text-black/40 hover:text-black")}
          >
            Join
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => setTab('create')}
            className={cn("px-4 py-2 rounded-lg font-bold uppercase text-xs transition-all", tab === 'create' ? "bg-brand-red text-white" : "bg-white text-black/40 hover:text-black")}
          >
            Create
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'my' && (
          <motion.div
            key="my"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {leagues.length === 0 ? (
              <div className="section-shell col-span-full p-12 border-2 border-dashed border-black/10 text-center space-y-4">
                <Users size={48} className="mx-auto text-black/10" />
                <p className="font-mono text-xs uppercase text-black/40">You haven't joined or created any leagues yet.</p>
                <button
                  onClick={() => setTab('create')}
                  className="px-6 py-3 rounded-lg bg-brand-blue text-white font-black uppercase tracking-tight hover:bg-brand-red transition-colors"
                >
                  Start a League
                </button>
              </div>
            ) : (
              leagues.map((league) => (
                <button
                  type="button"
                  key={league.id}
                  onClick={() => setSelectedLeague(league)}
                  className="card-surface p-6 border-l-8 border-brand-blue space-y-4 text-left transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-blue/10"
                >
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="text-xl font-black italic uppercase tracking-tight">{league.name}</h3>
                    <div className="text-right" onClick={(event) => event.stopPropagation()}>
                      <p className="text-[10px] font-mono uppercase text-black/40">Invite Code</p>
                      <button
                        type="button"
                        onClick={() => copyCode(league.inviteCode)}
                        className="flex items-center gap-2 font-mono font-bold text-brand-blue hover:text-brand-red transition-colors"
                      >
                        {league.inviteCode}
                        {copied === league.inviteCode ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-black/5">
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white" />
                      <div className="w-8 h-8 rounded-full bg-slate-300 border-2 border-white" />
                      <div className="w-8 h-8 rounded-full bg-slate-400 border-2 border-white flex items-center justify-center text-[10px] font-bold">+</div>
                    </div>
                    <span className="text-[10px] font-black uppercase flex items-center gap-1 text-brand-blue">
                      Open League <ArrowRight size={12} />
                    </span>
                  </div>
                </button>
              ))
            )}
          </motion.div>
        )}

        {tab === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="max-w-md mx-auto section-shell p-8 border-t-8 border-brand-red space-y-6"
          >
            <h2 className="text-2xl font-black italic uppercase tracking-tight text-center">New Fantasy League</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-mono uppercase text-black/40 block mb-1">League Name</label>
                <input
                  type="text"
                  value={newLeagueName}
                  disabled={isSubmitting}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  placeholder="The Politicos"
                  className="w-full p-4 rounded-lg bg-slate-50 border border-black/10 font-bold uppercase tracking-tight focus:outline-none focus:border-brand-blue disabled:opacity-50"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={isSubmitting || !newLeagueName.trim()}
                className="w-full py-4 rounded-lg bg-brand-red text-white font-black uppercase tracking-tight hover:bg-brand-blue transition-colors flex items-center justify-center gap-2 disabled:bg-slate-300"
              >
                {isSubmitting ? 'Launching...' : 'Launch League'} <Plus size={18} />
              </button>
              <button onClick={() => setTab('my')} className="w-full text-center text-[10px] font-mono uppercase text-black/40 hover:text-black disabled:opacity-0">Cancel</button>
            </div>
          </motion.div>
        )}

        {tab === 'join' && (
          <motion.div
            key="join"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="max-w-md mx-auto section-shell p-8 border-t-8 border-brand-blue space-y-6"
          >
            <h2 className="text-2xl font-black italic uppercase tracking-tight text-center">Join League</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-mono uppercase text-black/40 block mb-1">Enter 6-Digit Code</label>
                <input
                  type="text"
                  value={inviteCode}
                  disabled={isSubmitting}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  className="w-full p-4 rounded-lg bg-slate-50 border border-black/10 font-bold uppercase tracking-widest text-center text-xl focus:outline-none focus:border-brand-blue disabled:opacity-50"
                />
              </div>
              <button
                onClick={handleJoin}
                disabled={isSubmitting || inviteCode.length < 6}
                className="w-full py-4 rounded-lg bg-brand-blue text-white font-black uppercase tracking-tight hover:bg-brand-red transition-colors flex items-center justify-center gap-2 disabled:bg-slate-300"
              >
                {isSubmitting ? 'Joining...' : 'Join Squad'} <Users size={18} />
              </button>
              <button onClick={() => setTab('my')} className="w-full text-center text-[10px] font-mono uppercase text-black/40 hover:text-black disabled:opacity-0">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LeagueOverview({ league, onBack }: { league: League; onBack: () => void }) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<LeagueTab>('state');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [predictions, setPredictions] = useState<PredictionLookup>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsubscribeRaces = onSnapshot(query(collection(db, 'races'), orderBy('state', 'asc')), (snapshot) => {
      setRaces(snapshot.docs.map((raceDoc) => ({ id: raceDoc.id, ...raceDoc.data() } as Race)).sort(byStateName));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'races'));

    const unsubscribeMeasures = onSnapshot(query(collection(db, 'ballotMeasures'), orderBy('state', 'asc')), (snapshot) => {
      setMeasures(snapshot.docs.map((measureDoc) => ({ id: measureDoc.id, ...measureDoc.data() } as BallotMeasure)).sort(byStateName));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'ballotMeasures'));

    const unsubscribeMembers = onSnapshot(query(collection(db, `leagues/${league.id}/members`), orderBy('points', 'desc')), (snapshot) => {
      setMembers(snapshot.docs.map((memberDoc) => memberDoc.data() as LeagueMember));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `leagues/${league.id}/members`));

    return () => {
      unsubscribeRaces();
      unsubscribeMeasures();
      unsubscribeMembers();
    };
  }, [league.id]);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'predictions'), where('userId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next: PredictionLookup = {};
      snapshot.docs.forEach((predictionDoc) => {
        const prediction = { id: predictionDoc.id, ...predictionDoc.data() } as Prediction;
        if (prediction.leagueId === league.id) {
          next[prediction.targetId] = {
            id: prediction.id,
            pick: prediction.pick,
            status: prediction.status,
          };
        }
      });
      setPredictions(next);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'predictions'));

    return () => unsubscribe();
  }, [league.id, profile]);

  const states = useMemo(() => {
    const names = new Set<string>();
    races.forEach((race) => names.add(race.state));
    measures.forEach((measure) => names.add(measure.state));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [races, measures]);

  const visibleStates = selectedState === 'all' ? states : states.filter((state) => state === selectedState);

  const categoryRaces = useMemo(() => {
    const byTab = races.filter((race) => {
      if (activeTab === 'president') return race.office === 'President';
      if (activeTab === 'senate') return race.office === 'Senate';
      if (activeTab === 'statewide') return race.office === 'Governor';
      return false;
    });
    return selectedState === 'all' ? byTab : byTab.filter((race) => race.state === selectedState);
  }, [activeTab, races, selectedState]);

  const categoryMeasures = useMemo(() => {
    if (activeTab !== 'measures') return [];
    return selectedState === 'all' ? measures : measures.filter((measure) => measure.state === selectedState);
  }, [activeTab, measures, selectedState]);

  async function handlePick(targetId: string, pick: string, type: 'race' | 'measure') {
    if (!profile) return;
    setSubmitting(targetId);
    setNotice(null);

    try {
      const existing = predictions[targetId];
      if (existing) {
        await setDoc(doc(db, 'predictions', existing.id), {
          pick,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        await addDoc(collection(db, 'predictions'), {
          userId: profile.uid,
          leagueId: league.id,
          targetId,
          type,
          pick,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }
      setNotice({ tone: 'success', message: 'Pick saved.' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'predictions');
      setNotice({ tone: 'error', message: 'Failed to save pick.' });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-4 border-b border-brand-blue/15 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase text-black/45 hover:text-brand-blue"
          >
            <ArrowLeft size={14} /> Leagues
          </button>
          <h1 className="page-title text-4xl font-black italic uppercase">{league.name}</h1>
          <p className="text-xs font-mono uppercase text-black/40 mt-1">Invite code {league.inviteCode}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {LEAGUE_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase transition",
                activeTab === item.id ? "bg-brand-blue text-white" : "bg-white text-black/55 hover:text-black"
              )}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className={cn(
          "rounded-lg border p-3 font-mono text-[10px] uppercase",
          notice.tone === 'success' ? "border-emerald-300/70 bg-emerald-50 text-emerald-700" : "border-brand-red/40 bg-brand-red/10 text-brand-red"
        )}>
          {notice.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[180px_minmax(0,1fr)_280px]">
        <aside className="space-y-2 xl:sticky xl:top-24 xl:self-start">
          <button
            type="button"
            onClick={() => setSelectedState('all')}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-left text-[10px] font-black uppercase transition",
              selectedState === 'all' ? "border-brand-blue bg-brand-blue text-white" : "border-black/10 bg-white text-black/55 hover:text-black"
            )}
          >
            All States
          </button>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
            {states.map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => setSelectedState(state)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-[10px] font-black uppercase transition",
                  selectedState === state ? "border-brand-red bg-brand-red text-white" : "border-black/10 bg-white text-black/55 hover:text-black"
                )}
              >
                {state}
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {activeTab === 'state' ? (
            visibleStates.map((state) => (
              <div key={state}>
                <StateContestGrid
                  state={state}
                  races={races.filter((race) => race.state === state)}
                  measures={measures.filter((measure) => measure.state === state)}
                  predictions={predictions}
                  submitting={submitting}
                  onRacePick={(targetId, pick) => handlePick(targetId, pick, 'race')}
                  onMeasurePick={(targetId, pick) => handlePick(targetId, pick, 'measure')}
                />
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {categoryRaces.map((race) => (
                <div key={race.id}>
                  <RacePickCard
                    race={race}
                    prediction={predictions[race.id]}
                    submitting={submitting === race.id}
                    onPick={(pick) => handlePick(race.id, pick, 'race')}
                  />
                </div>
              ))}
              {categoryMeasures.map((measure) => (
                <div key={measure.id}>
                  <MeasurePickCard
                    measure={measure}
                    prediction={predictions[measure.id]}
                    submitting={submitting === measure.id}
                    onPick={(pick) => handlePick(measure.id, pick, 'measure')}
                  />
                </div>
              ))}
              {categoryRaces.length === 0 && categoryMeasures.length === 0 && (
                <div className="rounded-lg border border-dashed border-black/15 bg-white p-8 text-center font-mono text-[10px] uppercase text-black/40 lg:col-span-2">
                  No contests in this view.
                </div>
              )}
            </div>
          )}
        </main>

        <LeaderboardPanel members={members} currentUserId={profile?.uid ?? null} />
      </div>
    </div>
  );
}

function StateContestGrid({
  state,
  races,
  measures,
  predictions,
  submitting,
  onRacePick,
  onMeasurePick,
}: {
  state: string;
  races: Race[];
  measures: BallotMeasure[];
  predictions: PredictionLookup;
  submitting: string | null;
  onRacePick: (targetId: string, pick: string) => void;
  onMeasurePick: (targetId: string, pick: 'pass' | 'fail') => void;
}) {
  const president = races.find((race) => race.office === 'President');
  const governor = races.find((race) => race.office === 'Governor');
  const senate = races.find((race) => race.office === 'Senate');
  const house = races.find((race) => race.office === 'House');

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-brand-blue/10 pb-2">
        <h2 className="text-xl font-black italic uppercase tracking-normal">{state}</h2>
        <span className="font-mono text-[10px] uppercase text-black/40">{races.length + measures.length} contests</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ContestSlot title="Presidential Race">
          {president ? (
            <RacePickCard race={president} prediction={predictions[president.id]} submitting={submitting === president.id} onPick={(pick) => onRacePick(president.id, pick)} />
          ) : null}
        </ContestSlot>
        <ContestSlot title="Gubernatorial Race">
          {governor ? (
            <RacePickCard race={governor} prediction={predictions[governor.id]} submitting={submitting === governor.id} onPick={(pick) => onRacePick(governor.id, pick)} />
          ) : null}
        </ContestSlot>
        <ContestSlot title="Senate Race">
          {senate ? (
            <RacePickCard race={senate} prediction={predictions[senate.id]} submitting={submitting === senate.id} onPick={(pick) => onRacePick(senate.id, pick)} />
          ) : null}
        </ContestSlot>
        <ContestSlot title="Congressional Race">
          {house ? (
            <RacePickCard race={house} prediction={predictions[house.id]} submitting={submitting === house.id} onPick={(pick) => onRacePick(house.id, pick)} />
          ) : null}
        </ContestSlot>
      </div>

      {measures.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {measures.map((measure) => (
            <div key={measure.id}>
              <MeasurePickCard
                measure={measure}
                prediction={predictions[measure.id]}
                submitting={submitting === measure.id}
                onPick={(pick) => onMeasurePick(measure.id, pick)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ContestSlot({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-40">
      {children || (
        <div className="h-full rounded-lg border border-dashed border-black/15 bg-white/70 p-4">
          <p className="text-[10px] font-mono uppercase text-black/35">{title}</p>
          <p className="mt-6 text-center text-[10px] font-mono uppercase text-black/30">No contest loaded</p>
        </div>
      )}
    </div>
  );
}

function RacePickCard({
  race,
  prediction,
  submitting,
  onPick,
}: {
  race: Race;
  prediction?: Pick<Prediction, 'pick' | 'status'>;
  submitting: boolean;
  onPick: (pick: string) => void;
}) {
  const disabled = submitting || isCalled(race);

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-black/5 bg-brand-slate p-3 text-white">
        <div>
          <p className="text-[10px] font-mono uppercase text-white/60">{race.state}</p>
          <h3 className="text-sm font-black uppercase tracking-normal">{formatOffice(race)}</h3>
        </div>
        <span className={cn("rounded px-2 py-1 text-[10px] font-black uppercase", isCalled(race) ? "bg-emerald-500/20 text-emerald-100" : "bg-white/10 text-white/75")}>
          {race.status ?? 'open'}
        </span>
      </div>

      <div className="space-y-2 p-3">
        {race.candidates.map((candidate) => {
          const selected = prediction?.pick === candidate.id;
          return (
            <button
              key={candidate.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(candidate.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                selected ? "border-brand-blue bg-brand-blue/5" : "border-black/10 bg-white hover:border-brand-blue/30"
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black uppercase tracking-normal">{candidate.name}</p>
                <p className="text-[10px] font-mono uppercase text-black/40">{candidate.party}</p>
              </div>
              {selected && <Check size={16} className="shrink-0 text-brand-blue" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MeasurePickCard({
  measure,
  prediction,
  submitting,
  onPick,
}: {
  measure: BallotMeasure;
  prediction?: Pick<Prediction, 'pick' | 'status'>;
  submitting: boolean;
  onPick: (pick: 'pass' | 'fail') => void;
}) {
  const disabled = submitting || isCalled(measure);

  return (
    <div className="card-surface overflow-hidden">
      <div className="border-b border-black/5 bg-brand-red p-3 text-white">
        <p className="text-[10px] font-mono uppercase text-white/70">{measure.state} measure</p>
        <h3 className="text-sm font-black uppercase tracking-normal">{measure.title}</h3>
      </div>
      <div className="space-y-3 p-3">
        <p className="text-[10px] font-mono uppercase leading-relaxed text-black/50">{measure.description}</p>
        <div className="grid grid-cols-2 gap-2">
          {(['pass', 'fail'] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onPick(option)}
              className={cn(
                "rounded-lg border p-3 text-xs font-black uppercase transition disabled:cursor-not-allowed disabled:opacity-60",
                prediction?.pick === option ? "border-brand-red bg-brand-red text-white" : "border-black/10 bg-white hover:border-brand-red/30"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LeaderboardPanel({ members, currentUserId }: { members: LeagueMember[]; currentUserId: string | null }) {
  return (
    <aside className="xl:sticky xl:top-24 xl:self-start">
      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/5 p-4">
          <h2 className="text-sm font-black uppercase tracking-normal">Leaderboard</h2>
          <Trophy size={16} className="text-brand-red" />
        </div>
        <div className="divide-y divide-black/5">
          <AnimatePresence initial={false}>
            {members.map((member, index) => (
              <motion.div
                layout
                key={member.userId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className={cn("flex items-center gap-3 p-3", member.userId === currentUserId && "bg-brand-blue/5")}
              >
                <div className="w-7 shrink-0 text-center text-sm font-black italic text-brand-red">{index + 1}</div>
                <img
                  src={member.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${member.displayName}`}
                  alt=""
                  className="h-9 w-9 rounded-full border border-black/10 bg-slate-100"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black uppercase tracking-normal">{member.displayName}</p>
                  <p className="text-[10px] font-mono uppercase text-black/40">{member.points} pts</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {members.length === 0 && (
            <div className="p-6 text-center text-[10px] font-mono uppercase text-black/35">No members yet.</div>
          )}
        </div>
      </div>
    </aside>
  );
}
