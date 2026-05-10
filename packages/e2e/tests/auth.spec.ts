/**
 * auth.spec.ts
 * Tests for login / logout flows.
 *
 * NOTE: These tests intentionally do NOT use the saved storage state because
 * they need to exercise the unauthenticated login page.  They each start from
 * a clean context (no storageState) which is achieved by overriding the
 * project-level storageState in the test itself.
 */
import { test, expect } from '@playwright/test';

// Clear auth state for every test in this file so we always start logged-out.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('login with correct credentials navigates to projects', async ({ page }) => {
    await page.goto('/login');

    // Verify the login form elements
    await expect(page.getByText('AnnotateMe')).toBeVisible();
    await expect(page.getByText('Professional Data Annotation Platform')).toBeVisible();

    await page.getByPlaceholder('Enter your email').fill('admin@annotateme.com');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Should redirect to /projects after login
    await page.waitForURL('**/projects', { timeout: 15_000 });
    // Navbar should show the app name and user initial
    await expect(page.getByText('AnnotateMe').first()).toBeVisible();
  });

  test('login with wrong password shows an error message', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('Enter your email').fill('admin@annotateme.com');
    await page.getByPlaceholder('Enter your password').fill('wrong-password');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Error banner should appear; we should stay on /login
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });

  test('login with unknown email shows error', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('Enter your email').fill('nonexistent@nowhere.com');
    await page.getByPlaceholder('Enter your password').fill('anypassword');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page.locator('[data-testid="login-error"]')).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });

  test('logout returns user to login page', async ({ page, context }) => {
    // First log in properly
    await page.goto('/login');
    await page.getByPlaceholder('Enter your email').fill('admin@annotateme.com');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await page.waitForURL('**/projects', { timeout: 15_000 });

    // Open user dropdown (top-right corner — shows user initial/name)
    // The Navbar has a button showing the user avatar letter
    const userBtn = page.locator('nav button').filter({ hasText: /admin|A/i }).last();
    await userBtn.click();

    // Click Logout
    await page.getByRole('button', { name: /Sign out/i }).click();

    // Should be back on /login
    await page.waitForURL('**/login', { timeout: 10_000 });
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
  });

  test('unauthenticated access to /projects redirects to /login', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForURL('**/login', { timeout: 10_000 });
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
  });
});
