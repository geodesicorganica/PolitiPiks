import React, { useEffect, useMemo, useState } from 'react';
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
import { BallotMeasure, Candidate, CandidateResearch, League, LeagueMember, MeasureResearch, Prediction, Race, ResearchSection, ResearchSource } from '../types';
import {
  buildContestSummaries,
  buildLeagueResultRows,
  calculateLeagueProgress,
  calculateLeagueResultStats,
  contestCategory,
  contestLabel,
  getStateContestGroups,
  pickLabel,
  type ContestSummary,
  type LeaguePredictionRecord,
  type PredictionLookup,
} from '../lib/leagueSandbox';
import { motion, AnimatePresence } from 'motion/react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { ArrowLeft, ArrowRight, BarChart3, Check, Copy, ExternalLink, Info, Landmark, MapPinned, Plus, Trophy, Users, Vote, X } from 'lucide-react';

import { ResearchDrawer } from '../components/ResearchDrawer';
import { ResearchTarget, useContestResearch } from '../hooks/useContestResearch';

type LeagueTab = 'state' | 'house' | 'senate' | 'measures' | 'president';

const LEAGUE_TABS: Array<{ id: LeagueTab; label: string; icon: typeof MapPinned }> = [
  { id: 'state', label: 'State View', icon: MapPinned },
  { id: 'house', label: 'House', icon: Landmark },
  { id: 'senate', label: 'Senate', icon: Vote },
  { id: 'measures', label: 'Measures', icon: Check },
  { id: 'president', label: 'President', icon: Trophy },
];

// Buckets moved to ResearchDrawer

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
  const [newLeagueCycle, setNewLeagueCycle] = useState<'2024-sandbox' | '2026-live'>('2024-sandbox');
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
      const [cycleYear, cycleMode] = newLeagueCycle.split('-');
      const docRef = await addDoc(collection(db, 'leagues'), {
        name: newLeagueName.trim(),
        ownerId: profile.uid,
        inviteCode: code,
        contestYear: Number(cycleYear),
        contestMode: cycleMode,
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
    const liveSelectedLeague = leagues.find((league) => league.id === selectedLeague.id) ?? selectedLeague;
    return (
      <LeagueOverview
        league={liveSelectedLeague}
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
            data-testid="open-join-league"
            className={cn("px-4 py-2 rounded-lg font-bold uppercase text-xs transition-all", tab === 'join' ? "bg-brand-blue text-white" : "bg-white text-black/40 hover:text-black")}
          >
            Join
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => setTab('create')}
            data-testid="open-create-league"
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
                <article
                  key={league.id}
                  className="card-surface p-6 border-l-8 border-brand-blue space-y-4 text-left transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-blue/10"
                >
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="text-xl font-black italic uppercase tracking-tight">{league.name}</h3>
                    <div className="text-right">
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
                    <button
                      type="button"
                      onClick={() => setSelectedLeague(league)}
                      data-testid={`open-league-${league.id}`}
                      className="text-[10px] font-black uppercase flex items-center gap-1 text-brand-blue transition hover:text-brand-red"
                    >
                      Open League <ArrowRight size={12} />
                    </button>
                  </div>
                </article>
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
                  data-testid="league-name-input"
                  className="w-full p-4 rounded-lg bg-slate-50 border border-black/10 font-bold uppercase tracking-tight focus:outline-none focus:border-brand-blue disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-black/40 block mb-1">Contest Cycle</label>
                <select
                  value={newLeagueCycle}
                  disabled={isSubmitting}
                  onChange={(e) => setNewLeagueCycle(e.target.value as '2024-sandbox' | '2026-live')}
                  data-testid="league-cycle-select"
                  className="w-full p-4 rounded-lg bg-slate-50 border border-black/10 font-bold uppercase tracking-tight focus:outline-none focus:border-brand-blue disabled:opacity-50"
                >
                  <option value="2024-sandbox">2024 Sandbox (Historical)</option>
                  <option value="2026-live">2026 Live (Midterms)</option>
                </select>
              </div>
              <button
                onClick={handleCreate}
                disabled={isSubmitting || !newLeagueName.trim()}
                data-testid="launch-league"
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
                  data-testid="league-invite-input"
                  className="w-full p-4 rounded-lg bg-slate-50 border border-black/10 font-bold uppercase tracking-widest text-center text-xl focus:outline-none focus:border-brand-blue disabled:opacity-50"
                />
              </div>
              <button
                onClick={handleJoin}
                disabled={isSubmitting || inviteCode.length < 6}
                data-testid="join-league"
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
  const [leaguePredictions, setLeaguePredictions] = useState<LeaguePredictionRecord[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [researchTarget, setResearchTarget] = useState<ResearchTarget>(null);
  const { bundle, loading: researchLoading, error: researchError } = useContestResearch(researchTarget);
  const picksLocked = league.simulationStatus === 'simulated';

  useEffect(() => {
    // Leagues are scoped to one contest cycle; existing leagues without the
    // fields predate live contests and default to the 2024 sandbox.
    const leagueYear = league.contestYear ?? 2024;
    const leagueMode = league.contestMode ?? 'sandbox';
    const inLeagueCycle = (contest: { electionYear?: number; mode?: string }) =>
      (contest.electionYear ?? 2024) === leagueYear && (contest.mode ?? 'sandbox') === leagueMode;

    const unsubscribeRaces = onSnapshot(query(collection(db, 'races'), orderBy('state', 'asc')), (snapshot) => {
      setRaces(snapshot.docs.map((raceDoc) => ({ id: raceDoc.id, ...raceDoc.data() } as Race)).filter(inLeagueCycle).sort(byStateName));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'races'));

    const unsubscribeMeasures = onSnapshot(query(collection(db, 'ballotMeasures'), orderBy('state', 'asc')), (snapshot) => {
      setMeasures(snapshot.docs.map((measureDoc) => ({ id: measureDoc.id, ...measureDoc.data() } as BallotMeasure)).filter(inLeagueCycle).sort(byStateName));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'ballotMeasures'));

    const unsubscribeMembers = onSnapshot(query(collection(db, `leagues/${league.id}/members`), orderBy('points', 'desc')), (snapshot) => {
      setMembers(snapshot.docs.map((memberDoc) => memberDoc.data() as LeagueMember));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `leagues/${league.id}/members`));

    return () => {
      unsubscribeRaces();
      unsubscribeMeasures();
      unsubscribeMembers();
    };
  }, [league.id, league.contestYear, league.contestMode]);

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

  useEffect(() => {
    if (!picksLocked) {
      setLeaguePredictions([]);
      return;
    }

    const q = query(collection(db, 'predictions'), where('leagueId', '==', league.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeaguePredictions(snapshot.docs.map((predictionDoc) => ({
        id: predictionDoc.id,
        ...predictionDoc.data(),
      } as LeaguePredictionRecord)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `predictions(${league.id})`));

    return () => unsubscribe();
  }, [league.id, picksLocked]);

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
      if (activeTab === 'house') return race.office === 'House';
      return false;
    });
    return selectedState === 'all' ? byTab : byTab.filter((race) => race.state === selectedState);
  }, [activeTab, races, selectedState]);

  const categoryMeasures = useMemo(() => {
    if (activeTab !== 'measures') return [];
    return selectedState === 'all' ? measures : measures.filter((measure) => measure.state === selectedState);
  }, [activeTab, measures, selectedState]);

  const contestSummaries = useMemo(() => buildContestSummaries(races, measures), [races, measures]);
  const progress = useMemo(() => calculateLeagueProgress(contestSummaries, predictions), [contestSummaries, predictions]);
  const resultRows = useMemo(
    () => buildLeagueResultRows(leaguePredictions, races, measures, members),
    [leaguePredictions, races, measures, members],
  );
  const resultStats = useMemo(() => calculateLeagueResultStats(resultRows), [resultRows]);

  async function handlePick(targetId: string, pick: string, type: 'race' | 'measure') {
    if (!profile) return;
    if (picksLocked) {
      setNotice({ tone: 'error', message: 'This league has been simulated. Reset it before changing picks.' });
      return;
    }
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

      <LeagueProgressPanel
        locked={picksLocked}
        races={races}
        measures={measures}
        predictions={predictions}
        progress={progress}
      />

      {picksLocked && (
        <LeagueResultsPanel
          members={members}
          resultRows={resultRows}
          stats={resultStats}
        />
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <main className="min-w-0 space-y-5">
          {/* State Dropdown Filter */}
          <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-black/10 shadow-sm">
            <label htmlFor="state-filter" className="font-mono text-[10px] uppercase text-black/40 font-bold">Filter By State</label>
            <select
              id="state-filter"
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="flex-1 bg-slate-50 border border-black/10 rounded-md px-3 py-1.5 text-xs font-bold uppercase focus:outline-none focus:border-brand-blue"
            >
              <option value="all">All States</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {activeTab === 'state' ? (
            visibleStates.map((state) => (
              <div key={state}>
                <StateContestGrid
                  state={state}
                  races={races.filter((race) => race.state === state)}
                  measures={measures.filter((measure) => measure.state === state)}
                  predictions={predictions}
                  submitting={submitting}
                  locked={picksLocked}
                  onRacePick={(targetId, pick) => handlePick(targetId, pick, 'race')}
                  onMeasurePick={(targetId, pick) => handlePick(targetId, pick, 'measure')}
                  onOpenResearch={setResearchTarget}
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
                    locked={picksLocked}
                    onPick={(pick) => handlePick(race.id, pick, 'race')}
                    onOpenResearch={setResearchTarget}
                  />
                </div>
              ))}
              {categoryMeasures.map((measure) => (
                <div key={measure.id}>
                  <MeasurePickCard
                    measure={measure}
                    prediction={predictions[measure.id]}
                    submitting={submitting === measure.id}
                    locked={picksLocked}
                    onPick={(pick) => handlePick(measure.id, pick, 'measure')}
                    onOpenResearch={setResearchTarget}
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

function LeagueProgressPanel({
  locked,
  races,
  measures,
  predictions,
  progress,
}: {
  locked: boolean;
  races: Race[];
  measures: BallotMeasure[];
  predictions: PredictionLookup;
  progress: { percent: number };
}) {
  const getStats = (items: Array<Race | BallotMeasure>) => {
    const total = items.length;
    const submitted = items.filter(i => predictions[i.id]).length;
    return { total, submitted };
  };

  const categories = [
    { label: 'President', stats: getStats(races.filter(r => r.office === 'President')) },
    { label: 'Senate', stats: getStats(races.filter(r => r.office === 'Senate')) },
    { label: 'House', stats: getStats(races.filter(r => r.office === 'House')) },
    { label: 'Measures', stats: getStats(measures) },
  ];

  return (
    <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
      <div className="flex-1 w-full overflow-x-auto pb-2 lg:pb-0 hide-scrollbar">
        <div className="flex gap-4 min-w-max">
          {categories.map(cat => (
            <div key={cat.label} className="min-w-32 rounded-lg border border-black/10 bg-slate-50 p-4 flex flex-col gap-2 transition hover:-translate-y-1 hover:shadow-md">
              <p className="font-mono text-[10px] uppercase tracking-widest text-brand-blue font-bold">{cat.label}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black">{cat.stats.submitted}</span>
                <span className="text-xs font-bold text-black/40">/ {cat.stats.total}</span>
              </div>
              <div className="h-1.5 w-full bg-black/10 rounded-full overflow-hidden mt-1">
                <div 
                  className={cn("h-full rounded-full transition-all duration-500", cat.stats.submitted === cat.stats.total ? "bg-emerald-500" : "bg-brand-red")}
                  style={{ width: `${cat.stats.total > 0 ? (cat.stats.submitted / cat.stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="shrink-0 rounded-xl bg-brand-slate text-white p-5 text-center min-w-[140px] shadow-inner shadow-black/20">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/50 font-bold mb-1">{locked ? 'Final Score' : 'League Comp'}</p>
        <p className="text-4xl font-black italic text-brand-red">{progress.percent}%</p>
      </div>
    </section>
  );
}

function LeagueResultsPanel({
  members,
  resultRows,
  stats,
}: {
  members: LeagueMember[];
  resultRows: Array<{
    prediction: LeaguePredictionRecord;
    contest?: Race | BallotMeasure;
    member?: LeagueMember;
    state: string;
    category: string;
    contestLabel: string;
    pick: string;
    correctPick: string;
  }>;
  stats: {
    biggestUpset: { label: string; pickedBy: number; memberName: string } | null;
    consensusMiss: { label: string; missedBy: number; pick: string } | null;
    bestState: { memberName: string; state: string; correct: number; total: number; pct: number } | null;
    uniqueCorrect: Array<{ label: string; memberName: string; pick: string }>;
    perfectStates: Array<{ memberName: string; state: string; total: number }>;
  };
}) {
  const visibleRows = resultRows.slice(0, 80);
  return (
    <section className="space-y-4 rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-black/40">Simulation results</p>
          <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-normal">
            <BarChart3 size={18} className="text-brand-blue" />
            League Results
          </h2>
        </div>
        <p className="font-mono text-[10px] uppercase text-black/40">{resultRows.length} scored pick records</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {members.map((member, index) => (
          <div key={member.userId} className="rounded-lg border border-black/10 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black uppercase">{index + 1}. {member.displayName}</p>
                <p className="font-mono text-[10px] uppercase text-black/40">{member.points} pts</p>
              </div>
              <Trophy size={16} className="shrink-0 text-brand-red" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <ResultCounter label="Right" value={member.correctPicks ?? 0} tone="good" />
              <ResultCounter label="Wrong" value={member.incorrectPicks ?? 0} tone="bad" />
              <ResultCounter label="Miss" value={member.missingPicks ?? 0} tone="muted" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <StatCard title="Biggest Upset" value={stats.biggestUpset ? `${stats.biggestUpset.label}` : 'None'} detail={stats.biggestUpset ? `${stats.biggestUpset.memberName} (${stats.biggestUpset.pickedBy})` : 'No correct picks yet'} />
        <StatCard title="Consensus Miss" value={stats.consensusMiss ? stats.consensusMiss.label : 'None'} detail={stats.consensusMiss ? `${stats.consensusMiss.pick} (${stats.consensusMiss.missedBy})` : 'No misses yet'} />
        <StatCard title="Best State" value={stats.bestState ? `${stats.bestState.memberName}` : 'None'} detail={stats.bestState ? `${stats.bestState.state}: ${stats.bestState.correct}/${stats.bestState.total}` : 'No scored states'} />
        <StatCard title="Unique Correct" value={String(stats.uniqueCorrect.length)} detail={stats.uniqueCorrect[0] ? `${stats.uniqueCorrect[0].memberName}: ${stats.uniqueCorrect[0].label}` : 'None'} />
        <StatCard title="Perfect States" value={String(stats.perfectStates.length)} detail={stats.perfectStates[0] ? `${stats.perfectStates[0].memberName}: ${stats.perfectStates[0].state}` : 'None'} />
      </div>

      <div className="overflow-hidden rounded-lg border border-black/10">
        <div className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_90px] gap-2 bg-brand-slate px-3 py-2 text-[10px] font-black uppercase text-white/70">
          <span>Member</span>
          <span>Contest</span>
          <span>Pick</span>
          <span>Status</span>
        </div>
        <div className="max-h-[520px] divide-y divide-black/5 overflow-auto">
          {visibleRows.map((row) => (
            <div key={row.prediction.id} className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_90px] gap-2 px-3 py-2 text-xs">
              <span className="truncate font-black uppercase">{row.member?.displayName ?? row.prediction.userId}</span>
              <span className="min-w-0">
                <span className="block truncate font-black uppercase">{row.state} {row.contestLabel}</span>
                <span className="block truncate font-mono text-[10px] uppercase text-black/35">{row.category}</span>
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold uppercase">{row.pick}</span>
                <span className="block truncate font-mono text-[10px] uppercase text-black/35">Correct: {row.correctPick}</span>
              </span>
              <ResultStatus status={row.prediction.status} />
            </div>
          ))}
          {visibleRows.length === 0 && (
            <div className="p-6 text-center font-mono text-[10px] uppercase text-black/35">No scored picks loaded.</div>
          )}
        </div>
      </div>
      {resultRows.length > visibleRows.length && (
        <p className="font-mono text-[10px] uppercase text-black/35">Showing first {visibleRows.length} of {resultRows.length} scored pick records.</p>
      )}
    </section>
  );
}

function ResultCounter({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'muted' }) {
  return (
    <div className={cn(
      "rounded p-2",
      tone === 'good' && "bg-emerald-50 text-emerald-700",
      tone === 'bad' && "bg-brand-red/10 text-brand-red",
      tone === 'muted' && "bg-white text-black/50"
    )}>
      <p className="text-sm font-black">{value}</p>
      <p className="font-mono text-[9px] uppercase">{label}</p>
    </div>
  );
}

function StatCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="min-h-28 rounded-lg border border-black/10 bg-slate-50 p-3">
      <p className="font-mono text-[10px] uppercase text-black/40">{title}</p>
      <p className="mt-2 text-sm font-black uppercase tracking-normal">{value}</p>
      <p className="mt-2 font-mono text-[10px] uppercase text-black/45">{detail}</p>
    </div>
  );
}

function ResultStatus({ status }: { status: Prediction['status'] }) {
  return (
    <span className={cn(
      "self-start rounded px-2 py-1 text-center text-[10px] font-black uppercase",
      status === 'correct' && "bg-emerald-100 text-emerald-700",
      status === 'incorrect' && "bg-brand-red/10 text-brand-red",
      status === 'missing' && "bg-slate-100 text-black/45",
      status === 'pending' && "bg-brand-blue/10 text-brand-blue"
    )}>
      {status}
    </span>
  );
}

function StateContestGrid({
  state,
  races,
  measures,
  predictions,
  submitting,
  locked,
  onRacePick,
  onMeasurePick,
  onOpenResearch,
}: {
  state: string;
  races: Race[];
  measures: BallotMeasure[];
  predictions: PredictionLookup;
  submitting: string | null;
  locked: boolean;
  onRacePick: (targetId: string, pick: string) => void;
  onMeasurePick: (targetId: string, pick: 'pass' | 'fail') => void;
  onOpenResearch: (target: ResearchTarget) => void;
}) {
  const presidentRaces = races.filter(r => r.office === 'President');
  const senateRaces = races.filter(r => r.office === 'Senate');
  const houseRaces = races.filter(r => r.office === 'House');

  const renderSection = (title: string, items: React.ReactNode[], styleClass: string) => {
    if (items.length === 0) return null;
    return (
      <div className={cn("mt-4 rounded-xl border p-4 shadow-sm", styleClass)}>
        <h3 className="text-xs font-black uppercase tracking-widest text-black/50 mb-4">{title}</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items}
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between border-b border-brand-blue/10 pb-2">
        <h2 className="text-2xl font-black italic uppercase tracking-normal">{state}</h2>
        <span className="font-mono text-[10px] uppercase text-black/40 bg-white px-2 py-1 rounded border border-black/10">{races.length + measures.length} contests</span>
      </div>

      {renderSection("Presidential Race", presidentRaces.map(race => (
        <div key={race.id}>
          <RacePickCard race={race} prediction={predictions[race.id]} submitting={submitting === race.id} locked={locked} onPick={(pick) => onRacePick(race.id, pick)} onOpenResearch={onOpenResearch} />
        </div>
      )), "bg-blue-50/50 border-blue-100")}

      {renderSection("Senate Races", senateRaces.map(race => (
        <div key={race.id}>
          <RacePickCard race={race} prediction={predictions[race.id]} submitting={submitting === race.id} locked={locked} onPick={(pick) => onRacePick(race.id, pick)} onOpenResearch={onOpenResearch} />
        </div>
      )), "bg-indigo-50/50 border-indigo-100")}

      {renderSection("House Races", houseRaces.map(race => (
        <div key={race.id}>
          <RacePickCard race={race} prediction={predictions[race.id]} submitting={submitting === race.id} locked={locked} onPick={(pick) => onRacePick(race.id, pick)} onOpenResearch={onOpenResearch} />
        </div>
      )), "bg-slate-50 border-black/5")}

      {renderSection("Ballot Measures", measures.map(measure => (
        <div key={measure.id}>
          <MeasurePickCard measure={measure} prediction={predictions[measure.id]} submitting={submitting === measure.id} locked={locked} onPick={(pick) => onMeasurePick(measure.id, pick)} onOpenResearch={onOpenResearch} />
        </div>
      )), "bg-brand-red/5 border-brand-red/10")}
    </section>
  );
}

function RacePickCard({
  race,
  prediction,
  submitting,
  locked,
  onPick,
  onOpenResearch,
}: {
  race: Race;
  prediction?: Pick<Prediction, 'pick' | 'status'>;
  submitting: boolean;
  locked: boolean;
  onPick: (pick: string) => void;
  onOpenResearch: (target: ResearchTarget) => void;
}) {
  const disabled = submitting || locked || isCalled(race);

  return (
    <div className="card-surface overflow-hidden">
      <div 
        className="flex cursor-pointer items-start justify-between gap-3 border-b border-black/5 bg-brand-slate p-3 text-white transition hover:bg-brand-slate/90"
        onClick={() => onOpenResearch({ kind: 'race', raceId: race.id })}
      >
        <div>
          <p className="text-[10px] font-mono uppercase text-white/60">{race.state}</p>
          <h3 className="text-sm font-black uppercase tracking-normal">{formatOffice(race)}</h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("rounded px-2 py-1 text-[10px] font-black uppercase", isCalled(race) ? "bg-emerald-500/20 text-emerald-100" : "bg-white/10 text-white/75")}>
            {locked ? 'locked' : race.status ?? 'open'}
          </span>
          <Info size={14} className="text-white/40" />
        </div>
      </div>

      <div className="space-y-2 p-3">
        {race.candidates.map((candidate) => {
          const selected = prediction?.pick === candidate.id;
          return (
            <div
              key={candidate.id}
              className={cn(
                "group flex items-stretch overflow-hidden rounded-lg border transition",
                selected ? "border-brand-blue bg-brand-blue/5" : "border-black/10 bg-white hover:border-brand-blue/30"
              )}
            >
              <button
                type="button"
                onClick={() => onOpenResearch({ kind: 'race', raceId: race.id, initialCandidateId: candidate.id })}
                data-testid={`research-candidate-${race.id}-${candidate.id}`}
                className="flex min-w-0 flex-1 items-center justify-between p-3 text-left transition hover:bg-black/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black uppercase tracking-normal">{candidate.name}</p>
                  <p className="text-[10px] font-mono uppercase text-black/40">
                    {candidate.party}{candidate.incumbent ? ' incumbent' : ''}
                  </p>
                </div>
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(candidate.id)}
                aria-label={`Vote for ${candidate.name}`}
                data-testid={`race-pick-${race.id}-${candidate.id}`}
                className="flex w-14 shrink-0 items-center justify-center border-l border-black/10 transition disabled:cursor-not-allowed disabled:opacity-60 hover:bg-brand-blue/10"
              >
                <div className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                  selected ? "border-brand-blue bg-brand-blue text-white" : "border-black/20 bg-transparent text-transparent group-hover:border-brand-blue/50"
                )}>
                  <Check size={14} className={selected ? "opacity-100 scale-100" : "opacity-0 scale-50 transition-transform"} strokeWidth={4} />
                </div>
              </button>
            </div>
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
  locked,
  onPick,
  onOpenResearch,
}: {
  measure: BallotMeasure;
  prediction?: Pick<Prediction, 'pick' | 'status'>;
  submitting: boolean;
  locked: boolean;
  onPick: (pick: 'pass' | 'fail') => void;
  onOpenResearch: (target: ResearchTarget) => void;
}) {
  const disabled = submitting || locked || isCalled(measure);

  return (
    <div className="card-surface overflow-hidden flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-black/5 bg-brand-red p-3 text-white shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase text-white/70">{measure.state} measure</p>
          <h3 className="text-sm font-black uppercase tracking-normal">{measure.title}</h3>
        </div>
      </div>
      
      <button
        type="button"
        onClick={() => onOpenResearch({ kind: 'measure', measureId: measure.id })}
        className="flex-1 p-3 text-left transition hover:bg-black/5"
      >
        <p className="text-[10px] font-mono uppercase leading-relaxed text-black/50 line-clamp-3">{measure.description}</p>
      </button>

      <div className="grid grid-cols-2 gap-0 border-t border-black/5 divide-x divide-black/5 bg-slate-50 shrink-0">
        {(['pass', 'fail'] as const).map((option) => {
          const selected = prediction?.pick === option;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onPick(option)}
              data-testid={`measure-pick-${measure.id}-${option}`}
              className={cn(
                "group flex items-center justify-between p-3 text-xs font-black uppercase transition disabled:cursor-not-allowed disabled:opacity-60 hover:bg-brand-red/5",
                selected && "bg-brand-red/10"
              )}
            >
              <span className={cn("transition-colors", selected ? "text-brand-red" : "text-black/70 group-hover:text-black")}>{option}</span>
              <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                selected ? "border-brand-red bg-brand-red text-white" : "border-black/20 bg-transparent text-transparent group-hover:border-brand-red/50"
              )}>
                <Check size={14} className={selected ? "opacity-100 scale-100" : "opacity-0 scale-50 transition-transform"} strokeWidth={4} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Old research drawer removed

// Old source components removed

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
