import { useMemo, useState } from 'react';
import { Candidate } from '../types';
import { formatCloseAt, isPickClosed } from '../lib/electionCycle';
import { cn } from '../lib/utils';
import { useContestCatalog } from '../lib/useContestCatalog';
import { Loader2, ExternalLink, Clock } from 'lucide-react';
import { applyCatalogFilters, emptyCatalogFilters, measureReady } from '../lib/catalogFilters';
import { racePickUnavailableReason } from '../lib/predictionEligibility';
import { CatalogFilterControls } from '../components/CatalogFilterControls';

/**
 * The public race surface is intentionally browse-only. Picks belong to a league
 * because prediction documents are authorized against league membership.
 */
export function Races({ onSelectCandidate }: { onSelectCandidate: (candidate: Candidate, race: { id: string }) => void }) {
  const { races, measures, loading, error } = useContestCatalog();
  const [filters, setFilters] = useState(emptyCatalogFilters);
  const states = useMemo(() => [...new Set([...races, ...measures].map((item) => item.state))].sort(), [races, measures]);
  const filtered = useMemo(() => applyCatalogFilters(races, measures, filters), [races, measures, filters]);

  if (loading) return (
    <div className="flex h-64 items-center justify-center gap-3" role="status" aria-live="polite">
      <Loader2 className="animate-spin text-brand-blue" size={32} />
      <span className="font-mono text-xs uppercase text-slate-400">Loading certified contest catalog…</span>
    </div>
  );

  if (error) return <div role="alert" data-testid="catalog-source-error" className="p-8 border border-brand-red text-brand-red font-mono uppercase">Catalog source error. Picks are unavailable: {error}</div>;

  if (races.length === 0 && measures.length === 0) return <div role="status" data-testid="catalog-unavailable" className="p-8 border border-amber-500 text-amber-300 font-mono uppercase">The certified contest catalog is currently unavailable. No fallback data will be shown.</div>;

  return (
    <div className="space-y-16 pb-12">
      <section className="space-y-8">
        <div className="border-b-4 border-slate-800 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-5xl font-black italic tracking-tighter uppercase text-white">Races</h1>
            <p className="text-xs font-mono uppercase text-slate-500 mt-2">Browse 2026 live contests. Make picks from inside a league.</p>
          </div>
        </div>

        <CatalogFilterControls filters={filters} states={states} onChange={setFilters} onClear={() => setFilters(emptyCatalogFilters())} />

        {filtered.races.length === 0 && filtered.measures.length === 0 && (
          <div role="status" data-testid="catalog-filter-empty" className="p-10 border-2 border-dashed border-slate-800 text-center font-mono text-xs uppercase text-slate-400">
            No contests match these filters. <button type="button" onClick={() => setFilters(emptyCatalogFilters())} className="ml-2 text-brand-red underline">Clear filters</button>
          </div>
        )}

        {filters.kind !== 'measure' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {filtered.races.map((race) => {
            const isClosed = isPickClosed(race);
            const unavailableReason = racePickUnavailableReason(race);
            return (
              <article key={race.id} className="brutalist-card bg-slate-900 group" data-testid={`race-${race.id}`}>
                <div className="bg-brand-dark p-4 flex justify-between items-center border-b border-slate-800">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-mono uppercase bg-brand-red px-2 py-1 text-white font-black">{race.state}</span>
                    <span className="text-xs font-black uppercase tracking-tight text-white">{race.office} {race.district ? `District ${race.district}` : ''}</span>
                  </div>
                  <a href={race.ballotpediaUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-slate-500 hover:text-brand-red flex items-center gap-1 uppercase">
                    Ballotpedia <ExternalLink size={10} />
                  </a>
                </div>

                <div className="p-6 space-y-6">
                  <p className="text-[11px] text-slate-400 font-medium uppercase leading-relaxed border-l-2 border-slate-800 pl-4">{race.summary}</p>
                  <div className="grid grid-cols-1 gap-3">
                    {race.candidates.map((candidate) => (
                      <button
                        type="button"
                        key={candidate.id}
                        aria-label={`Inspect ${candidate.name}`}
                        onClick={() => onSelectCandidate(candidate, race)}
                        className="w-full p-5 flex items-center justify-between border border-slate-800 bg-black/40 hover:border-slate-600 transition-all brutalist-card"
                      >
                        <span className="flex items-center gap-4 text-left">
                          <span className={cn('w-4 h-4 rotate-45', candidate.party === 'Democrat' ? 'bg-blue-600' : candidate.party === 'Republican' ? 'bg-brand-red' : 'bg-slate-400')} />
                          <span>
                            <span className="block font-black text-sm uppercase leading-none text-white">{candidate.name}</span>
                            <span className="block mt-1 text-[9px] font-mono text-slate-500 uppercase">{candidate.party} • Biography</span>
                          </span>
                        </span>
                        <span className="text-[9px] font-mono uppercase text-slate-500">Inspect</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] font-mono uppercase text-slate-500" data-testid={`close-at-${race.id}`}>
                    {isClosed ? 'Picking closed' : 'Pick by'}: {formatCloseAt(race)}
                  </p>
                  <p className="text-[10px] font-mono uppercase text-brand-red" data-testid={`pick-readiness-${race.id}`}>{unavailableReason ?? 'Picks are available inside a league.'}</p>
                </div>
              </article>
            );
          })}
        </div>}
      </section>

      {filters.kind !== 'race' && <section className="space-y-8">
        <div className="border-b-4 border-slate-800 pb-6">
          <h2 className="text-5xl font-black italic tracking-tighter uppercase text-brand-red">Initiatives</h2>
          <p className="text-xs font-mono uppercase text-slate-500 mt-2">State-level legislative contests for league picks.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {filtered.measures.map((measure) => {
            const isClosed = isPickClosed(measure);
            const picksAvailable = measureReady(measure);
            return (
              <article key={measure.id} className="brutalist-card bg-slate-900 overflow-hidden" data-testid={`measure-${measure.id}`}>
                <div className="bg-brand-red text-white p-4 flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                  <span>{measure.state} / Legislative</span>
                  <Clock size={14} />
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-4">
                    <h3 className="font-black uppercase tracking-tight text-xl text-white italic">{measure.title}</h3>
                    <p className="text-xs text-slate-400 font-medium uppercase leading-relaxed border-l-2 border-brand-red pl-4">{measure.description}</p>
                    <p className="text-[10px] font-mono text-slate-500 uppercase" data-testid={`measure-source-${measure.id}`}>{measure.sourceAuthority ?? 'Official source pending'} · {measure.qualificationStatus ?? 'status unavailable'}</p>
                    {(measure.eligibleOptions?.length ?? 0) > 0 && <p className="text-[10px] font-mono text-slate-400 uppercase">Choices: {measure.eligibleOptions!.join(' / ')}</p>}
                    {measure.sourceUrl && <a href={measure.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-white uppercase">Official source <ExternalLink size={10} /></a>}
                  </div>
                  <p className="text-[10px] font-mono uppercase text-slate-500" data-testid={`close-at-${measure.id}`}>
                    {isClosed ? 'Picking closed' : 'Pick by'}: {formatCloseAt(measure)}
                  </p>
                  <p className="text-[10px] font-mono uppercase text-brand-red">{picksAvailable ? 'Picks are available inside a league.' : 'Picks are unavailable because this measure is not prediction-ready.'}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>}
    </div>
  );
}
