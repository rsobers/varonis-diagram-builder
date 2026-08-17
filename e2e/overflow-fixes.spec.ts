import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('inline control pill fits a long label like "Metadata & Logs" without clipping', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
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
  await page.goto('/');
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

test('grouped expands horizontally to fit a long row label (no truncation)', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
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
