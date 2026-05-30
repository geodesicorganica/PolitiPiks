import { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, query, where, onSnapshot, orderBy, limit, getCountFromServer } from 'firebase/firestore';
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
  const [predictionsCount, setPredictionsCount] = useState(0);

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

    // Total predictions count (tamper-resistant: computed from predictions collection)
    (async () => {
      try {
        const countSnap = await getCountFromServer(query(
          collection(db, 'predictions'),
          where('userId', '==', profile.uid),
        ));
        setPredictionsCount(countSnap.data().count);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'predictions(count)');
      }
    })();

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
    <div className="space-y-8 pb-12">
      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          label="Total Predictions" 
          value={predictionsCount} 
          sub="Across all leagues" 
        />
        <StatCard 
          label="Accuracy" 
          value={`${predictionsCount ? Math.round(((profile?.correctPredictions ?? 0) / predictionsCount) * 100) : 0}%`} 
          sub={`${profile?.correctPredictions ?? 0} correct out of ${predictionsCount}`} 
        />
        <StatCard 
          label="Global Rank" 
          value="#1,242" 
          sub="Top 5% of all users" 
          accent
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Activity */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-black/10 pb-2">
            <h2 className="font-black italic text-xl uppercase italic">Recent Picks</h2>
            <TrendingUp size={16} className="text-brand-blue" />
          </div>
          
          <div className="space-y-2">
            {recentPicks.length === 0 ? (
              <div className="p-8 border border-dashed border-black/20 text-center text-black/40 font-mono text-xs uppercase">
                No predictions made yet.
              </div>
            ) : (
              recentPicks.map((pick) => (
                <div key={pick.id} className="data-row p-4 flex items-center justify-between bg-white/50 backdrop-blur-sm">
                  <div>
                    <p className="font-bold text-sm uppercase">{pick.pick}</p>
                    <p className="text-[10px] font-mono text-black/40 uppercase">
                      {pick.type === 'race' ? 'Race Winner' : 'Measure Outcome'} • {formatDate(pick.createdAt)}
                    </p>
                  </div>
                  <div className={cn(
                    "text-[10px] font-black px-2 py-1 uppercase transform -skew-x-12",
                    pick.status === 'pending' ? "bg-slate-200 text-slate-600" :
                    pick.status === 'correct' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                  )}>
                    {pick.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Live Tracking / Alerts */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-black/10 pb-2">
            <h2 className="font-black italic text-xl uppercase italic">Election Alerts</h2>
            <AlertCircle size={16} className="text-brand-red" />
          </div>
          
          <div className="space-y-4">
            <AlertItem 
              type="info" 
              title="Voter registration closing" 
              desc="Registration for the Georgia Senate race closes in 14 days." 
            />
            <AlertItem 
              type="warning" 
              title="Polls updating in 2h" 
              desc="Real-time polling data source is refreshing. Picks might be locked temporarily." 
            />
            <AlertItem 
              type="live" 
              title="Score Validation" 
              desc="System is verifying 2024 archive scores for league weighting." 
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
      "p-6 border-l-4 h-full flex flex-col justify-between",
      accent ? "bg-brand-red text-white border-brand-blue" : "bg-white text-black border-brand-blue"
    )}>
      <div>
        <p className={cn("text-[10px] font-mono uppercase opacity-60", accent ? "text-white" : "text-black/60")}>{label}</p>
        <p className="text-4xl font-black italic tracking-tighter mt-1">{value}</p>
      </div>
      <p className={cn("text-[10px] font-mono uppercase mt-4 opacity-40", accent ? "text-white" : "text-black/40")}>{sub}</p>
    </div>
  );
}

function AlertItem({ type, title, desc }: { type: 'info' | 'warning' | 'live', title: string, desc: string }) {
  return (
    <div className="p-4 bg-white border border-black/5 flex gap-4 items-start group hover:border-brand-blue transition-colors">
      <div className={cn(
        "w-2 h-2 rounded-full mt-1.5 shrink-0",
        type === 'live' ? "bg-brand-red animate-pulse" : 
        type === 'warning' ? "bg-amber-400" : "bg-blue-400"
      )} />
      <div>
        <h3 className="text-xs font-black uppercase tracking-tight group-hover:text-brand-blue transition-colors">{title}</h3>
        <p className="text-[10px] text-black/50 font-mono leading-tight mt-1 uppercase">{desc}</p>
      </div>
    </div>
  );
}
