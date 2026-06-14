import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, Activity, BrainCircuit } from 'lucide-react';
import { cn } from '../lib/utils';
// Placeholder imports for components we will build in Phase 2, 3, 4
import { IngestionFeed } from '../components/state/IngestionFeed';
import { LegislativeCalendar } from '../components/state/LegislativeCalendar';
import { ReadingRoomPanel } from '../components/state/ReadingRoomPanel';

export function StatePlatform() {
  // depthLevel manages the Progressive Disclosure Framework (1, 2, or 3)
  const [depthLevel, setDepthLevel] = useState<1 | 2 | 3>(1);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Platform Header & Depth Toggles */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black italic tracking-tight text-brand-blue page-title uppercase">PIP-S Telemetry</h2>
          <p className="text-sm font-mono text-black/60 uppercase tracking-widest mt-1">
            Subnational Policy & Political Intelligence
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-black/5 p-1">
          <button
            onClick={() => setDepthLevel(1)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
              depthLevel === 1 ? "bg-white text-brand-blue shadow-sm" : "text-black/50 hover:text-black/80"
            )}
          >
            <Activity size={14} />
            <span>L1: Discovery</span>
          </button>
          <button
            onClick={() => setDepthLevel(2)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
              depthLevel === 2 ? "bg-brand-blue text-white shadow-sm" : "text-black/50 hover:text-black/80"
            )}
          >
            <Layers size={14} />
            <span>L2: Context</span>
          </button>
          <button
            onClick={() => setDepthLevel(3)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
              depthLevel === 3 ? "bg-brand-red text-white shadow-sm" : "text-black/50 hover:text-black/80"
            )}
          >
            <BrainCircuit size={14} />
            <span>L3: Forensics</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex gap-6 min-h-0 relative">
        {/* Left Column: Feed & Calendar */}
        <div className={cn("flex-1 flex flex-col gap-6 transition-all duration-300", selectedBillId ? "max-w-2xl" : "max-w-full")}>
          <IngestionFeed onSelectBill={setSelectedBillId} selectedBillId={selectedBillId} />
          {depthLevel === 1 && (
            <LegislativeCalendar />
          )}
        </div>

        {/* Right Column: Slide-out Panel / Reading Room / Forensics */}
        <AnimatePresence>
          {selectedBillId && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="w-96 shrink-0 bg-transparent flex flex-col"
            >
              <ReadingRoomPanel billId={selectedBillId} onClose={() => setSelectedBillId(null)} depthLevel={depthLevel} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Temporary Debug Button to toggle panel for UI testing */}
      <button 
        onClick={() => setSelectedBillId(selectedBillId ? null : 'test-bill')}
        className="absolute bottom-4 right-4 text-xs font-mono text-black/30 hover:text-black/60"
      >
        Toggle Bill Panel
      </button>
    </div>
  );
}
