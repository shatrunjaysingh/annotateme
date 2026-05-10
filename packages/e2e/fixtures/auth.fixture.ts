/**
 * auth.fixture.ts
 * Extends the base Playwright test with an `authedPage` fixture that
 * provides a page already loaded with the authenticated storage state.
 * Tests that need a fresh authenticated page can use `authedPage` instead
 * of the regular `page`.
 */
import { test as base, type Page } from '@playwright/test';

type AuthFixtures = {
  /** A page that starts with the admin user already logged in */
  authedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    // The storageState is already applied by the playwright.config.ts project
    // setting.  Just navigate to the app root to confirm auth is loaded.
    await page.goto('/projects');
    await use(page);
  },
});

export { expect } from '@playwright/test';
