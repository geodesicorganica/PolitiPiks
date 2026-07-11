import React, { useEffect, useState } from 'react';
import { BookOpen, AlertCircle, Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { NodeEntity } from '../../types';
import { IntermediateAnalysis } from './IntermediateAnalysis';
import { ExpertForensics } from './ExpertForensics';

interface ReadingRoomPanelProps {
  billId: string | null;
  onClose: () => void;
  depthLevel: 1 | 2 | 3;
}

export function ReadingRoomPanel({ billId, onClose, depthLevel }: ReadingRoomPanelProps) {
  const [bill, setBill] = useState<NodeEntity | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!billId) return;
    
    const fetchBill = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'entities', billId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setBill({ id: docSnap.id, ...docSnap.data() } as NodeEntity);
        }
      } catch (e) {
        console.error("Error fetching bill details:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchBill();
  }, [billId]);

  if (!billId) return null;

  return (
    <div className="w-96 shrink-0 bg-white/90 backdrop-blur-xl rounded-2xl border border-brand-blue/15 shadow-2xl shadow-brand-blue/20 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-black/5 flex justify-between items-start bg-brand-blue/5">
        <div>
          <h3 className="font-bold text-sm uppercase tracking-widest text-brand-blue flex items-center gap-2 mb-1">
            <BookOpen size={16} />
            AI Reading Room
          </h3>
          <span className="text-xs font-mono text-black/50">Viewing: {bill?.identifier ?? billId.split('-').pop()?.toUpperCase()}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-black/5 text-black/40 hover:text-black transition-colors">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-black/40 text-xs font-mono uppercase tracking-widest">
            <Loader2 size={14} className="animate-spin" />
            Loading bill data...
          </div>
        )}

        {/* L1: Bill status line */}
        {bill?.latestActionDescription && (
          <section className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/40">Latest Action</h4>
            <p className="text-xs text-black/60 leading-relaxed">
              {bill.latestActionAt ? `${bill.latestActionAt}: ` : ''}{bill.latestActionDescription}
            </p>
          </section>
        )}

        {/* L1: TL;DR Summary Block (synthesized from real bill text at ingest time) */}
        {(bill?.tldr?.whatChanges || bill?.tldr?.whoImpacted) && (
          <section className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/40">TL;DR Synthesizer</h4>
            <div className="bg-white rounded-xl border border-black/5 p-4 shadow-sm space-y-4">
              {bill.tldr?.whatChanges && (
                <div>
                  <p className="text-xs font-bold text-brand-blue mb-1">What changes:</p>
                  <p className="text-sm text-black/70 leading-relaxed">{bill.tldr.whatChanges}</p>
                </div>
              )}
              {bill.tldr?.whoImpacted && (
                <div>
                  <p className="text-xs font-bold text-brand-blue mb-1">Who is impacted:</p>
                  <p className="text-sm text-black/70 leading-relaxed">{bill.tldr.whoImpacted}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* L1: Fiscal Note Block */}
        {bill?.fiscalSummary?.headline && (
          <section className="space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/40">Fiscal Extraction</h4>
            <div className="bg-red-50/50 rounded-xl border border-brand-red/20 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-brand-red">
                <AlertCircle size={14} />
                <span className="text-xs font-bold uppercase tracking-wider">Fiscal Signal</span>
              </div>
              <p className="text-xl font-black text-brand-red mb-1">{bill.fiscalSummary.headline}</p>
              {bill.fiscalSummary.detail && (
                <p className="text-[10px] font-mono text-brand-red/70">{bill.fiscalSummary.detail}</p>
              )}
            </div>
          </section>
        )}

        {!loading && bill && !bill.tldr?.whatChanges && !bill.fiscalSummary?.headline && (
          <section className="rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-4 text-center">
            <p className="text-xs font-medium italic text-black/40">
              No synthesized summary yet for this bill. Full text{bill.sourceUrl ? ' is available at the source below.' : ' has not been ingested.'}
            </p>
            {bill.sourceUrl && (
              <a href={bill.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-brand-blue underline">
                View on OpenStates
              </a>
            )}
          </section>
        )}

        {/* L2 Context Injection */}
        {depthLevel >= 2 && bill && (
          <section className="space-y-3 pt-4 border-t border-black/5">
             <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-blue mb-4">Context & Evolution (L2)</h4>
             <IntermediateAnalysis bill={bill} />
          </section>
        )}

        {/* L3 Forensics Injection */}
        {depthLevel >= 3 && bill && (
          <section className="space-y-3 pt-4 border-t border-black/5 pb-8">
             <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-red mb-4">Expert Forensics (L3)</h4>
             <ExpertForensics bill={bill} />
          </section>
        )}

      </div>
    </div>
  );
}
