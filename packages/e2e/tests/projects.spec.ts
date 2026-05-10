/**
 * projects.spec.ts
 * Tests for the Projects list page (/projects).
 * - View list of projects
 * - Create a new project and verify it appears
 * - Delete a project via the context menu confirm dialog
 */
import { test, expect } from '@playwright/test';

// Unique suffix to isolate test-created data from real data
const UNIQUE_SUFFIX = `e2e-${Date.now()}`;
const TEST_PROJECT_NAME = `E2E Test Project ${UNIQUE_SUFFIX}`;

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
  });

  test('projects page loads and displays the page header / toolbar', async ({ page }) => {
    // Page header h1
    await expect(page.getByRole('heading', { name: /Projects/i })).toBeVisible();
    // Search bar (placeholder uses ellipsis character)
    await expect(page.getByPlaceholder(/Search projects/i)).toBeVisible();
    // New Project button
    await expect(page.getByRole('button', { name: /New Project/i })).toBeVisible();
  });

  test('project list shows at least one project or empty state', async ({ page }) => {
    const hasProjects = await page.locator('.card').count();
    if (hasProjects === 0) {
      await expect(page.getByText(/No projects/i)).toBeVisible();
    } else {
      expect(hasProjects).toBeGreaterThan(0);
    }
  });

  test('can search / filter the projects list', async ({ page }) => {
    const search = page.getByPlaceholder(/Search projects/i);
    await search.fill('zzz_definitely_no_match_xyz_abc');
    await page.waitForTimeout(300);
    const cardCount = await page.locator('.card').count();
    if (cardCount === 0) {
      await expect(page.getByText(/No projects match your filters/i)).toBeVisible();
    }
    await search.clear();
  });

  test('create project modal opens and closes', async ({ page }) => {
    await page.getByRole('button', { name: /New Project/i }).click();

    await expect(page.getByText('Create New Project')).toBeVisible();

    await page.getByRole('button', { name: /Cancel/i }).click();
    await expect(page.getByText('Create New Project')).not.toBeVisible();
  });

  test('create a new project, verify it appears in the list, then delete it', async ({ page }) => {
    // ── Open the create dialog ──────────────────────────────────────────
    await page.getByRole('button', { name: /New Project/i }).click();
    await expect(page.getByText('Create New Project')).toBeVisible();

    // ── Fill the form ───────────────────────────────────────────────────
    await page.getByPlaceholder(/Object Detection Dataset/i).fill(TEST_PROJECT_NAME);
    await page.getByPlaceholder(/Optional project description/i).fill('Created by Playwright e2e test');
    await page.getByPlaceholder(/car, person/i).fill('cat, dog');

    // ── Submit ──────────────────────────────────────────────────────────
    await page.getByRole('button', { name: /^Create Project$/i }).click();

    await expect(page.getByText('Create New Project')).not.toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState('networkidle');

    // Search for the newly created project
    const search = page.getByPlaceholder(/Search projects/i);
    await search.fill(TEST_PROJECT_NAME);
    await page.waitForTimeout(300);

    const projectCard = page.locator('.card').filter({ hasText: TEST_PROJECT_NAME });
    await expect(projectCard).toBeVisible({ timeout: 15_000 });

    // ── Delete the test project ─────────────────────────────────────────
    // Open the ⋮ context menu on the card (button with aria-label="Project options")
    const menuBtn = projectCard.locator('button[aria-label="Project options"]');
    await menuBtn.click();

    // Click Delete in the dropdown
    await page.getByRole('button', { name: /Delete project/i }).last().click();

    // ConfirmDialog (React modal) replaces window.confirm() — click the confirm button
    await page.getByRole('button', { name: /Delete project/i }).click();

    await page.waitForTimeout(1000);

    // After deletion the card should be gone
    await search.fill(TEST_PROJECT_NAME);
    await page.waitForTimeout(500);
    await expect(page.locator('.card').filter({ hasText: TEST_PROJECT_NAME })).toHaveCount(0, { timeout: 10_000 });
  });
});
