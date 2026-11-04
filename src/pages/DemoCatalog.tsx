import { useEffect, useState } from 'react';
import { ReviewedProfile } from '../components/ReviewedProfile';
import { safeSourceUrl } from '../lib/reviewedProfile';

type Source = { url: string; authority: string };
type Candidate = { id: string; name: string; party: string; note?: string; profile?: unknown };
type Contest = { id: string; state: string; office: string; title: string; description?: string; reviewStatus: string; candidates: Candidate[]; sources: Source[]; eligibleOptions?: string[]; fullTextUrl?: string; metrics?: unknown; research?: unknown };
type Catalog = { notice: string; snapshotAsOf: string; contests: Contest[] };
const STATES: Record<string, string> = { CA: 'California', CO: 'Colorado', FL: 'Florida', WA: 'Washington' };
const METRICS = { historical: 'Election history', turnout: 'Turnout context', demographics: 'District demographics' };
function Sources({ sources }: { sources: Source[] }) { return <div className="flex flex-wrap gap-3 text-xs text-sky-300 mt-4">{sources.filter(s => safeSourceUrl(s.url)).map((s, i) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.authority} ↗</a>)}</div>; }
export default function DemoCatalog() {
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState('CA');
  const [office, setOffice] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(new URLSearchParams(location.search).get('contest'));
  const [candidateId, setCandidateId] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); fetch('/demo/catalog.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('The demo catalog could not be loaded.'); return r.json(); }).then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); }); return () => controller.abort(); }, []);
  const contest = data?.contests.find(c => c.id === selected);
  const candidate = contest?.candidates.find(c => c.id === candidateId);
  const filtered = data?.contests.filter(c => (state === 'All' || c.state === state) && (office === 'All' || c.office === office) && (c.title+' '+c.candidates.map(a => a.name+' '+a.party).join(' ')).toLowerCase().includes(query.toLowerCase())) ?? [];
  function openContest(c: Contest) { setSelected(c.id); setCandidateId(null); history.replaceState(null, '', '/demo?contest='+encodeURIComponent(c.id)); window.scrollTo(0, 0); }
  function back() { setSelected(null); setCandidateId(null); history.replaceState(null, '', '/demo'); }
  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="border-b border-slate-800 px-5 py-5 flex flex-wrap gap-4 justify-between items-center"><a href="/demo" className="font-black text-2xl tracking-tight">POLITIPIKS <span className="text-red-400">/ RESEARCH</span></a><a href="/" className="text-sm underline text-slate-300">Back to live app</a></header>
    <main className="max-w-7xl mx-auto px-5 py-8">
      <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-100 mb-8"><strong>PARTIAL DEMO · Published November 3, 2026.</strong> {data?.notice ?? 'Research snapshot, with no live picks.'}</div>
      {error && <p role="alert">{error} <button className="underline" onClick={() => location.reload()}>Retry</button></p>}
      {!data && !error && <p role="status">Loading candidate and ballot research…</p>}
      {data && !contest && <>
        <p className="uppercase tracking-widest text-xs text-slate-400">Explore the work so far</p><h1 className="text-4xl sm:text-5xl font-bold mt-3 mb-4">The ballot. The people. The context.</h1><p className="text-slate-400 max-w-3xl">California has detailed candidate profiles and race context. Colorado, Washington and Florida add staged inventories with review gaps shown on each record. Other states are not yet included.</p>
        <div className="grid grid-cols-3 gap-3 my-7">{[[data.contests.filter(c => c.office !== 'Measure').length, 'Candidate races'], [data.contests.reduce((n,c) => n+c.candidates.length,0), 'Candidate entries'], [data.contests.filter(c => c.office === 'Measure').length, 'Ballot measures']].map(([n,label]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="text-3xl font-bold">{n}</div><div className="text-xs text-slate-400 mt-1">{label}</div></div>)}</div>
        <div className="grid sm:grid-cols-[1fr_180px_180px] gap-3 mb-6"><label className="text-sm text-slate-400">Search<input aria-label="Search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Candidate, party or measure" className="mt-2 w-full p-3 rounded-lg bg-slate-900 border border-slate-700 text-white" /></label><label className="text-sm text-slate-400">State<select aria-label="State" value={state} onChange={e => setState(e.target.value)} className="mt-2 w-full p-3 rounded-lg bg-slate-900 border border-slate-700 text-white"><option value="All">All states</option>{Object.entries(STATES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="text-sm text-slate-400">Office<select aria-label="Office" value={office} onChange={e => setOffice(e.target.value)} className="mt-2 w-full p-3 rounded-lg bg-slate-900 border border-slate-700 text-white">{['All','Governor','Senate','House','Measure'].map(o => <option key={o}>{o}</option>)}</select></label></div>
        <p className="text-sm text-slate-400 mb-4" role="status">{filtered.length} records shown</p><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{filtered.map(c => <button key={c.id} onClick={() => openContest(c)} className="text-left flex flex-col p-5 rounded-xl border border-slate-800 bg-slate-900 hover:border-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"><span className="text-xs text-red-300 uppercase tracking-widest">{STATES[c.state]} · {c.office}</span><h2 className="font-bold text-xl mt-3 mb-3">{c.title}</h2><p className="text-sm text-slate-300">{c.office === 'Measure' ? c.description?.slice(0,160) : c.candidates.map(a => a.name).join(' · ')}</p><p className="text-xs text-amber-200/80 mt-4 pt-3 border-t border-slate-800">{c.reviewStatus}</p><span className="text-sm text-sky-300 mt-4">Explore details →</span></button>)}</div>{!filtered.length && <p className="p-8 text-center text-slate-400">No records match. Try another state, office or search.</p>}
      </>}
      {contest && <>
        <button onClick={back} className="underline text-sky-300 mb-6">← All contests</button><p className="uppercase text-sm tracking-widest text-red-300">{STATES[contest.state]} · {contest.office}</p><h1 className="text-3xl sm:text-4xl font-bold my-3">{contest.title}</h1><p className="text-sm text-amber-200">{contest.reviewStatus}</p><Sources sources={contest.sources}/>
        {contest.description && <section className="my-7 rounded-xl bg-slate-900 p-6"><h2 className="font-bold text-xl mb-3">Ballot language / summary</h2><p className="whitespace-pre-line leading-relaxed">{contest.description}</p>{contest.eligibleOptions && <p className="mt-5 text-slate-300">Published choices: <strong>{contest.eligibleOptions.join(' / ')}</strong></p>}{safeSourceUrl(contest.fullTextUrl) && <a href={contest.fullTextUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-4 text-sky-300 underline">Read the full proposed law ↗</a>}</section>}
        {contest.office === 'Measure' && !contest.eligibleOptions?.length && <p className="my-6 text-slate-400">Exact choices have not yet been reviewed.</p>}
        {!!contest.candidates.length && <><h2 className="text-xl font-bold mt-8 mb-4">Candidates</h2><div className="flex flex-wrap gap-3">{contest.candidates.map(c => <button key={c.id} aria-pressed={candidateId === c.id} onClick={() => setCandidateId(c.id)} className={'text-left rounded-xl border p-4 '+(candidateId===c.id?'bg-red-950 border-red-400':'bg-slate-900 border-slate-700 hover:border-slate-400')}><strong className="block">{c.name}</strong><span className="text-sm text-slate-400">{c.party}</span>{c.note && <span className="block text-xs mt-2 text-amber-200">{c.note}</span>}</button>)}</div>{!candidate && <p className="mt-5 text-slate-400">Select a candidate to explore their available profile.</p>}</>}
        {candidate && <section className="mt-8"><h2 className="text-2xl font-bold mb-5">{candidate.name}</h2>{candidate.profile ? <ReviewedProfile value={candidate.profile}/> : <p className="rounded-xl border border-slate-700 p-6 text-slate-400">Biography, positions, finance and service have not yet been reviewed for this candidate. Their inventory entry is shown above.</p>}</section>}
        {contest.metrics && <section className="mt-8"><h2 className="text-2xl font-bold mb-5">Race context</h2><ReviewedProfile value={contest.metrics} labels={METRICS}/></section>}
        {contest.research && <section className="mt-8"><ReviewedProfile value={contest.research} labels={{fiscalAnalysis:'Fiscal analysis'}}/></section>}
      </>}
      <footer className="mt-12 pt-6 border-t border-slate-800 text-xs text-slate-500">Research snapshot · Coverage is incomplete. Source dates and uncertainty are preserved. Demo browsing does not place predictions or change your leagues.</footer>
    </main>
  </div>;
}
