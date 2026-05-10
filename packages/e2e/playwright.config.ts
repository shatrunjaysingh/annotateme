import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export const AUTH_FILE = path.join(__dirname, '.auth/user.json');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:4200',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // Setup project: runs global-setup to create auth state
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    // Main test project: depends on setup, uses saved auth
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },
  ],
});
