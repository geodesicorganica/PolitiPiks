import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Prediction, Race, BallotMeasure } from '../types';
import { motion } from 'motion/react';
import { TrendingUp, AlertCircle, Clock } from 'lucide-react';
import { formatDate, cn, handleFirestoreError, OperationType } from '../lib/utils';

export function Dashboard() {
  const { profile } = useAuth();
  const [recentPicks, setRecentPicks] = useState<Prediction[]>([]);
  const [activeRaces, setActiveRaces] = useState<Race[]>([]);
  const [upcomingMeasures, setUpcomingMeasures] = useState<BallotMeasure[]>([]);

  useEffect(() => {
    if (!profile) return;

    // Recent picks
    const q = query(
      collection(db, 'predictions'),
      where('userId', '==', profile.uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribePicks = onSnapshot(q, (snapshot) => {
      setRecentPicks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Prediction)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'predictions');
    });

    // Active races
    const qRaces = query(collection(db, 'races'), limit(3));
    const unsubscribeRaces = onSnapshot(qRaces, (snapshot) => {
      setActiveRaces(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Race)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'races');
    });

    return () => {
      unsubscribePicks();
      unsubscribeRaces();
    };
  }, [profile]);

  return (
    <div className="space-y-12 pb-12">
      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          label="Total Predictions" 
          value={profile?.predictionsCount ?? 0} 
          sub="Verified on chain" 
        />
        <StatCard 
          label="Forecasting Accuracy" 
          value={`${profile?.predictionsCount ? Math.round((profile.correctPredictions / profile.predictionsCount) * 100) : 0}%`} 
          sub={`${profile?.correctPredictions ?? 0} correct / ${profile?.predictionsCount ?? 0} total`} 
        />
        <StatCard 
          label="System Ranking" 
          value="#1,242" 
          sub="Global Division Alpha" 
          accent
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Recent Activity */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
            <h2 className="font-black italic text-2xl uppercase italic text-white flex items-center gap-3">
               <TrendingUp size={22} className="text-brand-red" /> Live Feed
            </h2>
          </div>
          
          <div className="space-y-4">
            {recentPicks.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-slate-800 text-center text-slate-600 font-mono text-xs uppercase bg-slate-900/10">
                Awaiting connection to prediction API...
              </div>
            ) : (
              recentPicks.map((pick) => (
                <div key={pick.id} className="brutalist-card p-5 flex items-center justify-between bg-slate-900 group">
                  <div className="space-y-1">
                    <p className="font-black text-sm uppercase tracking-tight text-white group-hover:text-brand-red transition-colors">{pick.pick}</p>
                    <p className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-2">
                       <Clock size={10} /> {formatDate(pick.createdAt)} • {pick.type === 'race' ? 'Election Major' : 'Public Initiative'}
                    </p>
                  </div>
                  <div className={cn(
                    "text-[10px] font-black px-3 py-1 uppercase border",
                    pick.status === 'pending' ? "border-slate-700 text-slate-500" :
                    pick.status === 'correct' ? "border-emerald-500 text-emerald-500 bg-emerald-500/10" : "border-brand-red text-brand-red bg-brand-red/10"
                  )}>
                    {pick.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Live Tracking / Alerts */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
            <h2 className="font-black italic text-2xl uppercase italic text-white flex items-center gap-3">
               <AlertCircle size={22} className="text-brand-blue" /> Intel Alerts
            </h2>
          </div>
          
          <div className="space-y-4">
            <AlertItem 
              type="info" 
              title="VOTER REGISTRATION CUTOFF" 
              desc="Registration for the Georgia Senate race closes in 14 days. Ensure all league members are compliant." 
            />
            <AlertItem 
              type="warning" 
              title="NETWORK LATENCY DETECTED" 
              desc="Intermittent updates from national polling centers. Prediction locks may be extended by 30m." 
            />
            <AlertItem 
              type="live" 
              title="SATELLITE SYNC ACTIVE" 
              desc="Direct link to Ballotpedia established. View detailed candidate bios in the Predictions terminal." 
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string, value: string | number, sub: string, accent?: boolean }) {
  return (
    <div className={cn(
      "p-8 border h-full flex flex-col justify-between transition-all group brutalist-card",
      accent ? "bg-brand-red border-brand-red" : "bg-slate-900 border-slate-800"
    )}>
      <div className="space-y-1">
        <p className={cn("text-[10px] font-mono uppercase tracking-[0.2em]", accent ? "text-white/70" : "text-slate-500")}>{label}</p>
        <p className={cn("text-6xl font-black italic tracking-tighter", accent ? "text-white" : "text-white group-hover:text-brand-red transition-colors")}>{value}</p>
      </div>
      <div>
         <div className="dashed-divider opacity-20" />
         <p className={cn("text-[10px] font-mono uppercase tracking-widest", accent ? "text-white/60" : "text-slate-600")}>{sub}</p>
      </div>
    </div>
  );
}

function AlertItem({ type, title, desc }: { type: 'info' | 'warning' | 'live', title: string, desc: string }) {
  return (
    <div className="p-6 bg-slate-900 border border-slate-800 flex gap-5 items-start group hover:border-brand-red transition-all brutalist-card">
      <div className={cn(
        "w-3 h-3 rounded-none mt-1.5 shrink-0 rotate-45",
        type === 'live' ? "bg-brand-red animate-pulse" : 
        type === 'warning' ? "bg-amber-500" : "bg-brand-blue"
      )} />
      <div className="space-y-1">
        <h3 className="text-sm font-black uppercase tracking-tight text-white group-hover:text-brand-red transition-colors">{title}</h3>
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed uppercase">{desc}</p>
      </div>
    </div>
  );
}
