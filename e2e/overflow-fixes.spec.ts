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

test('grouped row truncates + warns when the label overflows', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="grouped"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  // Edit the first child's label via the inspector to something too long.
  const rowInput = page.locator('.inspector .grouped-row input[type="text"]').first();
  await rowInput.fill('High-Volume Classification Engine');
  await rowInput.press('Enter');

  // The rendered row text should be shorter than the source label (truncated).
  const rendered = await page.locator('.canvas-svg [data-item-id] text').nth(1).textContent();
  expect(rendered).not.toBeNull();
  expect(rendered!.length).toBeLessThan('High-Volume Classification Engine'.length);
  expect(rendered).toContain('…');

  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'grouped-row-truncated.png') });
});
