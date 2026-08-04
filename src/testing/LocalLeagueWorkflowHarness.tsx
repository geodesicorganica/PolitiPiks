import { useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { CatalogFilterControls } from '../components/CatalogFilterControls';
import { applyCatalogFilters, emptyCatalogFilters } from '../lib/catalogFilters';
import { isPickClosed } from '../lib/electionCycle';
import type { BallotMeasure, Race } from '../types';

const certifiedMeasures = [
  ['2026-CA-proposition-1', 'Elections: recall of state officers'],
  ['2026-CA-proposition-2', 'California Fair Elections Act of 2026'],
  ['2026-CA-proposition-3', "Save for California's Future Act"],
  ['2026-CA-proposition-4', 'Veterans and Affordable Housing Bond Act of 2026'],
  ['2026-CA-proposition-5', 'Local taxes: limitation'],
  ['2026-CA-proposition-37', 'Middle-income home buyer loan program'],
  ['2026-CA-proposition-38', 'Voter identification requirements'],
  ['2026-CA-proposition-39', 'Community health clinic spending'],
  ['2026-CA-proposition-40', 'School and healthcare funding'],
  ['2026-CA-proposition-41', 'Environmental review changes'],
  ['2026-CA-proposition-42', 'One-time tax'],
  ['2026-CA-proposition-43', 'Special-tax program audits'],
  ['2026-CA-proposition-44', 'Immunology research bonds'],
  ['2026-CA-proposition-45', 'Personal property tax prohibition'],
] as const;

const openCloseAt = Timestamp.fromDate(new Date('2026-11-03T20:00:00Z'));
const measures: BallotMeasure[] = certifiedMeasures.map(([id, title]) => ({
  id, state: 'CA', title, description: 'Certified California statewide measure.', status: 'upcoming', closeAt: openCloseAt,
  closeDate: '2026-11-03T20:00:00Z', electionYear: 2026, mode: 'live', qualificationStatus: 'on_ballot',
  sourceAuthority: 'California Secretary of State', predictionReady: true, eligibleOptions: ['no', 'yes'],
}));
const races: Race[] = [{
  id: '2026-CA-senate-class-1', state: 'CA', office: 'Senate', candidates: [{ id: 'fec-filed-only', name: 'Filed Candidate', party: 'Democrat', qualificationStatus: 'filed', pickEligibility: 'ineligible' }],
  eligibleCandidateIds: [], predictionReady: false, catalogScope: 'federal', registryGeneration: 'canonical-2026-shadow-v2', status: 'upcoming', closeAt: openCloseAt,
  closeDate: '2026-11-03T20:00:00Z', electionYear: 2026, mode: 'live',
}];

export function LocalLeagueWorkflowHarness() {
  const [leagueName, setLeagueName] = useState('');
  const [created, setCreated] = useState(false);
  const [invite, setInvite] = useState('');
  const [joined, setJoined] = useState(false);
  const [filters, setFilters] = useState(emptyCatalogFilters);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const filtered = useMemo(() => applyCatalogFilters(races, measures, filters), [filters]);

  return <main className="min-h-screen bg-brand-dark text-white p-4 sm:p-8 space-y-6">
    <h1 className="text-3xl font-black uppercase">Local league workflow</h1>
    {!created && <form onSubmit={(event) => { event.preventDefault(); if (leagueName.trim()) setCreated(true); }} className="flex flex-col sm:flex-row gap-3">
      <label className="flex-1">League name<input aria-label="League name" value={leagueName} onChange={(event) => setLeagueName(event.target.value)} className="block w-full bg-black border p-3" /></label>
      <button type="submit" className="min-h-11 bg-brand-red px-5 font-black uppercase">Create league</button>
    </form>}
    {created && !joined && <section className="space-y-3"><p role="status">League created. Invite code: <strong>G72CA</strong></p>
      <label>Invite code<input aria-label="Invite code" value={invite} onChange={(event) => setInvite(event.target.value.toUpperCase())} className="block w-full max-w-sm bg-black border p-3" /></label>
      <button type="button" onClick={() => setJoined(invite === 'G72CA')} className="min-h-11 bg-brand-blue px-5 font-black uppercase">Join league</button>
    </section>}
    {joined && <section className="space-y-5" aria-label="Certified contest catalog">
      <p role="status">League joined. Browse the certified catalog and make a pick.</p>
      <CatalogFilterControls filters={filters} states={['CA']} onChange={setFilters} onClear={() => setFilters(emptyCatalogFilters())} />
      <p data-testid="catalog-result-count">{filtered.races.length + filtered.measures.length} results</p>
      {filtered.races.length + filtered.measures.length === 0 && <p role="status">No contests match these filters. <button type="button" onClick={() => setFilters(emptyCatalogFilters())}>Clear filters</button></p>}
      {filtered.races.map((race) => <article key={race.id} data-testid={`workflow-race-${race.id}`} className="border border-slate-700 p-4"><h2>{race.office}</h2><p>Picks are unavailable until an official candidate allowlist is certified.</p><button disabled>Pick unavailable</button></article>)}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.measures.map((measure) => <article key={measure.id} data-testid={`workflow-measure-${measure.id}`} className="border border-slate-700 p-4 space-y-3"><h2>{measure.title}</h2><p>{measure.sourceAuthority}</p><div className="flex gap-2">{measure.eligibleOptions?.map((option) => <button key={option} type="button" disabled={isPickClosed(measure)} onClick={() => setPicks((current) => ({ ...current, [measure.id]: option }))} className="min-h-11 border px-4 uppercase">{picks[measure.id] === option ? `${option} selected` : `Pick ${option}`}</button>)}</div>{picks[measure.id] && <p role="status">Saved pick: {picks[measure.id]}</p>}</article>)}
      </div>
    </section>}
  </main>;
}
