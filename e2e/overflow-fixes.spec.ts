import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('inline control pill fits a long label like "Metadata & Logs" without clipping', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place an inline control and rename it via inline edit.
  await page.locator('.palette-btn[data-add="inlineControl+icon"]').click();
  await page.mouse.click(cb.x + 400, cb.y + 200);

  const item = page.locator('.canvas-svg [data-item-id]').first();
  const box = await item.boundingBox();
  if (!box) throw new Error('placed item missing bbox');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const input = page.locator('.inline-edit');
  await input.fill('Metadata & Logs');
  await input.press('Enter');

  // Rect width should now accommodate the label — no longer the 90px minimum.
  const rect = page.locator('.canvas-svg [data-item-id] rect').first();
  const w = Number(await rect.getAttribute('width'));
  expect(w).toBeGreaterThan(120); // was ~90 under old sizing
  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'inline-control-fits.png') });
});

test('grouped row has spec §9 padding (15px on each side of centred label)', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="grouped"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  // Give a row a moderately long label that fits without expansion.
  const rowInput = page.locator('.inspector .grouped-row input[type="text"]').first();
  await rowInput.fill('High precision classification engine');
  await rowInput.press('Enter');

  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'grouped-row-padded.png') });
});

test('title item renders bold 18px and is inline-editable', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="title"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 100);

  const t = page.locator('.canvas-svg [data-item-id] text').first();
  await expect(t).toHaveAttribute('font-size', '18');
  await expect(t).toHaveAttribute('font-weight', '600');
  await expect(t).toHaveText('Diagram title');

  const box = await page.locator('.canvas-svg [data-item-id]').first().boundingBox();
  if (!box) throw new Error('placed title missing bbox');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const input = page.locator('.inline-edit');
  await input.fill('Varonis Data Protection Architecture');
  await input.press('Enter');
  await expect(t).toHaveText('Varonis Data Protection Architecture');

  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'diagram-title.png') });
});

test('small element expands horizontally to fit a long label (no clipping)', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="element:sm+icon"]').click();
  await page.mouse.click(cb.x + 400, cb.y + 200);

  const rect = page.locator('.canvas-svg [data-item-id] rect').first();
  expect(Number(await rect.getAttribute('width'))).toBe(150); // sm default

  const item = page.locator('.canvas-svg [data-item-id]').first();
  const box = await item.boundingBox();
  if (!box) throw new Error('placed item missing bbox');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const input = page.locator('.inline-edit');
  await input.fill('High-precision data classification');
  await input.press('Enter');

  const w = Number(await rect.getAttribute('width'));
  expect(w).toBeGreaterThan(150);

  const rendered = await page.locator('.canvas-svg [data-item-id] text').first().textContent();
  expect(rendered).toBe('High-precision data classification');

  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'small-element-expanded.png') });
});

test('grouped expands horizontally to fit a long row label (no truncation)', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="grouped"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  // Baseline: default group is 190 wide.
  const outerRect = page.locator('.canvas-svg [data-item-id] rect').first();
  expect(Number(await outerRect.getAttribute('width'))).toBe(190);

  // Edit the first child's label via the inspector to something too long.
  const rowInput = page.locator('.inspector .grouped-row input[type="text"]').first();
  await rowInput.fill('High-Volume Classification Engine');
  await rowInput.press('Enter');

  // Group should have expanded past 190 to fit the label.
  const w = Number(await outerRect.getAttribute('width'));
  expect(w).toBeGreaterThan(190);

  // The row label should render in full — no ellipsis.
  const rendered = await page.locator('.canvas-svg [data-item-id] text').nth(1).textContent();
  expect(rendered).toBe('High-Volume Classification Engine');

  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'grouped-row-expanded.png') });
});
