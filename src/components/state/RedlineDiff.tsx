import React, { useMemo } from 'react';
import { diffWordsWithSpace } from 'diff';
import { CheckCircle2, AlertTriangle, GitCompare } from 'lucide-react';

interface RedlineDiffProps {
  originalText: string;
  modifiedText: string;
}

export function RedlineDiff({ originalText, modifiedText }: RedlineDiffProps) {
  const { diffs, stats } = useMemo(() => {
    const changes = diffWordsWithSpace(originalText, modifiedText);
    
    let insertions = 0;
    let deletions = 0;

    const mappedDiffs = changes.map((part, index) => {
      if (part.added) {
        insertions++;
        return (
          <span key={index} className="bg-green-100 text-green-800 px-0.5 rounded font-bold mx-[1px]">
            {part.value}
          </span>
        );
      }
      if (part.removed) {
        deletions++;
        return (
          <span key={index} className="bg-red-100 text-red-800 line-through px-0.5 rounded mx-[1px]">
            {part.value}
          </span>
        );
      }
      return <span key={index}>{part.value}</span>;
    });

    return { diffs: mappedDiffs, stats: { insertions, deletions } };
  }, [originalText, modifiedText]);

  return (
    <section className="bg-white rounded-xl border border-black/5 overflow-hidden shadow-sm">
      <div className="p-3 border-b border-black/5 bg-black/5 flex justify-between items-center">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/60 flex items-center gap-1.5">
          <GitCompare size={14} />
          Redline Diff Workbench
        </h4>
      </div>
      <div className="p-4 font-mono text-[11px] sm:text-xs leading-relaxed text-black/80">
        <div className="bg-white border border-black/5 rounded-lg p-3 shadow-inner">
           {diffs}
        </div>
        
        <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-black/50 font-bold">
            <span className="flex items-center gap-1">
              <CheckCircle2 size={12} className="text-green-500" /> Insertions: {stats.insertions}
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle size={12} className="text-red-500" /> Deletions: {stats.deletions}
            </span>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-black/30 font-bold">
            Diff Engine Active
          </span>
        </div>
      </div>
    </section>
  );
}
