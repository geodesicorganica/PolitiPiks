import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  webServer: { command: 'set PORT=3100&& set DISABLE_HMR=true&& npm run dev', url: 'http://127.0.0.1:3100', reuseExistingServer: false },
  use: { baseURL: 'http://127.0.0.1:3100' },
});
