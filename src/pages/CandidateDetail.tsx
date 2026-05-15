import { useState } from 'react';
import { motion } from 'motion/react';
import { Candidate } from '../types';
import { cn } from '../lib/utils';
import { ArrowLeft, ExternalLink } from 'lucide-react';

export function CandidateDetail({ candidate, onBack }: { candidate: Candidate; onBack: () => void }) {
  const sortedVotes = [...(candidate.keyVotes || [])].sort((a, b) => new Date(b.date || '1970-01-01').getTime() - new Date(a.date || '1970-01-01').getTime());

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="p-6 md:p-10 space-y-8 bg-slate-900 brutalist-card text-white min-h-screen"
    >
      <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 uppercase text-xs font-mono tracking-widest italic">
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black uppercase italic text-brand-red">{candidate.name}</h1>
          <p className="text-sm font-mono text-slate-500 mt-2 uppercase tracking-widest">{candidate.party} Candidate</p>
        </div>
        <div className="flex gap-4">
          {candidate.websiteUrl && (
            <a href={candidate.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-black uppercase px-4 py-2 border border-slate-700 hover:bg-slate-800">
               Website <ExternalLink size={12} />
            </a>
          )}
          {candidate.ballotpediaUrl && (
            <a href={candidate.ballotpediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-black uppercase px-4 py-2 border border-slate-700 hover:bg-slate-800">
               Ballotpedia <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <section className="bg-black/40 p-6 brutalist-card">
            <h2 className="text-lg font-black uppercase italic text-white mb-4">Biography</h2>
            <p className="text-sm text-slate-400 leading-relaxed">{candidate.biography || 'Biography not available.'}</p>
          </section>

          <section className="bg-black/40 p-6 brutalist-card">
            <h2 className="text-lg font-black uppercase italic text-white mb-4">Voting Record ({sortedVotes.length})</h2>
            <div className="space-y-4">
              {sortedVotes.map((vote, i) => (
                <div key={i} className="border-b border-white/5 pb-4 last:border-0 group">
                   <div className="flex justify-between items-center mb-1">
                      <a href={vote.url} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-white hover:text-brand-red transition-colors">{vote.bill}</a>
                      <span className={cn(
                        "text-[10px] font-mono px-2 py-0.5 font-bold uppercase",
                        vote.vote === 'Yea' || vote.vote === 'Lead' || vote.vote === 'Support' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {vote.vote}
                      </span>
                   </div>
                   <p className="text-[11px] text-slate-400 italic mb-1">{vote.impact}</p>
                   {vote.date && <p className="text-[10px] text-slate-600 font-mono">{vote.date}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          {candidate.campaignPromises && candidate.campaignPromises.length > 0 && (
            <section className="bg-black/40 p-6 brutalist-card">
              <h2 className="text-sm font-black uppercase italic text-white mb-4">Campaign Promises</h2>
              <ul className="space-y-2">
                {candidate.campaignPromises.map((promise, i) => (
                  <li key={i} className="text-[11px] text-slate-400 font-mono list-disc ml-4">{promise}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </motion.div>
  );
}
