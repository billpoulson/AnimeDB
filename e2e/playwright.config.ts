import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'cd ../frontend && npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
