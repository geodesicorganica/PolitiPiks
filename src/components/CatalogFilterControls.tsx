import type { CatalogFilters } from '../lib/catalogFilters';

export function CatalogFilterControls({ filters, states, onChange, onClear }: {
  filters: CatalogFilters;
  states: string[];
  onChange: (filters: CatalogFilters) => void;
  onClear: () => void;
}) {
  const selectClass = 'min-h-11 w-full bg-black border border-slate-700 px-3 py-2 text-xs font-mono uppercase text-white focus:outline-none focus:border-brand-red';
  return (
    <fieldset className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 border border-slate-800 bg-slate-900/60 p-4" aria-label="Catalog filters">
      <legend className="sr-only">Filter the contest catalog</legend>
      <label className="text-[10px] font-mono uppercase text-slate-400">State
        <select aria-label="State" className={selectClass} value={filters.state} onChange={(event) => onChange({ ...filters, state: event.target.value })}>
          <option value="">All states</option>
          {states.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
      </label>
      <label className="text-[10px] font-mono uppercase text-slate-400">Office / contest
        <select aria-label="Office or contest type" className={selectClass} value={filters.office} onChange={(event) => onChange({ ...filters, office: event.target.value as CatalogFilters['office'] })}>
          <option value="all">All offices</option><option value="Senate">Senate</option><option value="House">House</option><option value="Governor">Governor</option><option value="President">President</option><option value="Measure">Ballot measure</option>
        </select>
      </label>
      <label className="text-[10px] font-mono uppercase text-slate-400">Catalog type
        <select aria-label="Race or measure" className={selectClass} value={filters.kind} onChange={(event) => onChange({ ...filters, kind: event.target.value as CatalogFilters['kind'] })}>
          <option value="all">Races and measures</option><option value="race">Races only</option><option value="measure">Measures only</option>
        </select>
      </label>
      <label className="text-[10px] font-mono uppercase text-slate-400">Prediction readiness
        <select aria-label="Prediction readiness" className={selectClass} value={filters.readiness} onChange={(event) => onChange({ ...filters, readiness: event.target.value as CatalogFilters['readiness'] })}>
          <option value="all">All readiness</option><option value="ready">Prediction-ready</option><option value="unavailable">Picks unavailable</option>
        </select>
      </label>
      <button type="button" onClick={onClear} className="min-h-11 self-end border border-slate-700 px-4 py-2 text-xs font-black uppercase text-slate-300 hover:border-brand-red hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-red">Clear filters</button>
    </fieldset>
  );
}
