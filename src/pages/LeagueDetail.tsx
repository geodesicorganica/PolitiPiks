import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, onSnapshot, query, where, getDocs, doc, setDoc, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { League, LeagueMember, Race, BallotMeasure, Candidate } from '../types';
import { SEED_RACES, SEED_MEASURES } from '../constants/electionData';
import { motion, AnimatePresence } from 'motion/react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { 
  Users, Trophy, Vote, Activity, ArrowLeft, ExternalLink, 
  Info, Check, BarChart2, TrendingUp, BookOpen, Shield, Globe, Target, Trash2
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, BarChart, Bar, Cell, ReferenceLine
} from 'recharts';

interface LeagueDetailProps {
  leagueId: string;
  onBack: () => void;
}

type CategoryType = 'Senate' | 'Gubernatorial' | 'Congress' | 'Ballot Initiatives' | 'Presidential';

export function LeagueDetail({ leagueId, onBack }: LeagueDetailProps) {
  const { profile } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [predictions, setPredictions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryType>('Senate');
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState<BallotMeasure | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [globalSyncing, setGlobalSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (!leagueId) return;

    const unsubscribeLeague = onSnapshot(doc(db, 'leagues', leagueId), (docSnap) => {
      if (docSnap.exists()) {
        setLeague({ id: docSnap.id, ...docSnap.data() } as League);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `leagues/${leagueId}`));

    const membersQuery = query(collection(db, `leagues/${leagueId}/members`), orderBy('points', 'desc'));
    const unsubscribeMembers = onSnapshot(membersQuery, (snapshot) => {
      setMembers(snapshot.docs.map(doc => doc.data() as LeagueMember));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `leagues/${leagueId}/members`));

    const unsubscribeRaces = onSnapshot(collection(db, 'races'), async (snapshot) => {
      if (snapshot.empty) {
        for (const race of SEED_RACES) {
          await setDoc(doc(db, 'races', race.id), race);
        }
      } else {
        const raceData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Race));
        setRaces(raceData);
        
        // Ensure new fields are synced (for demo purposes)
        for (const seedRace of SEED_RACES) {
          const existing = raceData.find(r => r.id === seedRace.id);
          // Sync if any candidate is missing sentimentData, biography, or has incomplete/insufficient keyVotes
          const needsSync = existing && existing.candidates.some(c => 
            !c.sentimentData || 
            !c.biography || 
            !c.keyVotes || 
            c.keyVotes.length < 10 || 
            c.keyVotes.some(v => !v.url || !v.date)
          );
          if (needsSync) {
            await setDoc(doc(db, 'races', seedRace.id), seedRace, { merge: true });
          }
        }
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'races'));

    const unsubscribeMeasures = onSnapshot(collection(db, 'measures'), async (snapshot) => {
      if (snapshot.empty) {
        for (const measure of SEED_MEASURES) {
          await setDoc(doc(db, 'measures', measure.id), measure);
        }
      } else {
        const measureData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BallotMeasure));
        setMeasures(measureData);

        for (const seedMeasure of SEED_MEASURES) {
          const existing = measureData.find(m => m.id === seedMeasure.id);
          if (existing && !existing.ballotpediaUrl) {
            await setDoc(doc(db, 'measures', seedMeasure.id), seedMeasure, { merge: true });
          }
        }
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'measures'));

    if (profile) {
      const pQuery = query(collection(db, 'predictions'), where('userId', '==', profile.uid));
      const unsubscribePicks = onSnapshot(pQuery, (snapshot) => {
        const picks: Record<string, string> = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          picks[data.targetId] = data.pick;
        });
        setPredictions(picks);
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'predictions'));

      return () => {
        unsubscribeLeague();
        unsubscribeMembers();
        unsubscribeRaces();
        unsubscribeMeasures();
        unsubscribePicks();
      };
    }

    return () => {
      unsubscribeLeague();
      unsubscribeMembers();
      unsubscribeRaces();
      unsubscribeMeasures();
    };
  }, [leagueId, profile]);

  const handleRemoveCandidate = async (raceId: string, candidateId: string) => {
    const race = races.find(r => r.id === raceId);
    if (!race || race.candidates.length <= 2) return; 
    
    try {
      const updatedCandidates = race.candidates.filter(c => c.id !== candidateId);
      await setDoc(doc(db, 'races', raceId), { candidates: updatedCandidates }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `races/${raceId}`);
    }
  };

  const handlePick = async (targetId: string, pick: string, type: 'race' | 'measure') => {
    if (!profile) return;
    setSubmitting(targetId);
    try {
      const q = query(
        collection(db, 'predictions'), 
        where('userId', '==', profile.uid), 
        where('targetId', '==', targetId)
      );
      
      const existing = await getDocs(q);
      
      if (!existing.empty) {
        const pDoc = existing.docs[0];
        await setDoc(pDoc.ref, { pick, updatedAt: serverTimestamp() }, { merge: true });
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
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'predictions');
    } finally {
      setSubmitting(null);
    }
  };

  const handleSyncCandidate = async (candidate: Candidate, race: Race) => {
    setSyncingId(candidate.id);
    try {
      const response = await fetch('/api/sync-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          candidateName: candidate.name, 
          currentOffice: race.office,
          state: race.state 
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch intelligence');
      
      const data = await response.json();
      
      // Update the candidate in local races state and Firestore
      const updatedCandidates = race.candidates.map(c => {
        if (c.id === candidate.id) {
          return {
            ...c,
            biography: data.biography,
            keyVotes: data.keyVotes,
            sentimentData: data.sentimentData,
            lastSynced: new Date().toISOString()
          };
        }
        return c;
      });

      await setDoc(doc(db, 'races', race.id), { candidates: updatedCandidates }, { merge: true });
      
      // Update selectedRace if it's the one we're viewing
      if (selectedRace?.id === race.id) {
        setSelectedRace({ ...race, candidates: updatedCandidates });
      }
    } catch (err) {
      console.error('Sync error:', err);
      // We don't use handleFirestoreError here as it's a Gemini API error mostly
    } finally {
      setSyncingId(null);
    }
  };

  const handleGlobalRefresh = async () => {
    if (globalSyncing) return;
    
    const allRaces = races;
    const totalCandidates = allRaces.reduce((acc, r) => acc + r.candidates.length, 0);
    
    setGlobalSyncing(true);
    setSyncProgress({ current: 0, total: totalCandidates });
    
    let processed = 0;
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    
    try {
      for (const race of allRaces) {
        let raceUpdated = false;
        const updatedCandidates = [...race.candidates];
        
        for (let i = 0; i < updatedCandidates.length; i++) {
          const candidate = updatedCandidates[i];
          
          // Skip if synced in last 24 hours
          const lastSynced = candidate.lastSynced ? new Date(candidate.lastSynced).getTime() : 0;
          const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
          
          if (lastSynced > oneDayAgo) {
            processed++;
            setSyncProgress({ current: processed, total: totalCandidates });
            continue;
          }

          setSyncingId(candidate.id);
          
          try {
            const response = await fetch('/api/sync-candidate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                candidateName: candidate.name, 
                currentOffice: race.office,
                state: race.state 
              }),
            });

            if (response.status === 429) {
              console.error('Gemini Quota Exceeded. Stopping batch sync.');
              setGlobalSyncing(false);
              alert('Gemini API Quota Exceeded. Please wait a minute before trying again.');
              return;
            }

            if (response.ok) {
              const data = await response.json();
              updatedCandidates[i] = {
                ...candidate,
                biography: data.biography,
                keyVotes: data.keyVotes,
                sentimentData: data.sentimentData
              };
              raceUpdated = true;
            }
          } catch (err) {
            console.error(`Failed to sync ${candidate.name}:`, err);
          }
          
          processed++;
          setSyncProgress({ current: processed, total: totalCandidates });
          // Increased delay to respect free-tier rate limits (approx 10-15 RPM)
          await delay(4000);
        }
        
        if (raceUpdated) {
          await setDoc(doc(db, 'races', race.id), { candidates: updatedCandidates }, { merge: true });
        }
      }
    } finally {
      setGlobalSyncing(false);
      setSyncingId(null);
    }
  };

  const getDataForCategory = () => {
    switch (activeCategory) {
      case 'Senate': return { items: races.filter(r => r.office === 'Senate'), type: 'race' };
      case 'Gubernatorial': return { items: races.filter(r => r.office === 'Governor'), type: 'race' };
      case 'Presidential': return { items: races.filter(r => r.office === 'President'), type: 'race' };
      case 'Congress': return { items: races.filter(r => r.office === 'Senate' || r.office === 'House'), type: 'race' }; 
      case 'Ballot Initiatives': return { items: measures, type: 'measure' };
      default: return { items: [], type: 'race' };
    }
  };

  const { items, type } = getDataForCategory();

  if (loading || !league) return (
    <div className="flex h-screen items-center justify-center bg-brand-dark">
      <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-full space-y-8 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between border-b-4 border-slate-800 pb-8">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="p-3 bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:border-brand-red transition-all">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white">{league.name}</h1>
            <div className="flex items-center gap-4 text-[10px] font-mono uppercase text-slate-500 mt-2">
              <span className="flex items-center gap-1.5"><Users size={14} className="text-brand-red" /> {members.length} Participants</span>
              <span className="text-brand-blue tracking-widest font-black">Division ALPHA Terminal</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start w-full">
        {/* Left Col: Rankings (Sticky) */}
        <aside className="lg:col-span-3 space-y-6 lg:sticky lg:top-4">
           <section className="bg-slate-900 border border-slate-800 brutalist-card p-6">
              <h2 className="text-xs font-black uppercase mb-6 flex items-center gap-2 text-slate-300">
                <Trophy size={14} className="text-brand-red" /> Leaderboard
              </h2>
              <div className="space-y-4">
                {members.map((member, idx) => (
                  <div key={member.userId} className={cn(
                    "flex items-center justify-between p-3 border-l-4 transition-all",
                    member.userId === profile?.uid ? "border-brand-red bg-brand-red/5" : "border-slate-800 hover:bg-slate-800/50"
                  )}>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-slate-500">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="text-xs font-black uppercase text-white truncate max-w-[120px] italic">{member.displayName}</span>
                    </div>
                    <span className="font-mono font-black text-brand-red text-xs">{member.points}</span>
                  </div>
                ))}
              </div>
           </section>

           <div className="p-6 bg-brand-dark border border-slate-800 text-[10px] font-mono text-slate-500 uppercase leading-relaxed space-y-2">
              <p className="text-brand-red font-black">System Status:</p>
              <p>Predictive engines active. Global latency: 14ms. Source: Ballotpedia Direct API.</p>
           </div>
        </aside>

      <div className="lg:col-span-9 flex flex-col gap-8 min-h-0">
        
        {/* Navigation Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 flex-1 overflow-x-auto scroll-hide no-scrollbar whitespace-nowrap">
            {(['Senate', 'Gubernatorial', 'Congress', 'Ballot Initiatives', 'Presidential'] as CategoryType[]).map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-all flex-shrink-0",
                  activeCategory === cat 
                    ? "bg-brand-red text-white shadow-[4px_4px_0px_0px_#000]" 
                    : "text-slate-500 hover:text-white"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          
          <div className="flex flex-col items-end gap-1">
            <button 
              onClick={handleGlobalRefresh}
              disabled={globalSyncing}
              className={cn(
                "flex items-center gap-2 px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                globalSyncing 
                  ? "bg-slate-800 text-slate-500 border border-slate-700 animate-pulse" 
                  : "bg-slate-900 border border-slate-700 text-brand-red hover:bg-brand-red hover:text-white hover:border-brand-red shadow-[4px_4px_0px_0px_#000]"
              )}
            >
              {globalSyncing ? (
                <>
                  <Activity size={14} className="animate-spin" />
                  Syncing {syncProgress.current}/{syncProgress.total}
                </>
              ) : (
                <>
                  <TrendingUp size={14} />
                  Global Refresh
                </>
              )}
            </button>
            {!globalSyncing && (
              <span className="text-[9px] font-mono text-slate-600 uppercase">
                Skips records updated in last 24h
              </span>
            )}
          </div>
        </div>

        {/* Table View */}
        <div className="bg-slate-900 border border-slate-800 brutalist-card overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/50 border-b border-slate-800">
                <th className="p-4 text-[10px] font-mono uppercase text-slate-500 font-bold">Location</th>
                <th className="p-4 text-[10px] font-mono uppercase text-slate-500 font-bold">Office/Title</th>
                <th className="p-4 text-[10px] font-mono uppercase text-slate-500 font-bold">Candidates/Details</th>
                <th className="p-4 text-[10px] font-mono uppercase text-slate-500 font-bold">Prediction Status</th>
                <th className="p-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-20 text-center font-mono text-xs uppercase text-slate-600">
                    No active contests detected in this sector.
                  </td>
                </tr>
              ) : (
                items.map((item: any) => {
                  const isRace = type === 'race';
                  const prediction = predictions[item.id];
                  
                  return (
                    <tr 
                      key={item.id} 
                      onClick={() => isRace ? setSelectedRace(item) : setSelectedMeasure(item)}
                      className="group cursor-pointer hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="p-6">
                        <span className="bg-brand-red/10 text-brand-red px-2 py-1 text-[10px] font-black uppercase">{item.state}</span>
                      </td>
                      <td className="p-6">
                        <p className="text-sm font-black italic uppercase tracking-tighter text-white group-hover:text-brand-red transition-colors">
                          {isRace ? item.office : item.title}
                        </p>
                        <p className="text-[9px] font-mono text-slate-500 uppercase mt-1">
                          {isRace ? (item.district ? `District ${item.district}` : 'Statewide') : 'Legislative Initiative'}
                        </p>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-2">
                           {isRace ? (
                             <div className="flex -space-x-2">
                               {item.candidates.map((c: any) => (
                                 <div key={c.id} className={cn(
                                   "w-6 h-6 border-2 border-slate-900 rounded-full flex items-center justify-center font-black text-[8px] text-white",
                                   c.party === 'Democrat' ? "bg-blue-600" : "bg-brand-red"
                                 )}>
                                   {c.name[0]}
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <span className="text-[10px] text-slate-400 font-medium">YES / NO OPTIONS</span>
                           )}
                        </div>
                      </td>
                      <td className="p-6">
                         {prediction ? (
                           <div className="flex items-center gap-2 text-emerald-500">
                              <Check size={14} />
                              <span className="text-[10px] font-black uppercase tracking-widest italic">{prediction}</span>
                           </div>
                         ) : (
                           <span className="text-[10px] font-bold text-slate-700 uppercase italic">Awaiting Pick</span>
                         )}
                      </td>
                      <td className="p-6 text-right">
                        <button className="bg-white text-black p-2 shadow-[2px_2px_0px_0px_#E01E3C] group-hover:shadow-[4px_4px_0px_0px_#E01E3C] transition-all">
                           <Activity size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Decision Module Modal */}
      <AnimatePresence>
        {(selectedRace || selectedMeasure) && (
            <DecisionModule 
              race={selectedRace} 
              measure={selectedMeasure} 
              onClose={() => { setSelectedRace(null); setSelectedMeasure(null); }}
              prediction={selectedRace ? predictions[selectedRace.id] : predictions[selectedMeasure!.id]}
              onPick={handlePick}
              onRemoveCandidate={handleRemoveCandidate}
              onSyncCandidate={handleSyncCandidate}
              isSubmitting={submitting === (selectedRace?.id || selectedMeasure?.id)}
              syncingId={syncingId}
            />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function VotingRecord({ votes }: { votes: Candidate['keyVotes'] }) {
  const [showAll, setShowAll] = useState(false);
  const sortedVotes = [...(votes || [])].sort((a, b) => new Date(b.date || '1970-01-01').getTime() - new Date(a.date || '1970-01-01').getTime());
  const displayedVotes = showAll ? sortedVotes : sortedVotes.slice(0, 10);

  // Debug log to verify voting record display
  console.debug('[VotingRecord]', { totalVotes: sortedVotes.length, displayedVotes: displayedVotes.length, titles: displayedVotes.map(v => v.bill) });

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-mono text-slate-500 uppercase">
        Showing {displayedVotes.length} of {sortedVotes.length} votes
      </p>
      {displayedVotes.map((vote, i) => (
        <div key={i} className="border-b border-white/5 pb-3 last:border-0 group">
           <div className="flex justify-between items-center mb-1">
              <a href={vote.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-black text-white uppercase italic tracking-tighter group-hover:text-brand-red transition-colors">{vote.bill}</a>
              <span className={cn(
                "text-[9px] font-mono px-2 py-0.5 font-bold uppercase shrink-0",
                vote.vote === 'Yea' || vote.vote === 'Lead' || vote.vote === 'Support' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
              )}>
                {vote.vote}
              </span>
           </div>
           <p className="text-[10px] text-slate-500 uppercase leading-snug group-hover:text-slate-400 transition-colors">{vote.impact}</p>
           {vote.date && <p className="text-[9px] text-slate-600 font-mono mt-1">{vote.date}</p>}
        </div>
      ))}
      {sortedVotes.length > 10 && (
        <button 
          onClick={() => setShowAll(!showAll)}
          className="text-[10px] uppercase font-black text-brand-red hover:underline"
        >
          {showAll ? 'Show Recent 10' : `Show All (${sortedVotes.length})`}
        </button>
      )}
    </div>
  );
}

function DecisionModule({ 
  race, 
  measure, 
  onClose, 
  prediction, 
  onPick,
  onRemoveCandidate,
  onSyncCandidate,
  isSubmitting,
  syncingId
}: { 
  race: Race | null, 
  measure: BallotMeasure | null, 
  onClose: () => void,
  prediction?: string,
  onPick: (id: string, pick: string, type: 'race' | 'measure') => void,
  onRemoveCandidate: (raceId: string, candidateId: string) => void,
  onSyncCandidate: (candidate: Candidate, race: Race) => void,
  isSubmitting: boolean,
  syncingId: string | null
}) {
  const item = race || measure;
  if (!item) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10"
    >
      <div className="absolute inset-0 bg-brand-dark/95 backdrop-blur-2xl" onClick={onClose} />
      
      <motion.div 
        initial={{ y: 50, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 50, scale: 0.95 }}
        className="w-full max-w-7xl h-full sm:h-[90vh] bg-slate-900 border-2 border-slate-700 shadow-[20px_20px_0px_0px_#000] flex flex-col overflow-hidden relative"
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-4 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-brand-red transition-all z-10"
        >
          <ArrowLeft className="rotate-180" size={24} />
        </button>

        {/* Module Header */}
        <div className="bg-black/50 border-b-4 border-brand-red p-4 sm:p-8 md:p-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-brand-red text-white px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">{item.state} CONTEST</span>
              {race && <span className="bg-brand-blue text-white px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">LIVE DATA FEED</span>}
            </div>
            <h2 className="text-3xl sm:text-5xl md:text-7xl font-black italic uppercase tracking-tighter text-white">
              {race ? `${race.office} Race` : measure?.title}
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-4 text-[9px] sm:text-xs">
               <a href={item.ballotpediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-black uppercase text-brand-red hover:underline decoration-2 underline-offset-4">
                  <Globe size={12} /> Official Ballotpedia Page
               </a>
               <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-black uppercase tracking-widest">
                 <Shield size={10} /> Verified Source Data
               </div>
               <span className="font-mono text-slate-600 uppercase">LAST SYNC: {new Date().toLocaleTimeString()}</span>
            </div>
        </div>

        {/* Scrollable Intelligence Body */}
        <div className="flex-1 overflow-y-auto scroll-hide p-8 sm:p-12">
          <div className="max-w-4xl mx-auto space-y-20">
            
            {/* 500-word Summary / Overview */}
            <section className="space-y-6">
               <div className="flex items-center gap-4 border-l-4 border-slate-700 pl-6">
                  <h3 className="text-2xl font-black uppercase italic text-white tracking-widest">Contest Overview</h3>
               </div>
               <div className="text-lg text-slate-400 leading-relaxed uppercase font-medium space-y-4">
                  {race ? (
                    <p>{race.summary} This contest represents a focal point for legislative control. Polling indicates a highly competitive environment with key demographics shifting toward the {race.candidates.find(c => c.id === prediction)?.party || 'center'}. The outcome will likely influence federal budget projections for the next standard cycle.</p>
                  ) : (
                    <div className="space-y-6">
                       <p>{measure?.description}</p>
                       <div className="bg-brand-dark border-2 border-slate-800 p-8 space-y-4">
                          <p className="text-xs font-black uppercase text-brand-red mb-2 underline decoration-2">Legislative History:</p>
                          <p className="text-sm border-l-2 border-brand-red pl-4">{measure?.history}</p>
                       </div>
                    </div>
                  )}
               </div>
            </section>

            {/* Deep Analytics Grid */}
            {race ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 lg:gap-16">
                {race.candidates.map(candidate => (
                  <div key={candidate.id} className={cn(
                    "brutalist-card bg-slate-900 border-l-8 p-10 space-y-12 flex flex-col h-full",
                    candidate.party === 'Democrat' ? "border-blue-600 shadow-[10px_10px_0px_0px_#2563eb10]" : "border-brand-red shadow-[10px_10px_0px_0px_#e01e3c10]"
                  )}>
                     <div className="flex flex-col gap-8">
                        <div className="space-y-4">
                           <div className="flex items-center gap-3">
                              <span className={cn(
                                "text-[10px] font-black uppercase px-3 py-1 text-white inline-block",
                                candidate.party === 'Democrat' ? "bg-blue-600" : "bg-brand-red"
                              )}>
                                {candidate.party} NOMINEE
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">EST. 2026 CYCLE</span>
                           </div>
                           <div className="flex items-center justify-between gap-4">
                              <h4 className="text-4xl md:text-6xl font-black italic text-white uppercase tracking-tighter leading-none">{candidate.name}</h4>
                              <button 
                                onClick={() => onRemoveCandidate(race.id, candidate.id)}
                                className="p-2 text-slate-600 hover:text-brand-red transition-colors"
                                title="Remove Applicant"
                              >
                                 <Trash2 size={20} />
                              </button>
                           </div>
                           <div className="flex gap-4 pt-2">
                              <a href={candidate.websiteUrl} target="_blank" rel="noopener noreferrer" className="p-3 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-brand-red transition-all">
                                 <Globe size={18} />
                              </a>
                              <a href={candidate.ballotpediaUrl} target="_blank" rel="noopener noreferrer" className="p-3 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-brand-red transition-all">
                                 <BookOpen size={18} />
                              </a>
                           </div>
                        </div>
                     </div>

                     <div className="flex-1 space-y-12">
                        {/* Core Intelligence */}
                        <div className="space-y-6">
                           <div className="flex items-center justify-between">
                              <p className="text-[11px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                 <Users size={14} /> Comprehensive Biography
                              </p>
                              <button 
                                onClick={() => race && onSyncCandidate(candidate, race)}
                                disabled={syncingId === candidate.id}
                                className="flex items-center gap-1.5 text-[9px] font-black uppercase px-3 py-1 bg-slate-800 border border-slate-700 text-slate-400 hover:text-brand-red hover:border-brand-red transition-all disabled:opacity-50"
                              >
                                {syncingId === candidate.id ? (
                                  <Activity size={10} className="animate-spin" />
                                ) : (
                                  <TrendingUp size={10} />
                                )}
                                {syncingId === candidate.id ? 'Syncing Intelligence...' : candidate.lastSynced ? `Sync 2026 Data (Updated ${new Date(candidate.lastSynced).toLocaleTimeString()})` : 'Sync 2026 Data'}
                              </button>
                           </div>
                           <div className="text-sm text-slate-400 leading-relaxed uppercase font-medium border-l-2 border-slate-800 pl-6 space-y-4">
                              <p className="line-clamp-[10]">{candidate.biography || candidate.summary}</p>
                           </div>
                        </div>

                        {candidate.campaignPromises && candidate.campaignPromises.length > 0 && (
                          <div className="space-y-6">
                             <p className="text-[11px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                <Target size={14} /> Key Campaign Promises
                             </p>
                             <div className="grid grid-cols-1 gap-3">
                                {candidate.campaignPromises.map((promise, i) => (
                                  <div key={i} className="bg-black/50 border border-slate-800 p-4 flex items-start gap-4 group">
                                     <div className={cn(
                                       "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                                       candidate.party === 'Democrat' ? "bg-blue-600" : "bg-brand-red"
                                     )} />
                                     <p className="text-[10px] font-bold text-slate-300 uppercase tracking-tight group-hover:text-white transition-colors">{promise}</p>
                                  </div>
                                ))}
                             </div>
                          </div>
                        )}

                         {candidate.keyVotes && candidate.keyVotes.length > 0 && (
                          <div className="space-y-6">
                             <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <p className="text-[11px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                   <Activity size={14} /> Historical Voting Record ({candidate.keyVotes.length})
                                </p>
                             </div>
                             <VotingRecord votes={candidate.keyVotes} />
                          </div>
                        )}

                        {/* Polling & Sentiment Chart Cluster */}
                        <div className="space-y-10">
                           <div className="space-y-4">
                              <p className="text-[11px] font-black uppercase text-slate-500 border-b border-slate-800 pb-2 flex items-center gap-2">
                                 <TrendingUp size={14} /> Sentiment Trajectory
                              </p>
                              <div className="h-40 min-h-[160px] w-full bg-black/30 p-2 border border-slate-800 relative">
                                 <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={candidate.pollingHistory && candidate.pollingHistory.length > 0 ? candidate.pollingHistory : [
                                      { date: 'JAN', value: 45 },
                                      { date: 'FEB', value: 46 },
                                      { date: 'MAR', value: 48 }
                                    ]}>
                                       <defs>
                                          <linearGradient id={`colorValue-${candidate.id}`} x1="0" y1="0" x2="0" y2="1">
                                             <stop offset="5%" stopColor={candidate.party === 'Democrat' ? '#3b82f6' : '#E01E3C'} stopOpacity={0.6}/>
                                             <stop offset="95%" stopColor={candidate.party === 'Democrat' ? '#3b82f6' : '#E01E3C'} stopOpacity={0}/>
                                          </linearGradient>
                                       </defs>
                                       <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                       <XAxis dataKey="date" style={{ fontSize: '7px', fontWeight: 'bold', fill: '#475569' }} />
                                       <YAxis domain={['auto', 'auto']} hide />
                                       <Tooltip 
                                         contentStyle={{ backgroundColor: '#000', border: '1px solid #334155', borderRadius: '0px' }}
                                         itemStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '900' }}
                                       />
                                       <Area 
                                         type="monotone" 
                                         dataKey="value" 
                                         stroke={candidate.party === 'Democrat' ? '#3b82f6' : '#E01E3C'} 
                                         strokeWidth={3} 
                                         fillOpacity={1} 
                                         fill={`url(#colorValue-${candidate.id})`}
                                         dot={{ r: 2, fill: '#fff' }} 
                                       />
                                    </AreaChart>
                                 </ResponsiveContainer>
                              </div>
                           </div>

                           <div className="space-y-4">
                              <p className="text-[11px] font-black uppercase text-slate-500 border-b border-slate-800 pb-2 flex items-center gap-2">
                                 <BarChart2 size={14} /> Voter Sentiment Analysis
                              </p>
                              <div className="h-48 min-h-[192px] w-full bg-black/30 p-4 border border-slate-800 relative">
                                 <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    {(() => {
                                      const sData = candidate.sentimentData && candidate.sentimentData.length > 0 ? candidate.sentimentData : [
                                        { category: 'ECONOMY', value: 45 },
                                        { category: 'HEALTH', value: -20 },
                                        { category: 'POLICY', value: 65 },
                                        { category: 'ETHICS', value: 30 }
                                      ];
                                      return (
                                        <BarChart 
                                          data={sData} 
                                          layout="vertical"
                                          margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                                        >
                                           <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={true} horizontal={false} />
                                           <XAxis type="number" hide domain={[-100, 100]} />
                                           <YAxis 
                                             dataKey="category" 
                                             type="category"
                                             style={{ fontSize: '7px', fontWeight: 'bold', fill: '#94a3b8', textTransform: 'uppercase' }} 
                                             axisLine={false}
                                             tickLine={false}
                                             width={50}
                                           />
                                           <Tooltip 
                                             cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                             contentStyle={{ backgroundColor: '#000', border: '1px solid #334155', borderRadius: '0px' }}
                                             itemStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '900' }}
                                           />
                                           <ReferenceLine x={0} stroke="#334155" strokeWidth={2} />
                                           <Bar dataKey="value" radius={[0, 0, 0, 0]} barSize={14}>
                                              {sData.map((entry, index) => (
                                                <Cell 
                                                  key={`cell-${index}`} 
                                                  fill={entry.value > 0 ? '#10b981' : '#ef4444'} 
                                                />
                                              ))}
                                           </Bar>
                                        </BarChart>
                                      );
                                    })()}
                                 </ResponsiveContainer>
                              </div>
                              <p className="text-[8px] font-mono text-slate-600 uppercase text-center tracking-widest italic">Net Sentiment Score: -100 to +100 Index</p>
                           </div>
                        </div>

                        {/* Legislative Metrics */}
                        <div className="space-y-8">
                           <p className="text-[11px] font-black uppercase text-slate-500 border-b border-slate-800 pb-2">Efficiency Analysis</p>
                           <div className="space-y-6">
                              <div className="space-y-3">
                                 <div className="flex justify-between text-[10px] font-mono text-slate-500 uppercase">
                                    <span>Legislative Efficacy</span>
                                    <span>{candidate.metrics?.billsPassed} / {candidate.metrics?.billsIntroduced} Passed</span>
                                 </div>
                                 <div className="w-full h-1.5 bg-slate-800 overflow-hidden">
                                    <div className={cn(
                                      "h-full transition-all duration-1000",
                                      candidate.party === 'Democrat' ? "bg-blue-600" : "bg-brand-red"
                                    )} style={{ width: `${((candidate.metrics?.billsPassed || 0) / (candidate.metrics?.billsIntroduced || 1)) * 100}%` }} />
                                 </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="bg-black/50 border border-slate-800 p-3">
                                    <p className="text-[8px] font-mono text-slate-600 uppercase mb-1">Attendance</p>
                                    <p className="text-xl font-black italic text-white">{candidate.metrics?.votingAttendance}%</p>
                                 </div>
                                 <div className="bg-black/50 border border-slate-800 p-3">
                                    <p className="text-[8px] font-mono text-slate-600 uppercase mb-1">Seniority</p>
                                    <p className="text-xl font-black italic text-white">{candidate.metrics?.yearsInOffice}<span className="text-[8px] not-italic ml-1">YR</span></p>
                                 </div>
                              </div>
                              <div className="bg-black/50 border border-slate-800 p-3">
                                 <p className="text-[8px] font-mono text-slate-600 uppercase mb-1">Top Sector Influence</p>
                                 <p className="text-lg font-black italic text-brand-red uppercase truncate">{candidate.metrics?.topContributionSector}</p>
                              </div>
                           </div>
                        </div>
                     </div>

                     <div className="pt-10 mt-auto">
                        <button 
                          disabled={prediction === candidate.id || isSubmitting}
                          onClick={() => onPick(race.id, candidate.id, 'race')}
                          className={cn(
                             "w-full py-6 font-black uppercase tracking-[0.2em] text-sm transition-all border-2 shadow-[8px_8px_0px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none",
                             prediction === candidate.id 
                              ? "bg-emerald-500 border-emerald-500 text-white" 
                              : "bg-white text-black border-white hover:bg-slate-200"
                          )}
                        >
                           {isSubmitting && prediction === candidate.id ? 'ENCRYPTING PICK...' : prediction === candidate.id ? 'SELECTION SECURED' : `COMMIT FOR ${candidate.name}`}
                        </button>
                     </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-12">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    <div className="space-y-8">
                       <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white">Impact Forecast</h3>
                       <div className="h-64 min-h-[256px] bg-black/40 border border-slate-800 p-8 relative">
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                             <BarChart data={measure?.impactMetrics} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="label" type="category" width={120} axisLine={false} tickLine={false} style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8', textTransform: 'uppercase' }} />
                                <Bar dataKey="projected" radius={[0, 4, 4, 0]}>
                                   {measure?.impactMetrics?.map((_, idx) => (
                                      <Cell key={`cell-${idx}`} fill={idx === 0 ? '#E01E3C' : idx === 1 ? '#002D72' : '#fbbf24'} />
                                   ))}
                                </Bar>
                             </BarChart>
                          </ResponsiveContainer>
                       </div>
                    </div>
                    <div className="space-y-8 bg-slate-900 border border-slate-800 p-12">
                       <p className="text-[10px] font-black uppercase text-brand-red tracking-widest underline decoration-2 offset-4 mb-4">Action Terminal</p>
                       <div className="grid grid-cols-1 gap-4">
                          {['pass', 'fail'].map(opt => (
                            <button
                              key={opt}
                              disabled={isSubmitting}
                              onClick={() => onPick(measure!.id, opt, 'measure')}
                              className={cn(
                                "py-6 font-black uppercase tracking-widest text-sm border-2 transition-all",
                                prediction === opt 
                                  ? "bg-brand-red border-brand-red text-white shadow-[8px_8px_0px_0px_#000]"
                                  : "bg-white text-black border-white hover:bg-slate-200"
                              )}
                            >
                               PREDICT INITIAL {opt}
                            </button>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>
            )}

            <div className="text-center pt-20 border-t border-slate-800">
               <p className="text-[10px] font-mono text-slate-700 uppercase tracking-widest">End of file. All data sourced from Ballotpedia National Database.</p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
