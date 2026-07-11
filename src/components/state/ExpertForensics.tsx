import React, { useState, useRef, useEffect } from 'react';
import { NodeEntity } from '../../types';
import { Network, Database, Layers, ExternalLink, RefreshCw } from 'lucide-react';
import { useGraphTopology } from '../../hooks/useGraphTopology';
import ForceGraph2D from 'react-force-graph-2d';

interface ExpertForensicsProps {
  bill: NodeEntity;
}

export function ExpertForensics({ bill }: ExpertForensicsProps) {
  const telemetry = bill.telemetry;
  const hasSis = typeof telemetry?.specialInterestSyndicationScore === 'number';
  const hasSpillover = typeof telemetry?.extraterritorialSpilloverCoefficient === 'number';
  const sisScore = hasSis ? (telemetry!.specialInterestSyndicationScore! * 100).toFixed(1) : null;
  const spilloverScore = hasSpillover ? (telemetry!.extraterritorialSpilloverCoefficient! * 100).toFixed(1) : null;

  const [graphDepth, setGraphDepth] = useState<2 | 3>(2);
  const { data, loading } = useGraphTopology(bill.id, graphDepth);
  const graphRef = useRef<any>(null);

  // Resize graph to fit container
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: 250 // fixed height
      });
    }
  }, [containerRef, data]);

  return (
    <div className="space-y-6">
      {/* Telemetry Scorecard — only rendered for signals actually computed */}
      {(hasSis || hasSpillover) && (
        <section className="bg-white rounded-xl border border-black/5 p-4 shadow-sm">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-red flex items-center gap-1.5 mb-4">
            <Database size={14} />
            Deep Telemetry Matrix
          </h4>

          <div className="grid grid-cols-2 gap-4">
            {hasSis && (
              <div className="bg-black/5 p-3 rounded-lg border border-black/5">
                <p className="text-[10px] font-bold text-black/40 uppercase tracking-widest mb-1">SIS Index</p>
                <p className="text-xl font-black text-black/80">{sisScore}%</p>
                <p className="text-[9px] text-black/40 mt-1 leading-tight">Special Interest Syndication (AALC Model Match)</p>
              </div>
            )}

            {hasSpillover && (
              <div className="bg-black/5 p-3 rounded-lg border border-black/5">
                <p className="text-[10px] font-bold text-black/40 uppercase tracking-widest mb-1">Reg Spillover</p>
                <p className="text-xl font-black text-black/80">{spilloverScore}%</p>
                <p className="text-[9px] text-black/40 mt-1 leading-tight">Extraterritorial Corporate Impact</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Multiplex Graph Topology Canvas */}
      <section className="bg-white rounded-xl border border-black/5 overflow-hidden shadow-sm flex flex-col">
        <div className="p-3 border-b border-black/5 bg-black/5 flex justify-between items-center">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/60 flex items-center gap-1.5">
            <Network size={14} />
            Graph Topology
          </h4>
          <div className="flex items-center gap-2">
            {/* Depth Toggle */}
            <div className="flex bg-black/5 rounded-md p-0.5 border border-black/5">
              <button 
                onClick={() => setGraphDepth(2)}
                className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded ${graphDepth === 2 ? 'bg-white text-brand-blue shadow-sm' : 'text-black/40 hover:text-black/60'}`}
              >
                2-Deg
              </button>
              <button 
                onClick={() => setGraphDepth(3)}
                className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded ${graphDepth === 3 ? 'bg-white text-brand-red shadow-sm' : 'text-black/40 hover:text-black/60'}`}
              >
                3-Deg
              </button>
            </div>
            <button className="text-brand-blue/60 hover:text-brand-blue p-1 rounded transition-colors" title="Open Full Screen">
              <ExternalLink size={14} />
            </button>
          </div>
        </div>
        
        <div ref={containerRef} className="h-[250px] bg-gradient-to-br from-brand-blue/5 to-purple-500/5 relative overflow-hidden flex flex-col items-center justify-center border-t border-black/5">
          {loading ? (
            <div className="flex flex-col items-center">
               <RefreshCw size={24} className="text-brand-blue/50 animate-spin mb-2" />
               <p className="text-[10px] font-mono text-black/40 uppercase tracking-widest">Traversing Edges...</p>
            </div>
          ) : data.nodes.length > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={data}
              nodeLabel="name"
              nodeColor="color"
              nodeRelSize={6}
              linkColor={() => '#00000020'}
              linkWidth={1.5}
              d3AlphaDecay={0.05}
              d3VelocityDecay={0.4}
              onEngineStop={() => {
                 if (graphRef.current) {
                   graphRef.current.zoomToFit(400, 20);
                 }
              }}
            />
          ) : (
            <div className="flex flex-col items-center">
              <Layers size={32} className="text-brand-red/20 mb-2" />
              <p className="text-xs font-mono text-black/40 text-center px-4">
                No Relational Edges Found
              </p>
            </div>
          )}
          
          {!loading && data.nodes.length > 0 && (
            <div className="absolute bottom-3 right-3 px-3 py-1 bg-white/70 backdrop-blur rounded-full border border-black/10 shadow-sm text-[9px] font-bold uppercase tracking-widest text-black/60 pointer-events-none">
              Nodes: {data.nodes.length} / Edges: {data.links.length}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
