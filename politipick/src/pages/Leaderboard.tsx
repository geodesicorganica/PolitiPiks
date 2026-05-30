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
      collection(db, 'users'),
      where('totalPoints', '>=', 0),
      orderBy('totalPoints', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTopUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-8 pb-12">
      <div className="border-b-2 border-brand-red pb-4">
        <h1 className="text-4xl font-black italic tracking-tighter uppercase italic text-brand-red">Global Rankings</h1>
        <p className="text-xs font-mono uppercase text-black/40 mt-1">The elite predictors of the 2026 midterms.</p>
      </div>

      <div className="bg-white border border-black/10 shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-20 flex items-center justify-center">
            <motion.div 
               animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1 }}
               className="text-[10px] font-mono uppercase text-black/20"
            >
              Calculating ranks...
            </motion.div>
          </div>
        ) : (
          <div className="divide-y divide-black/5">
            {topUsers.map((u, index) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                key={u.uid} 
                className="data-row p-6 flex items-center justify-between group"
              >
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 flex items-center justify-center font-black italic text-2xl relative">
                    {index === 0 && <Trophy className="absolute -top-2 -left-2 text-yellow-500 rotate-[-15deg]" size={20} />}
                    {index === 1 && <Medal className="absolute -top-2 -left-2 text-slate-400 rotate-[-15deg]" size={20} />}
                    {index === 2 && <Star className="absolute -top-2 -left-2 text-amber-600 rotate-[-15deg]" size={20} />}
                    <span className={cn(
                      "text-slate-300 group-hover:text-white transition-colors",
                      index < 3 && "text-brand-red font-black"
                    )}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <img 
                      src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.displayName}`} 
                      alt="" 
                      className="w-10 h-10 rounded-full border border-black/10 bg-slate-100"
                    />
                    <div>
                      <p className="font-black uppercase tracking-tighter text-lg">{u.displayName}</p>
                      <p className="text-[10px] font-mono text-black/40 group-hover:text-white/60 uppercase">
                        {u.correctPredictions} Correct • {u.totalPoints} Global Points
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                   <p className="text-[10px] font-mono uppercase text-black/40 group-hover:text-white/60">Points</p>
                   <p className="text-2xl font-black italic tracking-tighter text-brand-blue group-hover:text-white">{u.totalPoints}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
