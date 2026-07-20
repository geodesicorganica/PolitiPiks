import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ActiveCycleBrowserHarness } from './testing/ActiveCycleBrowserHarness.tsx';
import './index.css';

const isBrowserTestHarness = import.meta.env.DEV && new URLSearchParams(window.location.search).get('browser-test') === 'active-cycle';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isBrowserTestHarness ? <ActiveCycleBrowserHarness /> : <App />}
  </StrictMode>,
);
