import { motion } from 'motion/react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { Candidate } from '../types';
import { useCanonicalContestEvidence } from '../lib/useCanonicalContestEvidence';
import { CanonicalEvidencePanels } from '../components/CanonicalEvidencePanels';

export function CandidateDetail({ candidate, raceId, onBack }: { candidate: Candidate; raceId: string; onBack: () => void }) {
  const { research, metrics, loading, error } = useCanonicalContestEvidence(raceId, candidate.id);
  return <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="p-6 md:p-10 space-y-8 bg-slate-900 brutalist-card text-white min-h-screen">
    <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 uppercase text-xs font-mono tracking-widest italic"><ArrowLeft size={16} /> Back to races</button>
    <header className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-slate-800 pb-8"><div><h1 className="text-4xl font-black uppercase italic text-brand-red">{candidate.name}</h1><p className="text-sm font-mono text-slate-500 mt-2 uppercase tracking-widest">{candidate.party} · {candidate.qualificationStatus ?? 'filing status unavailable'}</p></div><div className="flex flex-wrap gap-3">{candidate.websiteUrl && <a href={candidate.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-black uppercase px-4 py-2 border border-slate-700 hover:bg-slate-800">Website <ExternalLink size={12} /></a>}{candidate.ballotSourceUrl && <a href={candidate.ballotSourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-black uppercase px-4 py-2 border border-slate-700 hover:bg-slate-800">Ballot evidence <ExternalLink size={12} /></a>}</div></header>
    <CanonicalEvidencePanels research={research} metrics={metrics} loading={loading} error={error} />
  </motion.div>;
}
