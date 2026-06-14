import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { NodeEntity } from '../../types';
import { AlertTriangle, TrendingUp, DollarSign, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface IngestionFeedProps {
  onSelectBill: (billId: string) => void;
  selectedBillId: string | null;
}

export function IngestionFeed({ onSelectBill, selectedBillId }: IngestionFeedProps) {
  const [bills, setBills] = useState<NodeEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'entities'), where('entityType', '==', 'BILL'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBills = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as NodeEntity[];
      
      // Sort by newest first (descending by createdAt)
      fetchedBills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setBills(fetchedBills);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching bills:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white/40 backdrop-blur-md rounded-2xl border border-brand-blue/10">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-brand-blue border-t-transparent rounded-full mb-4"
        />
        <p className="text-xs font-mono uppercase tracking-widest text-brand-blue/60">Loading Telemetry Feed...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white/60 backdrop-blur-md rounded-2xl border border-brand-blue/10 shadow-xl shadow-brand-blue/5 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-black/5 flex justify-between items-center bg-white/40">
        <h3 className="font-bold text-sm uppercase tracking-widest text-brand-blue flex items-center gap-2">
          <Zap size={16} className="text-brand-red" />
          Live Ingestion Feed
        </h3>
        <div className="text-[10px] font-mono text-black/40 uppercase tracking-widest">
          {bills.length} Active Measures
        </div>
      </div>

      {/* Grid Header */}
      <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-black/5 bg-black/5 text-[10px] font-bold uppercase tracking-widest text-black/50">
        <div className="col-span-2">Time / State</div>
        <div className="col-span-5">Measure Title</div>
        <div className="col-span-5">Anomaly Flags</div>
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto p-2">
        {bills.map((bill, i) => {
          const telemetry = bill.telemetry;
          const isSelected = selectedBillId === bill.id;
          
          // Compute Anomaly Badges
          const flags = [];
          if (telemetry?.specialInterestSyndicationScore && telemetry.specialInterestSyndicationScore > 0.6) {
            flags.push({ label: 'SIS', icon: AlertTriangle, color: 'text-orange-600 bg-orange-100 border-orange-200' });
          }
          if (telemetry?.topicTitleInversionGap && telemetry.topicTitleInversionGap > 0.8) {
            flags.push({ label: 'CAMOUFLAGE', icon: AlertTriangle, color: 'text-brand-red bg-brand-red/10 border-brand-red/20' });
          }
          if (telemetry?.extraterritorialSpilloverCoefficient && telemetry.extraterritorialSpilloverCoefficient > 0.8) {
            flags.push({ label: 'REG', icon: TrendingUp, color: 'text-purple-600 bg-purple-100 border-purple-200' });
          }

          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              key={bill.id}
              onClick={() => onSelectBill(bill.id)}
              className={cn(
                "group cursor-pointer grid grid-cols-12 gap-4 px-4 py-4 rounded-xl border mb-2 transition-all hover:shadow-md",
                isSelected 
                  ? "bg-white border-brand-blue shadow-lg shadow-brand-blue/10 scale-[1.01]" 
                  : "bg-white/40 border-transparent hover:bg-white hover:border-black/5"
              )}
            >
              {/* Time & State */}
              <div className="col-span-2 flex flex-col justify-center">
                <span className="text-xs font-mono text-black/60">
                  {new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-[10px] font-bold text-brand-blue uppercase mt-0.5">
                  {bill.jurisdictionState}
                </span>
              </div>

              {/* Title */}
              <div className="col-span-5 flex flex-col justify-center">
                <span className="text-xs font-bold text-black/80 font-mono uppercase tracking-tight text-brand-red/80 mb-0.5">
                  {bill.id.split('-').pop()?.toUpperCase()}
                </span>
                <span className="text-sm font-semibold text-black leading-tight line-clamp-2">
                  {bill.name}
                </span>
              </div>

              {/* Anomaly Flags */}
              <div className="col-span-5 flex items-center gap-2 flex-wrap">
                {flags.length === 0 ? (
                  <span className="text-xs text-black/30 italic">No anomalies detected</span>
                ) : (
                  flags.map((flag, idx) => (
                    <div key={idx} className={cn("flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider", flag.color)}>
                      <flag.icon size={12} />
                      {flag.label}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
