import { test, expect } from '@playwright/test';

test('place, drag, connect, encoding surface a validation the user can click to fix', async ({ page }) => {
  await page.goto('/');

  // ---- Place two elements via click-to-arm then click on canvas.
  const canvas = page.locator('.canvas-svg');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('canvas not laid out');

  const paletteMd = page.locator('.palette-btn[data-add="element:md"]');
  await expect(paletteMd).toBeVisible();

  await paletteMd.click();
  await page.mouse.click(canvasBox.x + 200, canvasBox.y + 150);

  await paletteMd.click();
  await page.mouse.click(canvasBox.x + 500, canvasBox.y + 400);

  const items = page.locator('.canvas-svg [data-item-id]');
  await expect(items).toHaveCount(2);

  // ---- Drag the first item and assert it moved.
  const first = items.first();
  const before = await first.boundingBox();
  if (!before) throw new Error('first item bbox missing');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 30);
  await page.mouse.up();
  const after = await first.boundingBox();
  if (!after) throw new Error('first item bbox missing after drag');
  expect(after.x - before.x).toBeGreaterThan(30);

  // ---- Switch to connect mode and connect the two items.
  const connectBtn = page.locator('button[data-mode="connect"]');
  await connectBtn.click();
  await expect(connectBtn).toHaveClass(/active/);

  // First click sets pending; toast announces the next step (aria-live=polite).
  await items.first().click();
  await expect(page.locator('#toast-slot .toast')).toContainText(/target/i);

  // Second click on the second item creates the connector.
  await items.nth(1).click();
  await expect(items).toHaveCount(3);

  // Back to select mode for downstream interactions.
  await page.locator('button[data-mode="select"]').click();

  // ---- Switch encoding to State → validation panel surfaces the missing legend.
  await page.locator('.tb-encoding').selectOption('state');
  const violations = page.locator('.violations-list .violation');
  await expect(violations).toHaveCount(1);
  await expect(violations.first()).toContainText(/legend/i);

  // ---- Click the "Add legend" fix — panel clears.
  await page.locator('.violation-fix', { hasText: /Add legend/i }).click();
  await expect(violations).toHaveCount(0);

  // The legend is a new item on canvas.
  await expect(items).toHaveCount(4);
});
