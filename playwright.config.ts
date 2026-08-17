import { defineConfig } from '@playwright/test';

/**
 * Boots the Vite dev server and points Playwright at it. Reuses an existing
 * server locally so `npm run dev` in one terminal + `npm run e2e` in another
 * works without a port collision.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
