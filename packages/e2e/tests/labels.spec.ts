/**
 * labels.spec.ts
 * Tests for label management within a project.
 * - Add a label via the "Add label" button on the ProjectDetail page
 * - Verify the label chip appears
 * - Delete the label
 *
 * Strategy: create a disposable project at the start of the describe block,
 * run all label tests against it, then clean up.
 */
import { test, expect, request } from '@playwright/test';

const UNIQUE = `label-e2e-${Date.now()}`;
const PROJECT_NAME = `E2E Label Test ${UNIQUE}`;
const LABEL_NAME = `e2e-label-${UNIQUE}`;

let projectId: string | null = null;

test.describe('Labels', () => {
  // Create a disposable project once for the whole describe block
  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post('http://localhost:3000/api/auth/login', {
      data: { email: 'admin@annotateme.com', password: 'password123' },
    });
    const { token } = await loginRes.json();

    const createRes = await request.post('http://localhost:3000/api/projects', {
      data: { name: PROJECT_NAME, description: 'e2e label tests', dataType: 'image', labelSet: [] },
      headers: { Authorization: `Bearer ${token}` },
    });
    const project = await createRes.json();
    projectId = project.id;
  });

  // Clean up the disposable project after all label tests
  test.afterAll(async ({ request }) => {
    if (!projectId) return;
    const loginRes = await request.post('http://localhost:3000/api/auth/login', {
      data: { email: 'admin@annotateme.com', password: 'password123' },
    });
    const { token } = await loginRes.json();
    await request.delete(`http://localhost:3000/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test.beforeEach(async ({ page }) => {
    if (!projectId) throw new Error('Test project was not created in beforeAll');
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
  });

  test('project detail page renders the label constructor section', async ({ page }) => {
    // Constructor tab should be active by default
    await expect(page.getByRole('button', { name: /Add label/i })).toBeVisible();
  });

  test('add a label and verify it appears as a chip', async ({ page }) => {
    // Click "Add label" to open the label creation modal
    await page.getByRole('button', { name: /Add label/i }).click();

    // The modal should open
    await expect(page.getByRole('heading', { name: 'Add Label' })).toBeVisible();

    // Fill the label name (the autoFocused input with placeholder "e.g. car, person...")
    await page.getByPlaceholder(/e\.g\. car, person/i).fill(LABEL_NAME);

    // Submit
    await page.getByRole('button', { name: /^Add$/i }).click();

    // Modal closes
    await expect(page.getByRole('heading', { name: 'Add Label' })).not.toBeVisible({ timeout: 10_000 });

    // The new label chip should appear in the constructor area
    await expect(page.locator('span').filter({ hasText: LABEL_NAME }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('delete a label via the ✕ button on the chip', async ({ page }) => {
    // Ensure the label exists first (add it if not present from prior test)
    const labelChip = page.locator('span').filter({ hasText: LABEL_NAME }).first();
    const exists = await labelChip.isVisible().catch(() => false);
    if (!exists) {
      await page.getByRole('button', { name: /Add label/i }).click();
      await expect(page.getByRole('heading', { name: 'Add Label' })).toBeVisible();
      await page.getByPlaceholder(/e\.g\. car, person/i).fill(LABEL_NAME);
      await page.getByRole('button', { name: /^Add$/i }).click();
      await expect(page.getByRole('heading', { name: 'Add Label' })).not.toBeVisible({ timeout: 10_000 });
      await expect(page.locator('span').filter({ hasText: LABEL_NAME }).first()).toBeVisible({ timeout: 10_000 });
    }

    // Find the ✕ button inside the label chip and click it
    const chipContainer = page.locator('span').filter({ hasText: LABEL_NAME }).first();
    await chipContainer.locator('button[title="Delete"]').click();

    // ConfirmDialog (React modal) replaces window.confirm() — click the confirm button
    await page.getByRole('button', { name: /Delete label/i }).click();

    // Wait for chip to disappear
    await expect(page.locator('span').filter({ hasText: LABEL_NAME })).toHaveCount(0, { timeout: 10_000 });
  });

  test('raw tab shows JSON representation of labels', async ({ page }) => {
    // Click the "Raw" tab
    await page.getByRole('button', { name: /^Raw$/i }).click();
    // The raw content section renders either JSON (when labels exist) or "No labels defined"
    const rawContent = page.locator('div').filter({ hasText: /No labels defined|\[|\{/ }).last();
    await expect(rawContent).toBeVisible();
  });
});
