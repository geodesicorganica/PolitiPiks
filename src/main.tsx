import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ActiveCycleBrowserHarness } from './testing/ActiveCycleBrowserHarness.tsx';
import { LocalLeagueWorkflowHarness } from './testing/LocalLeagueWorkflowHarness.tsx';
import { EaProfileBrowserHarness } from './testing/EaProfileBrowserHarness.tsx';
import './index.css';

const DemoCatalog = lazy(() => import('./pages/DemoCatalog'));
const isDemo = window.location.pathname.replace(/\/$/, '') === '/demo';
const browserTest = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('browser-test') : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDemo ? <Suspense fallback={<p>Loading research demo…</p>}><DemoCatalog /></Suspense> : browserTest === 'active-cycle' ? <ActiveCycleBrowserHarness /> : browserTest === 'league-workflow' ? <LocalLeagueWorkflowHarness /> : browserTest === 'ea-profile' ? <EaProfileBrowserHarness /> : <><a href="/demo" className="block bg-amber-200 text-slate-950 text-center text-sm font-bold px-4 py-3">Explore the partial research demo: candidates, race details & ballot measures →</a><App /></>}
  </StrictMode>,
);
