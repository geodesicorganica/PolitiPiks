import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ActiveCycleBrowserHarness } from './testing/ActiveCycleBrowserHarness.tsx';
import { LocalLeagueWorkflowHarness } from './testing/LocalLeagueWorkflowHarness.tsx';
import './index.css';

const browserTest = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('browser-test') : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {browserTest === 'active-cycle' ? <ActiveCycleBrowserHarness /> : browserTest === 'league-workflow' ? <LocalLeagueWorkflowHarness /> : <App />}
  </StrictMode>,
);
