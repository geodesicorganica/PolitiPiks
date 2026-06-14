import React from 'react';
import { NodeEntity } from '../../types';
import { GitCompare, AlertTriangle, Activity, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

interface IntermediateAnalysisProps {
  bill: NodeEntity;
}

export function IntermediateAnalysis({ bill }: IntermediateAnalysisProps) {
  const telemetry = bill.telemetry;
  const survivalProb = telemetry?.survivalProbability ? (telemetry.survivalProbability * 100).toFixed(0) : 0;
  const camouflageScore = telemetry?.topicTitleInversionGap ? (telemetry.topicTitleInversionGap * 100).toFixed(0) : 0;
  const isHighCamouflage = telemetry?.topicTitleInversionGap && telemetry.topicTitleInversionGap > 0.8;

  return (
    <div className="space-y-6">
      {/* Legislative Survival Score (LVS) Gauge */}
      <section className="bg-white rounded-xl border border-black/5 p-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-blue flex items-center gap-1.5">
            <Activity size={14} />
            Passage Probability (LVS)
          </h4>
          <span className="text-xl font-black text-brand-blue">{survivalProb}%</span>
        </div>
        
        {/* Progress Bar Gauge */}
        <div className="w-full bg-black/5 rounded-full h-3 mb-2 overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${survivalProb}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className={`h-full rounded-full ${Number(survivalProb) > 50 ? 'bg-green-500' : 'bg-orange-500'}`}
          />
        </div>
        <p className="text-[10px] font-mono text-black/50 leading-tight">
          Based on sponsor alignment, regional committee composition, and historical chamber norms.
        </p>
      </section>

      {/* Structural Topic-to-Title Inversion Gap */}
      {isHighCamouflage && (
        <motion.section 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-brand-red/10 rounded-xl border border-brand-red/20 p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-2 text-brand-red">
            <AlertTriangle size={14} />
            <h4 className="text-xs font-bold uppercase tracking-wider">Rhetorical Camouflage Detected</h4>
          </div>
          <p className="text-sm text-brand-red/80 leading-relaxed mb-3">
            High divergence (<span className="font-bold">{camouflageScore}%</span> ΔTI) between the popular public title and the embedded statutory legal mechanics.
          </p>
        </motion.section>
      )}

      {/* Textual Redline Diff Workbench */}
      <section className="bg-white rounded-xl border border-black/5 overflow-hidden shadow-sm">
        <div className="p-3 border-b border-black/5 bg-black/5 flex justify-between items-center">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/60 flex items-center gap-1.5">
            <GitCompare size={14} />
            Redline Diff: Intro vs Substitute
          </h4>
        </div>
        <div className="p-4 font-mono text-xs leading-relaxed text-black/70">
          <p>
            Sec. 4. (a) A person shall not use a covered <span className="bg-red-100 text-red-700 line-through px-1 rounded">foundation</span> <span className="bg-green-100 text-green-700 px-1 rounded font-bold">generative</span> model unless the developer implements <span className="bg-green-100 text-green-700 px-1 rounded font-bold">an artificial intelligence safety incident reporting</span> framework.
          </p>
          <div className="mt-3 pt-3 border-t border-black/5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-black/40">
            <CheckCircle2 size={12} className="text-green-500" /> Insertions: 2
            <span className="mx-2">|</span>
            <AlertTriangle size={12} className="text-red-500" /> Deletions: 1
          </div>
        </div>
      </section>
    </div>
  );
}
