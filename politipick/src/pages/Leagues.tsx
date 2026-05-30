import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { League, LeagueMember } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { Plus, Users, Copy, Check, ArrowRight } from 'lucide-react';

export function Leagues() {
  const { profile } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [tab, setTab] = useState<'my' | 'join' | 'create'>('my');
  const [copied, setCopied] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'leagues'), where('ownerId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeagues(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as League)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leagues');
    });

    return () => unsubscribe();
  }, [profile]);

  const handleCreate = async () => {
    if (!profile || !newLeagueName) return;
    setIsSubmitting(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
      const docRef = await addDoc(collection(db, 'leagues'), {
        name: newLeagueName,
        ownerId: profile.uid,
        inviteCode: code,
        createdAt: serverTimestamp()
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
      handleFirestoreError(err, OperationType.WRITE, 'leagues');
      alert('Failed to create league. Please try again.');
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
      const q = query(collection(db, 'leagues'), where('inviteCode', '==', inviteCode));
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
    <div className="space-y-8 pb-12">
      <div className="border-b-2 border-brand-blue pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase italic">Leagues</h1>
          <p className="text-xs font-mono uppercase text-black/40 mt-1">Compete with friends in private groups.</p>
        </div>
        <div className="flex gap-2">
          <button 
            disabled={isSubmitting}
            onClick={() => setTab('join')}
            className={cn("px-4 py-2 font-bold uppercase text-xs transition-all", tab === 'join' ? "bg-brand-blue text-white" : "bg-white text-black/40 hover:text-black")}
          >
            Join
          </button>
          <button 
            disabled={isSubmitting}
            onClick={() => setTab('create')}
            className={cn("px-4 py-2 font-bold uppercase text-xs transition-all", tab === 'create' ? "bg-brand-red text-white" : "bg-white text-black/40 hover:text-black")}
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
              <div className="col-span-full p-12 border-2 border-dashed border-black/10 text-center space-y-4">
                <Users size={48} className="mx-auto text-black/10" />
                <p className="font-mono text-xs uppercase text-black/40">You haven't joined or created any leagues yet.</p>
                <button 
                   onClick={() => setTab('create')}
                   className="px-6 py-3 bg-brand-blue text-white font-black uppercase tracking-tighter hover:bg-brand-red transition-colors"
                >
                  Start a League
                </button>
              </div>
            ) : (
              leagues.map((league) => (
                <div key={league.id} className="bg-white p-6 border-l-8 border-brand-blue shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-xl font-black italic uppercase tracking-tighter">{league.name}</h3>
                    <div className="text-right">
                      <p className="text-[10px] font-mono uppercase text-black/40">Invite Code</p>
                      <button 
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
                       <div className="w-8 h-8 rounded-full bg-slate-400 border-2 border-white flex items-center justify-center text-[10px] font-bold">+5</div>
                    </div>
                    <button className="text-[10px] font-black uppercase flex items-center gap-1 hover:text-brand-blue">
                      View Standings <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        )}

        {tab === 'create' && (
          <motion.div 
            key="create"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="max-w-md mx-auto bg-white p-8 border-t-8 border-brand-red shadow-xl space-y-6"
          >
            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-center">New Fantasy League</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-mono uppercase text-black/40 block mb-1">League Name</label>
                <input 
                  type="text" 
                  value={newLeagueName}
                  disabled={isSubmitting}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  placeholder="The Politicos"
                  className="w-full p-4 bg-slate-50 border border-black/10 font-bold uppercase tracking-tight focus:outline-none focus:border-brand-blue disabled:opacity-50"
                />
              </div>
              <button 
                onClick={handleCreate}
                disabled={isSubmitting}
                className="w-full py-4 bg-brand-red text-white font-black uppercase tracking-tighter hover:bg-brand-blue transition-colors flex items-center justify-center gap-2 disabled:bg-slate-300"
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
            className="max-w-md mx-auto bg-white p-8 border-t-8 border-brand-blue shadow-xl space-y-6"
          >
            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-center">Join League</h2>
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
                  className="w-full p-4 bg-slate-50 border border-black/10 font-bold uppercase tracking-widest text-center text-xl focus:outline-none focus:border-brand-blue disabled:opacity-50"
                />
              </div>
              <button 
                onClick={handleJoin}
                disabled={isSubmitting}
                className="w-full py-4 bg-brand-blue text-white font-black uppercase tracking-tighter hover:bg-brand-red transition-colors flex items-center justify-center gap-2 disabled:bg-slate-300"
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
