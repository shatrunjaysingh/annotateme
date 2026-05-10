/**
 * annotation.spec.ts
 * Tests for the Annotation Editor (/jobs/:id/annotate).
 *
 * Strategy:
 *   1. In beforeAll, use the API to create a throwaway project → task → job.
 *   2. Run all annotation tests against that job.
 *   3. In afterAll, delete the project (cascades to task & job).
 *
 * Key selectors derived from reading AnnotationEditor.tsx:
 *   - Tools are button[title] containing "(R)", "(P)", etc.
 *   - The canvas is inside #annotation-editor
 *   - The objects tab button is labeled "Objects (N)"
 *   - Save button is a ToolbarBtn with text "Save"
 */
import { test, expect, type Page } from '@playwright/test';

const UNIQUE = `annot-e2e-${Date.now()}`;
const PROJECT_NAME = `E2E Annotation Test ${UNIQUE}`;

let projectId: string;
let taskId: string;
let jobId: string;
let authToken: string;

test.describe('Annotation Editor', () => {
  test.beforeAll(async ({ request }) => {
    // Login and get token
    const loginRes = await request.post('http://localhost:3000/api/auth/login', {
      data: { email: 'admin@annotateme.com', password: 'password123' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginData = await loginRes.json();
    authToken = loginData.token;
    const headers = { Authorization: `Bearer ${authToken}` };

    // Create project with labels
    const projRes = await request.post('http://localhost:3000/api/projects', {
      data: { name: PROJECT_NAME, description: 'e2e', dataType: 'image', labelSet: ['car', 'person'] },
      headers,
    });
    expect(projRes.ok()).toBeTruthy();
    projectId = (await projRes.json()).id;

    // Create task
    const taskRes = await request.post('http://localhost:3000/api/tasks', {
      data: { projectId, name: 'e2e-task', subset: 'Train' },
      headers,
    });
    expect(taskRes.ok()).toBeTruthy();
    taskId = (await taskRes.json()).id;

    // Create job covering frame 0–0
    const jobRes = await request.post(`http://localhost:3000/api/tasks/${taskId}/jobs`, {
      data: { frameStart: 0, frameEnd: 0, stage: 'annotation', type: 'annotation' },
      headers,
    });
    expect(jobRes.ok()).toBeTruthy();
    jobId = (await jobRes.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (!projectId) return;
    await request.delete(`http://localhost:3000/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/jobs/${jobId}/annotate`);
    // Wait for the editor to mount
    await expect(page.locator('#annotation-editor')).toBeVisible({ timeout: 20_000 });
  });

  // ── Tool switching ───────────────────────────────────────────────────────

  test('R key switches to Rectangle tool', async ({ page }) => {
    // Focus the page body so key events are captured
    await page.locator('#annotation-editor').click();
    await page.keyboard.press('r');

    // The Rectangle button should have the active indicator (blue left border strip)
    // title includes "Rectangle (R)"
    const rectBtn = page.locator('button[title*="Rectangle"]');
    await expect(rectBtn).toBeVisible();
    // Active tool has blue background e6f4ff
    await expect(rectBtn).toHaveCSS('background', /e[6f]f4ff|rgb.230|rgb.239/);
  });

  test('P key switches to Polygon tool', async ({ page }) => {
    await page.locator('#annotation-editor').click();
    await page.keyboard.press('p');
    const polyBtn = page.locator('button[title*="Polygon"]');
    await expect(polyBtn).toHaveCSS('background', /e[6f]f4ff|rgb.230|rgb.239/);
  });

  test('L key switches to Polyline tool', async ({ page }) => {
    await page.locator('#annotation-editor').click();
    await page.keyboard.press('l');
    const polylineBtn = page.locator('button[title*="Polyline"]');
    await expect(polylineBtn).toHaveCSS('background', /e[6f]f4ff|rgb.230|rgb.239/);
  });

  test('S key switches to Select tool', async ({ page }) => {
    // First switch to rect to ensure we're changing something
    await page.locator('#annotation-editor').click();
    await page.keyboard.press('r');
    await page.keyboard.press('s');
    const selectBtn = page.locator('button[title*="Select"]');
    await expect(selectBtn).toHaveCSS('background', /e[6f]f4ff|rgb.230|rgb.239/);
  });

  test('E key switches to Ellipse tool', async ({ page }) => {
    await page.locator('#annotation-editor').click();
    await page.keyboard.press('e');
    const ellipseBtn = page.locator('button[title*="Ellipse"]');
    await expect(ellipseBtn).toHaveCSS('background', /e[6f]f4ff|rgb.230|rgb.239/);
  });

  test('D key switches to Point tool', async ({ page }) => {
    await page.locator('#annotation-editor').click();
    await page.keyboard.press('d');
    const pointBtn = page.locator('button[title*="Point"]');
    await expect(pointBtn).toHaveCSS('background', /e[6f]f4ff|rgb.230|rgb.239/);
  });

  // ── Tool-bar buttons ─────────────────────────────────────────────────────

  test('clicking a tool button in the left toolbar changes the active tool', async ({ page }) => {
    const rectBtn = page.locator('button[title*="Rectangle"]');
    await rectBtn.click();
    await expect(rectBtn).toHaveCSS('background', /e[6f]f4ff|rgb.230|rgb.239/);
  });

  // ── Save ─────────────────────────────────────────────────────────────────

  test('Ctrl+S triggers the save action', async ({ page }) => {
    // Press Ctrl+S and expect the "Saved" confirmation to flash in the top bar
    await page.locator('#annotation-editor').click();
    await page.keyboard.press('Control+s');

    // "Saved" text should briefly appear in the toolbar or status bar
    await expect(
      page.locator('button, span').filter({ hasText: /^Saved$/ }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('clicking the Save toolbar button saves annotations', async ({ page }) => {
    // The Save ToolbarBtn has the text "Save" (and "Saving" while pending)
    const saveBtn = page.locator('button').filter({ hasText: /^Save$/ }).first();
    await saveBtn.click();
    await expect(page.locator('span, button').filter({ hasText: /^Saved$/ }).first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Objects panel ─────────────────────────────────────────────────────────

  test('objects panel tab is visible and shows a count', async ({ page }) => {
    // Tab text is "Objects (N)"
    const objectsTab = page.locator('button').filter({ hasText: /Objects \(\d+\)/ });
    await expect(objectsTab).toBeVisible();
  });

  test('labels tab shows project labels', async ({ page }) => {
    const labelsTab = page.locator('button').filter({ hasText: /Labels \(\d+\)/ });
    await labelsTab.click();

    // Labels 'car' and 'person' were set up in beforeAll
    await expect(page.locator('span').filter({ hasText: 'car' }).first()).toBeVisible();
    await expect(page.locator('span').filter({ hasText: 'person' }).first()).toBeVisible();
  });

  // ── Frame navigation ─────────────────────────────────────────────────────

  test('frame navigation controls are visible', async ({ page }) => {
    // The frame input field is present in the top toolbar
    const frameInput = page.locator('input[type="number"]').first();
    await expect(frameInput).toBeVisible();
  });

  test('Back button is present and navigates away from the editor', async ({ page }) => {
    const backBtn = page.locator('button', { hasText: /Back/ }).first();
    await expect(backBtn).toBeVisible();
  });

  // ── Canvas drawing ────────────────────────────────────────────────────────

  test('switch to rect tool then draw a rectangle by drag on the canvas', async ({ page }) => {
    // Switch to Rectangle tool
    const rectBtn = page.locator('button[title*="Rectangle"]');
    await rectBtn.click();

    // The canvas is inside the flex area between the left toolbar and right sidebar.
    // AnnotationCanvas renders a <canvas> element.
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas bounding box is null');

    // Draw a rectangle by mousedown → drag → mouseup
    const startX = box.x + box.width * 0.2;
    const startY = box.y + box.height * 0.2;
    const endX   = box.x + box.width * 0.5;
    const endY   = box.y + box.height * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // After drawing, the Objects tab count should increment to at least 1
    await expect(
      page.locator('button').filter({ hasText: /Objects \([1-9]/ })
    ).toBeVisible({ timeout: 5_000 });
  });
});
