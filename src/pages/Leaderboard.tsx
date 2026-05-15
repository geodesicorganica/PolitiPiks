import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { motion } from 'motion/react';
import { Trophy, Medal, Star } from 'lucide-react';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';

export function Leaderboard() {
  const { profile } = useAuth();
  const [topUsers, setTopUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    
    const q = query(
      collection(db, 'users_public'),
      where('totalPoints', '>=', 0),
      orderBy('totalPoints', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTopUsers(snapshot.docs.map(doc => ({ ...doc.data() as UserProfile, uid: doc.id })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users_public');
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-12 pb-12">
      <div className="border-b-4 border-slate-800 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-5xl font-black italic tracking-tighter uppercase italic text-white flex items-center gap-4">
             Global <span className="text-brand-red">Ranks</span>
          </h1>
          <p className="text-xs font-mono uppercase text-slate-500 mt-2">The architects of prediction. Top 0.1% tier.</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 brutalist-card overflow-hidden">
        {loading ? (
          <div className="p-20 flex items-center justify-center">
            <motion.div 
               animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1 }}
               className="text-[10px] font-mono uppercase text-slate-700"
            >
              Analyzing performance metrics...
            </motion.div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {topUsers.map((u, index) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                key={u.uid} 
                className={cn(
                  "p-6 flex items-center justify-between group transition-all",
                  u.uid === profile?.uid ? "bg-brand-red/10 border-l-4 border-l-brand-red" : "hover:bg-slate-800/30"
                )}
              >
                <div className="flex items-center gap-8">
                  <div className="w-16 h-16 flex items-center justify-center font-black italic text-3xl shrink-0">
                    <span className={cn(
                      "text-slate-800 group-hover:text-slate-700 transition-colors",
                      index < 3 && "text-brand-red"
                    )}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-none border-2 border-slate-800 overflow-hidden bg-black p-0.5">
                       <img 
                        src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.displayName}`} 
                        alt="" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-tighter text-xl text-white italic">{u.displayName}</p>
                      <p className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1"><Medal size={12} className="text-brand-red" /> {u.predictionsCount} PICKS</span>
                        <span className="w-1 h-1 bg-slate-800 rounded-full" />
                        <span className="flex items-center gap-1 text-slate-400">ACCURACY: {u.predictionsCount ? Math.round((u.correctPredictions / u.predictionsCount) * 100) : 0}%</span>
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                   <p className="text-[10px] font-mono uppercase text-slate-600 mb-1">XP Points</p>
                   <p className="text-3xl font-black italic tracking-tighter text-white group-hover:text-brand-red transition-all">{u.totalPoints}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Your Rank Pin */}
      {!loading && !topUsers.find(u => u.uid === profile?.uid) && profile && (
         <div className="brutalist-card bg-brand-red p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="w-10 h-10 bg-white flex items-center justify-center text-brand-red font-black italic">#142</div>
               <div>
                  <p className="text-white font-black uppercase italic text-lg">{profile.displayName}</p>
                  <p className="text-[10px] text-white/70 font-mono uppercase italic">You are currently outside the elite top 10.</p>
               </div>
            </div>
            <p className="text-3xl font-black text-white italic tracking-tighter">{profile.totalPoints}</p>
         </div>
      )}
    </div>
  );
}
