import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Info, CheckCircle2, AlertTriangle, AlertCircle, Calendar, Users, BarChart3, TrendingUp, DollarSign } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  ContestResearchBundle,
  CandidateResearchCard,
  SourceRecord,
  HistoricalMetrics,
  PollingMetrics,
  FundamentalsMetrics,
  TurnoutMetrics,
  DemographicMetrics,
  SupportOppositionMetrics,
  FiscalMetrics,
  FreshnessSummary,
  ConfidenceSummary
} from '../types';

/**
 * ContestMetrics mixes two unit conventions (see src/types.ts): shares/rates/
 * demographics are fractions (0-1); margins/lean/headwind are already
 * percentage points. These three helpers are the only places that convert
 * either into display text — picking the wrong one for a new field is a
 * one-line diff to review, instead of a silent unit bug.
 */
function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '--';
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatSignedPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '--';
  const pct = fraction * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function formatSignedPoints(points: number | null | undefined): string {
  if (points === null || points === undefined) return '--';
  return `${points > 0 ? '+' : ''}${points}`;
}

export interface ResearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  target:
    | { kind: 'race'; raceId: string; initialCandidateId?: string }
    | { kind: 'measure'; measureId: string }
    | null;
  bundle?: ContestResearchBundle | null;
  loading: boolean;
  error?: Error | null;
  onCandidateTabRequested?: (candidateId: string) => void;
}

export function ResearchDrawer({ isOpen, onClose, target, bundle, loading, error, onCandidateTabRequested }: ResearchDrawerProps) {
  const [activeTab, setActiveTab] = useState<string>('overview');

  useEffect(() => {
    if (isOpen && target) {
      if (target.kind === 'race' && target.initialCandidateId) {
        setActiveTab(target.initialCandidateId);
      } else {
        setActiveTab('overview');
      }
    }
  }, [isOpen, target]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative flex h-full w-full max-w-xl flex-col bg-[#F8F9FA] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {loading && (
            <div className="flex h-full flex-col items-center justify-center space-y-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
              <p className="text-sm font-bold uppercase tracking-widest text-black/40">Loading research...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-center">
              <AlertTriangle size={48} className="text-red-500" />
              <p className="text-sm font-bold uppercase tracking-widest text-red-500">Error loading research</p>
              <p className="text-sm text-black/60">{error.message}</p>
            </div>
          )}

          {bundle && !loading && !error && (
            <>
              <ResearchDrawerHeader meta={bundle.meta} overviewSource={bundle.overview.source} onClose={onClose} />
              
              {bundle.contestType === 'race' && bundle.race && (
                <RaceCandidateTabs 
                  candidates={bundle.race.candidates} 
                  activeCandidateId={activeTab === 'overview' ? undefined : activeTab}
                  onActiveChange={(id) => {
                    setActiveTab(id);
                    onCandidateTabRequested?.(id);
                  }}
                  onOverviewClick={() => setActiveTab('overview')}
                />
              )}

              <div className="flex-1 overflow-y-auto p-4 lg:p-6">
                {activeTab === 'overview' && (
                  <ContestOverviewTab 
                    meta={bundle.meta}
                    overview={bundle.overview}
                    historical={bundle.race?.historical}
                    polling={bundle.race?.polling}
                    fundamentals={bundle.race?.fundamentals}
                    turnout={bundle.race?.turnout}
                    demographics={bundle.race?.demographics}
                    measureSummary={bundle.measure?.summary}
                    measureSupport={bundle.measure?.supportOpposition}
                    measureFiscal={bundle.measure?.fiscalEffects}
                    measureOfficialText={bundle.measure?.officialTextSummary}
                    measureLegalHistory={bundle.measure?.legalHistorySummary}
                    sources={bundle.sources}
                    freshness={bundle.freshness}
                    confidence={bundle.confidence}
                    missingFields={bundle.missingFields}
                    isMeasure={bundle.contestType === 'measure'}
                  />
                )}

                {activeTab !== 'overview' && bundle.contestType === 'race' && (
                  <CandidateResearchPanel 
                    candidate={bundle.race!.candidates.find(c => c.candidateId === activeTab)!}
                    sources={bundle.sources}
                  />
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function ResearchDrawerHeader({ meta, overviewSource, onClose }: { meta: ContestResearchBundle['meta']; overviewSource: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-black/5 bg-white px-4 py-4 lg:px-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-black/5 px-2 py-0.5 text-[10px] font-black uppercase text-black/60">
            {meta.jurisdiction}
          </span>
          <span className="rounded bg-black/5 px-2 py-0.5 text-[10px] font-black uppercase text-black/60">
            {meta.electionYear}
          </span>
          {meta.mode === 'live' && (
            <span className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-red-600">
              Live
            </span>
          )}
        </div>
        <h2 className="text-xl font-black italic uppercase tracking-tight">{meta.title}</h2>
        <p className="text-[10px] uppercase text-black/40">Overview Source: {overviewSource}</p>
      </div>
      <button onClick={onClose} className="rounded-full p-2 hover:bg-black/5" title="Close">
        <X size={20} />
      </button>
    </div>
  );
}

function RaceCandidateTabs({ 
  candidates, 
  activeCandidateId, 
  onActiveChange, 
  onOverviewClick 
}: { 
  candidates: CandidateResearchCard[]; 
  activeCandidateId?: string; 
  onActiveChange: (id: string) => void;
  onOverviewClick: () => void;
}) {
  return (
    <div className="flex shrink-0 overflow-x-auto border-b border-black/5 bg-white px-4 lg:px-6 no-scrollbar">
      <div className="flex gap-4 pb-2 pt-2">
        <button
          onClick={onOverviewClick}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors",
            !activeCandidateId ? "bg-brand-blue text-white" : "bg-black/5 text-black/60 hover:bg-black/10 hover:text-black"
          )}
        >
          Overview
        </button>
        {candidates.map(c => (
          <button
            key={c.candidateId}
            onClick={() => onActiveChange(c.candidateId)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors",
              activeCandidateId === c.candidateId ? "bg-brand-blue text-white" : "bg-black/5 text-black/60 hover:bg-black/10 hover:text-black"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function ContestOverviewTab({
  meta,
  overview,
  historical,
  polling,
  fundamentals,
  turnout,
  demographics,
  measureSummary,
  measureSupport,
  measureFiscal,
  measureOfficialText,
  measureLegalHistory,
  sources,
  freshness,
  confidence,
  missingFields,
  isMeasure
}: {
  meta: ContestResearchBundle['meta'];
  overview: ContestResearchBundle['overview'];
  historical?: HistoricalMetrics;
  polling?: PollingMetrics;
  fundamentals?: FundamentalsMetrics;
  turnout?: TurnoutMetrics;
  demographics?: DemographicMetrics;
  measureSummary?: string;
  measureSupport?: SupportOppositionMetrics;
  measureFiscal?: FiscalMetrics;
  measureOfficialText?: string | null;
  measureLegalHistory?: string | null;
  sources: SourceRecord[];
  freshness: FreshnessSummary;
  confidence: ConfidenceSummary;
  missingFields: string[];
  isMeasure: boolean;
}) {
  return (
    <div className="space-y-8 pb-12">
      {/* Overview Block */}
      <section>
        <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-black/50">Contest Overview</h3>
        <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          <p className="text-sm leading-relaxed text-black/80">{overview.summary}</p>
        </div>
      </section>

      {/* Freshness & Confidence Banner */}
      <div className="flex flex-col gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Info size={14} className="shrink-0" />
          <span>Last updated: {freshness.lastUpdated ? new Date(freshness.lastUpdated).toLocaleDateString() : 'Unknown'}</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span className="uppercase text-blue-900/60">Confidence Score:</span>
          <span className="font-bold">{confidence.overall.toFixed(2)}</span>
        </div>
      </div>

      {missingFields.length > 3 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p className="text-xs">
            <strong>Limited Research Available.</strong> Expected data fields are missing: {missingFields.join(', ')}.
          </p>
        </div>
      )}

      {isMeasure ? (
        <>
          <MeasureResearchPanel 
            summary={measureSummary} 
            support={measureSupport} 
            fiscal={measureFiscal} 
            missingFields={missingFields} 
            officialText={measureOfficialText}
            legalHistory={measureLegalHistory}
          />
        </>
      ) : (
        <div className="space-y-6">
          <MetricSection title="Historical Results" icon={Calendar} missing={missingFields.includes('historical')}>
            {historical && (
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="Prior Dem Share" value={formatPercent(historical.priorVoteShareDem)} />
                <MetricCard label="Prior Rep Share" value={formatPercent(historical.priorVoteShareRep)} />
                <MetricCard label="Prior Margin" value={formatSignedPoints(historical.priorMargin)} />
                <MetricCard label="Swing vs Prev" value={formatSignedPoints(historical.swingVsPrevious)} />
              </div>
            )}
          </MetricSection>

          <MetricSection title="Polling" icon={BarChart3} missing={missingFields.includes('polling')} lowConfidence={confidence.lowConfidenceFields.includes('polling')}>
            {polling && (
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="Avg Margin" value={formatSignedPoints(polling.averageMargin)} />
                <MetricCard label="Poll Count" value={polling.pollCount?.toString() || '0'} />
                <MetricCard label="Trend" value={polling.trend || '--'} />
                <MetricCard label="Variance" value={polling.variance !== null && polling.variance !== undefined ? polling.variance.toFixed(3) : '--'} />
              </div>
            )}
          </MetricSection>

          <MetricSection title="Fundamentals" icon={TrendingUp} missing={missingFields.includes('fundamentals')}>
            {fundamentals && (
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="Incumbency" value={fundamentals.incumbencyFlag ? 'Yes' : 'No'} />
                <MetricCard label="Home State Adv" value={fundamentals.homeStateAdvantageFlag ? 'Yes' : 'No'} />
                <MetricCard label="National Env" value={formatSignedPoints(fundamentals.nationalHeadwindTailwind)} />
                <MetricCard label="Econ Proxy" value={formatSignedPoints(fundamentals.economicDirectionIndicator)} />
              </div>
            )}
          </MetricSection>

          <MetricSection title="Turnout" icon={Users} missing={missingFields.includes('turnout')}>
            {turnout && (
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="Turnout Rate" value={formatPercent(turnout.turnoutRate)} />
                <MetricCard label="Turnout Change" value={formatSignedPercent(turnout.turnoutChange)} />
              </div>
            )}
          </MetricSection>

          <MetricSection title="Demographics" icon={Users} missing={missingFields.includes('demographics')}>
            {demographics && (
              <div className="space-y-4">
                {demographics.urbanRuralShare && (
                  <div className="grid grid-cols-2 gap-4">
                    <MetricCard label="Urban Share" value={formatPercent(demographics.urbanRuralShare.urban)} />
                    <MetricCard label="Rural Share" value={formatPercent(demographics.urbanRuralShare.rural)} />
                  </div>
                )}
                {demographics.racialComposition && (
                  <div className="rounded border border-black/10 p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase text-black/50">Racial Composition</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(demographics.racialComposition).map(([race, share]) => (
                        <span key={race} className="rounded bg-black/5 px-2 py-1 text-xs">{race}: {formatPercent(share)}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </MetricSection>
        </div>
      )}

      <SourcesSection sources={sources} />
    </div>
  );
}

function MetricSection({ title, icon: Icon, missing, lowConfidence, children }: { title: string; icon: any; missing: boolean; lowConfidence?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-black/40" />
        <h3 className="text-xs font-black uppercase tracking-widest text-black/50">{title}</h3>
        {lowConfidence && !missing && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">Low Confidence</span>
        )}
      </div>
      {missing ? (
        <div className="rounded-xl border border-dashed border-black/10 bg-black/[0.02] p-4 text-center">
          <p className="text-xs font-medium italic text-black/40">Data not available.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
          {children}
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded bg-black/5 p-2">
      <span className="text-[10px] font-bold uppercase text-black/50">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

function MeasureResearchPanel({ summary, support, fiscal, missingFields, officialText, legalHistory }: { summary?: string; support?: SupportOppositionMetrics; fiscal?: FiscalMetrics; missingFields: string[]; officialText?: string | null; legalHistory?: string | null }) {
  return (
    <div className="space-y-6">
      <MetricSection title="Measure Summary" icon={Info} missing={!summary}>
        {summary && <p className="text-sm text-black/80">{summary}</p>}
      </MetricSection>

      <MetricSection title="Support & Opposition" icon={Users} missing={missingFields.includes('supportOpposition')}>
        {support && (
          <div className="space-y-4">
            {support.summary && <p className="text-sm text-black/80">{support.summary}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {support.supporters && support.supporters.length > 0 && (
                <div className="rounded border border-green-500/20 bg-green-50 p-3">
                  <h4 className="mb-2 text-[10px] font-bold uppercase text-green-700">Supporters</h4>
                  <ul className="list-inside list-disc space-y-1 text-xs text-green-900/80">
                    {support.supporters.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              {support.opponents && support.opponents.length > 0 && (
                <div className="rounded border border-red-500/20 bg-red-50 p-3">
                  <h4 className="mb-2 text-[10px] font-bold uppercase text-red-700">Opponents</h4>
                  <ul className="list-inside list-disc space-y-1 text-xs text-red-900/80">
                    {support.opponents.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </MetricSection>

      <MetricSection title="Fiscal Effects" icon={DollarSign} missing={missingFields.includes('fiscalEffects')}>
        {fiscal && <p className="text-sm text-black/80">{fiscal.summary}</p>}
      </MetricSection>

      <MetricSection title="Official Text" icon={Info} missing={missingFields.includes('officialText')}>
        {officialText && <p className="text-sm text-black/80">{officialText}</p>}
      </MetricSection>

      <MetricSection title="Legal History" icon={Info} missing={missingFields.includes('legalHistory')}>
        {legalHistory && <p className="text-sm text-black/80">{legalHistory}</p>}
      </MetricSection>
    </div>
  );
}

function CandidateResearchPanel({ candidate, sources }: { candidate: CandidateResearchCard; sources: SourceRecord[] }) {
  const candidateSources = sources.filter(s => candidate.sourceIds.includes(s.id));

  return (
    <div className="space-y-6 pb-12">
      <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-black uppercase tracking-tight">{candidate.name}</h3>
          <p className="font-mono text-xs text-black/50">
            {candidate.party} {candidate.incumbency ? `· ${candidate.incumbency.toUpperCase()}` : ''}
          </p>
        </div>
        
        {candidate.identitySummary ? (
          <p className="text-sm leading-relaxed text-black/80">{candidate.identitySummary}</p>
        ) : (
          <p className="text-sm italic text-black/40">No detailed biography available.</p>
        )}
      </div>

      <MetricSection title="Campaign Presence" icon={Info} missing={!candidate.contestContext}>
        {candidate.contestContext && <p className="text-sm leading-relaxed text-black/80">{candidate.contestContext}</p>}
      </MetricSection>

      <MetricSection title="Public Record" icon={Info} missing={!candidate.publicRecordBullets || candidate.publicRecordBullets.length === 0}>
        {candidate.publicRecordBullets && candidate.publicRecordBullets.length > 0 && (
          <ul className="list-inside list-disc space-y-2 text-sm text-black/80">
            {candidate.publicRecordBullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        )}
      </MetricSection>

      <MetricSection title="Legislative Activity" icon={Info} missing={!candidate.legislativeActivityBullets || candidate.legislativeActivityBullets.length === 0}>
        {candidate.legislativeActivityBullets && candidate.legislativeActivityBullets.length > 0 && (
          <ul className="list-inside list-disc space-y-2 text-sm text-black/80">
            {candidate.legislativeActivityBullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        )}
      </MetricSection>

      <MetricSection title="Policy Positions" icon={Info} missing={!candidate.policyPositionsBullets || candidate.policyPositionsBullets.length === 0}>
        {candidate.policyPositionsBullets && candidate.policyPositionsBullets.length > 0 && (
          <ul className="list-inside list-disc space-y-2 text-sm text-black/80">
            {candidate.policyPositionsBullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        )}
      </MetricSection>

      <MetricSection title="Elections History" icon={Info} missing={!candidate.electionsHistorySummary}>
        {candidate.electionsHistorySummary && <p className="text-sm leading-relaxed text-black/80">{candidate.electionsHistorySummary}</p>}
      </MetricSection>

      {candidateSources.length > 0 && <SourcesSection sources={candidateSources} title="Candidate Sources" />}
    </div>
  );
}

function SourcesSection({ sources, title = "Sources" }: { sources: SourceRecord[]; title?: string }) {
  if (sources.length === 0) return null;

  return (
    <section className="mt-8 border-t border-black/5 pt-6">
      <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-black/50">{title}</h3>
      <div className="grid gap-2">
        {sources.map((source, i) => (
          <a
            key={i}
            href={source.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 rounded-lg border border-black/10 bg-white p-3 transition hover:border-brand-blue/30 hover:bg-brand-blue/5"
          >
            <div className="mt-0.5 rounded bg-black/5 p-1 text-black/40 group-hover:bg-brand-blue/10 group-hover:text-brand-blue">
              <ExternalLink size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-brand-blue group-hover:underline">
                {source.title}
              </p>
              <div className="flex items-center gap-2 text-[10px] uppercase text-black/40">
                <span>{source.type}</span>
                {source.lastUpdated && (
                  <>
                    <span>•</span>
                    <span>Updated {new Date(source.lastUpdated).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
