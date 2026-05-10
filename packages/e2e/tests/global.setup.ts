/**
 * global.setup.ts
 * Runs once before all tests.
 * Logs in as admin and saves the browser storage state so all tests
 * start already authenticated — avoiding repeated login round-trips.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '../.auth/user.json');

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');

  // Wait for the login form to be ready
  await expect(page.getByPlaceholder('Enter your email')).toBeVisible();

  await page.getByPlaceholder('Enter your email').fill('admin@annotateme.com');
  await page.getByPlaceholder('Enter your password').fill('password123');
  await page.getByRole('button', { name: /Sign In/i }).click();

  // Successful login navigates to /projects
  await page.waitForURL('**/projects', { timeout: 15_000 });
  await expect(page.getByText('AnnotateMe')).toBeVisible();

  // Persist the authenticated state
  await page.context().storageState({ path: AUTH_FILE });
});
