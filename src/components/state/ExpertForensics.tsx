import React from 'react';
import { NodeEntity } from '../../types';
import { Network, Database, Layers, ExternalLink } from 'lucide-react';

interface ExpertForensicsProps {
  bill: NodeEntity;
}

export function ExpertForensics({ bill }: ExpertForensicsProps) {
  const telemetry = bill.telemetry;
  const sisScore = telemetry?.specialInterestSyndicationScore ? (telemetry.specialInterestSyndicationScore * 100).toFixed(1) : 0;
  const spilloverScore = telemetry?.extraterritorialSpilloverCoefficient ? (telemetry.extraterritorialSpilloverCoefficient * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      {/* Telemetry Scorecard */}
      <section className="bg-white rounded-xl border border-black/5 p-4 shadow-sm">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-red flex items-center gap-1.5 mb-4">
          <Database size={14} />
          Deep Telemetry Matrix
        </h4>
        
        <div className="grid grid-cols-2 gap-4">
          {/* SIS Score */}
          <div className="bg-black/5 p-3 rounded-lg border border-black/5">
            <p className="text-[10px] font-bold text-black/40 uppercase tracking-widest mb-1">SIS Index</p>
            <p className="text-xl font-black text-black/80">{sisScore}%</p>
            <p className="text-[9px] text-black/40 mt-1 leading-tight">Special Interest Syndication (AALC Model Match)</p>
          </div>
          
          {/* Extraterritorial Spillover */}
          <div className="bg-black/5 p-3 rounded-lg border border-black/5">
            <p className="text-[10px] font-bold text-black/40 uppercase tracking-widest mb-1">Reg Spillover</p>
            <p className="text-xl font-black text-black/80">{spilloverScore}%</p>
            <p className="text-[9px] text-black/40 mt-1 leading-tight">Extraterritorial Corporate Impact</p>
          </div>
        </div>
      </section>

      {/* Multiplex Graph Topology Canvas (Placeholder) */}
      <section className="bg-white rounded-xl border border-black/5 overflow-hidden shadow-sm">
        <div className="p-3 border-b border-black/5 bg-black/5 flex justify-between items-center">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/60 flex items-center gap-1.5">
            <Network size={14} />
            Graph Topology
          </h4>
          <button className="text-brand-blue/60 hover:text-brand-blue p-1 rounded transition-colors">
            <ExternalLink size={14} />
          </button>
        </div>
        
        <div className="h-48 bg-gradient-to-br from-brand-blue/5 to-purple-500/5 relative overflow-hidden flex flex-col items-center justify-center border-t border-black/5">
          {/* Abstract Nodes Visual */}
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(circle at 20% 30%, #3b82f6 2px, transparent 2px), radial-gradient(circle at 80% 70%, #ef4444 2px, transparent 2px), radial-gradient(circle at 50% 50%, #8b5cf6 2px, transparent 2px)',
            backgroundSize: '40px 40px'
          }} />
          
          <Layers size={32} className="text-brand-red/20 mb-2" />
          <p className="text-xs font-mono text-black/40 text-center px-4">
            Interactive Node-Edge Visualizer <br/> (WebGL Canvas Placeholder)
          </p>
          <div className="mt-4 px-3 py-1 bg-white/50 backdrop-blur rounded-full border border-black/5 text-[9px] font-bold uppercase tracking-widest text-black/50">
            Edges: {bill.id === 'bill-1' ? '14' : '3'} / Triangles: {bill.id === 'bill-1' ? '8' : '1'}
          </div>
        </div>
      </section>
    </div>
  );
}
