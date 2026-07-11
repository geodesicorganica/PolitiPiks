import React, { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { BillVersion, NodeEntity } from '../../types';
import { AlertTriangle, Activity, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { RedlineDiff } from './RedlineDiff';

interface IntermediateAnalysisProps {
  bill: NodeEntity;
}

export function IntermediateAnalysis({ bill }: IntermediateAnalysisProps) {
  const telemetry = bill.telemetry;
  const hasSurvival = typeof telemetry?.survivalProbability === 'number';
  const survivalProb = hasSurvival ? (telemetry!.survivalProbability! * 100).toFixed(0) : null;
  const camouflageScore = telemetry?.topicTitleInversionGap ? (telemetry.topicTitleInversionGap * 100).toFixed(0) : 0;
  const isHighCamouflage = telemetry?.topicTitleInversionGap && telemetry.topicTitleInversionGap > 0.8;

  const [versions, setVersions] = useState<BillVersion[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchVersions = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'entities', bill.id, 'versions'), orderBy('date', 'asc')));
        if (cancelled) return;
        setVersions(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as BillVersion));
      } catch (e) {
        console.error('Error fetching bill versions:', e);
        if (!cancelled) setVersions([]);
      }
    };
    fetchVersions();
    return () => { cancelled = true; };
  }, [bill.id]);

  const versionsWithText = (versions ?? []).filter((v) => typeof v.text === 'string' && v.text.length > 0);
  const [priorVersion, latestVersion] = versionsWithText.slice(-2);
  const canDiff = versionsWithText.length >= 2;

  return (
    <div className="space-y-6">
      {/* Legislative Survival Score (LVS) Gauge */}
      {hasSurvival && (
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
            Stage-based heuristic from the bill's standardized status history.
          </p>
        </section>
      )}

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

      {/* Textual Redline Diff Workbench — real bill versions from OpenStates */}
      {canDiff ? (
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-black/40">
            Comparing "{priorVersion.label}" → "{latestVersion.label}"
            {(priorVersion.textTruncated || latestVersion.textTruncated) && ' (text truncated)'}
          </p>
          <RedlineDiff originalText={priorVersion.text!} modifiedText={latestVersion.text!} />
        </div>
      ) : (
        <section className="rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1 text-black/40">
            <FileText size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">Redline Unavailable</span>
          </div>
          <p className="text-xs font-medium italic text-black/40">
            {versions === null
              ? 'Loading bill versions…'
              : versionsWithText.length === 1
                ? 'Only one text version has been published — a redline needs two revisions to compare.'
                : 'No machine-readable text versions have been ingested for this bill yet.'}
          </p>
        </section>
      )}
    </div>
  );
}
