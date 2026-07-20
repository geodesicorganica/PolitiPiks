import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { League, LeagueMember } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, handleFirestoreError, OperationType, formatDate } from '../lib/utils';
import { ACTIVE_ELECTION_MODE, ACTIVE_ELECTION_YEAR } from '../lib/electionCycle';
import { Plus, Users, Copy, Check, ArrowRight } from 'lucide-react';

interface LeaguesProps {
  onSelectLeague: (id: string) => void;
}

export function Leagues({ onSelectLeague }: LeaguesProps) {
  const { profile } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [tab, setTab] = useState<'my' | 'join' | 'create'>('my');
  const [copied, setCopied] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) return;

    // Fetch my leagues
    const q = query(
      collection(db, 'leagues'),
      where('ownerId', '==', profile.uid),
      where('electionYear', '==', ACTIVE_ELECTION_YEAR),
      where('mode', '==', ACTIVE_ELECTION_MODE),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeagues(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as League)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leagues');
    });

    return () => unsubscribe();
  }, [profile]);

  const handleCreate = async () => {
    if (!newLeagueName) {
      alert('Please enter a league name.');
      return;
    }
    
    if (!profile) {
      alert('User profile not found. Please refresh the page or sign in again.');
      return;
    }

    setIsSubmitting(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
      const docRef = await addDoc(collection(db, 'leagues'), {
        name: newLeagueName,
        ownerId: profile.uid,
        inviteCode: code,
        createdAt: serverTimestamp(),
        electionYear: ACTIVE_ELECTION_YEAR,
        mode: ACTIVE_ELECTION_MODE,
      });
      
      // Add owner as member
      await setDoc(doc(db, `leagues/${docRef.id}/members`, profile.uid), {
        userId: profile.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL || '',
        points: profile.totalPoints || 0,
        joinedAt: serverTimestamp()
      });

      setNewLeagueName('');
      setTab('my');
      alert('League created successfully!');
    } catch (err) {
      console.error('League creation error:', err);
      // handleFirestoreError will throw, so we catch it or use it for logging
      try {
        handleFirestoreError(err, OperationType.WRITE, 'leagues');
      } catch (formattedErr) {
        console.error('Formatted Error:', formattedErr);
      }
      alert('Failed to create league. This may be due to a permission error or network issue.');
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
    try {
      const q = query(
        collection(db, 'leagues'),
        where('inviteCode', '==', inviteCode),
        where('electionYear', '==', ACTIVE_ELECTION_YEAR),
        where('mode', '==', ACTIVE_ELECTION_MODE),
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        alert('Invalid invite code');
        setIsSubmitting(false);
        return;
      }

      const leagueId = snapshot.docs[0].id;
      
      // Add user as member
      await setDoc(doc(db, `leagues/${leagueId}/members`, profile.uid), {
        userId: profile.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL || '',
        points: profile.totalPoints || 0,
        joinedAt: serverTimestamp()
      });

      setInviteCode('');
      setTab('my');
      alert('Joined league successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to join league. You might already be a member.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-12 pb-12">
      <div className="border-b-4 border-slate-800 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-5xl font-black italic tracking-tighter uppercase italic text-white flex items-center gap-4">
             Leagues <span className="bg-brand-red text-white text-[10px] not-italic px-2 py-0.5 font-mono">2026 LIVE</span>
          </h1>
          <p className="text-xs font-mono uppercase text-slate-500 mt-2">Compete in exclusive circles. Win big, lose face.</p>
        </div>
        <div className="flex gap-2">
          <button 
            disabled={isSubmitting}
            onClick={() => setTab('join')}
            className={cn("px-6 py-2 font-black uppercase text-xs transition-all", tab === 'join' ? "bg-brand-blue text-white shadow-[4px_4px_0px_0px_#fff]" : "bg-slate-900 text-slate-500 hover:text-white border border-slate-800")}
          >
            Join League
          </button>
          <button 
            disabled={isSubmitting}
            onClick={() => setTab('create')}
            className={cn("px-6 py-2 font-black uppercase text-xs transition-all", tab === 'create' ? "bg-brand-red text-white shadow-[4px_4px_0px_0px_#fff]" : "bg-slate-900 text-slate-500 hover:text-white border border-slate-800")}
          >
            Start New
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'my' && (
          <motion.div 
            key="my"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {leagues.length === 0 ? (
              <div className="col-span-full p-20 border-2 border-dashed border-slate-800 text-center space-y-6 bg-slate-900/20">
                <Users size={64} className="mx-auto text-slate-800" />
                <p className="font-mono text-xs uppercase text-slate-500">The arena is empty. Start your own legacy.</p>
                <button 
                   onClick={() => setTab('create')}
                   className="px-10 py-4 bg-brand-red text-white font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all brutalist-border"
                >
                   Draft a League
                </button>
              </div>
            ) : (
              leagues.map((league) => (
                <div 
                  key={league.id} 
                  onClick={() => onSelectLeague(league.id)}
                  className="bg-slate-900 p-8 border border-slate-800 brutalist-card space-y-6 group cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                       <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white group-hover:text-brand-red transition-colors">{league.name}</h3>
                       <p className="text-[10px] font-mono uppercase text-slate-600">Created: {formatDate(league.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-mono uppercase text-slate-500 mb-1">Invite Code</p>
                      <button 
                        onClick={(e) => {
                           e.stopPropagation();
                           copyCode(league.inviteCode);
                        }}
                        className="flex items-center gap-2 font-mono font-bold text-brand-red hover:text-white transition-colors bg-black/40 px-3 py-1 border border-slate-800"
                      >
                        {league.inviteCode}
                        {copied === league.inviteCode ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-6 border-t border-slate-800">
                    <div className="flex items-center gap-4">
                       <div className="flex -space-x-3">
                          {[1,2,3].map(i => (
                             <div key={i} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center font-black text-[10px] text-slate-500">M</div>
                          ))}
                          <div className="w-8 h-8 rounded-full bg-brand-red border-2 border-slate-900 flex items-center justify-center text-[10px] font-black text-white">+2</div>
                       </div>
                       <span className="text-[10px] font-mono uppercase text-slate-500">5 Members Active</span>
                    </div>
                    <div className="text-brand-red font-black uppercase text-xs flex items-center gap-2 group-hover:gap-4 transition-all">
                      Enter Terminal <ArrowRight size={14} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        )}

        {tab === 'create' && (
          <motion.div 
            key="create"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="max-w-xl mx-auto bg-slate-900 p-12 border-t-8 border-brand-red shadow-2xl space-y-8 brutalist-card"
          >
            <div className="text-center space-y-2">
               <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">Initialize League</h2>
               <p className="text-xs font-mono uppercase text-slate-500">Define your arena. Set the stakes.</p>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase text-slate-500 block ml-1">Entity Name</label>
                <input 
                  type="text" 
                  value={newLeagueName}
                  disabled={isSubmitting}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  placeholder="K-STREET KILLERS"
                  className="w-full p-5 bg-black border-2 border-slate-800 text-white font-black uppercase tracking-widest focus:outline-none focus:border-brand-red transition-colors placeholder:text-slate-800"
                />
              </div>
              
              <div className="p-6 bg-brand-red/5 border border-brand-red/20 space-y-3">
                 <p className="text-[10px] font-mono text-brand-red uppercase font-black">System Note:</p>
                 <p className="text-[11px] text-slate-400 font-medium">By creating a league, you will be designated as the <span className="text-white italic">Commissioner</span>. All prediction windows follow official state poll closing times.</p>
              </div>

              <div className="pt-4 space-y-4">
                 <button 
                   onClick={handleCreate}
                   disabled={isSubmitting}
                   className="w-full py-5 bg-brand-red text-white font-black uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-all flex items-center justify-center gap-3 disabled:opacity-50 brutalist-border"
                 >
                   {isSubmitting ? 'Syncing...' : 'Broadcast League'} <Plus size={20} />
                 </button>
                 <button onClick={() => setTab('my')} className="w-full text-center text-[10px] font-mono uppercase text-slate-600 hover:text-white transition-colors">Abort Mission</button>
              </div>
            </div>
          </motion.div>
        )}

        {tab === 'join' && (
          <motion.div 
            key="join"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="max-w-xl mx-auto bg-slate-900 p-12 border-t-8 border-brand-blue shadow-2xl space-y-8 brutalist-card"
          >
             <div className="text-center space-y-2">
               <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">Join the Fray</h2>
               <p className="text-xs font-mono uppercase text-slate-500">Enter the authorization code below.</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase text-slate-500 block text-center">Auth Code</label>
                <input 
                  type="text" 
                  value={inviteCode}
                  disabled={isSubmitting}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="XJK912"
                  maxLength={6}
                  className="w-full p-6 bg-black border-2 border-slate-800 text-white font-black uppercase tracking-[0.5em] text-center text-3xl focus:outline-none focus:border-brand-blue transition-colors placeholder:text-slate-800"
                />
              </div>
              <button 
                onClick={handleJoin}
                disabled={isSubmitting}
                className="w-full py-5 bg-brand-blue text-white font-black uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-all flex items-center justify-center gap-3 disabled:opacity-50 brutalist-border shadow-[4px_4px_0px_0px_#E01E3C]"
              >
                {isSubmitting ? 'Validating...' : 'Authorize Access'} <Users size={20} />
              </button>
              <button onClick={() => setTab('my')} className="w-full text-center text-[10px] font-mono uppercase text-slate-600 hover:text-white transition-colors">Cancel Auth</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
