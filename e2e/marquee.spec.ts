import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('marquee: drag a rect across items → all inside get selected', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place three elements on a horizontal row.
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 400, cb.y + 200);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 600, cb.y + 500);

  const items = page.locator('.canvas-svg [data-item-id]');
  await expect(items).toHaveCount(3);

  // Marquee across the top row (first two elements), skip the third.
  const startX = cb.x + 100;
  const startY = cb.y + 150;
  const endX = cb.x + 550;
  const endY = cb.y + 260;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY + 20);
  await page.mouse.move(startX + 250, startY + 60);
  // Mid-drag screenshot — the marquee rect should be visible.
  await page.screenshot({ path: join(DIR, 'marquee-mid.png') });
  await page.mouse.move(endX, endY);
  await page.mouse.up();

  // Two selection rings appear on the first two items (nothing on the third).
  const rings = page.locator('.canvas-svg > rect[stroke-dasharray="4 3"]');
  await expect(rings).toHaveCount(2);
  await page.screenshot({ path: join(DIR, 'marquee-committed.png') });
});

test('marquee: click on empty canvas without drag clears selection', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  const items = page.locator('.canvas-svg [data-item-id]');
  await items.first().click();
  // Selection ring visible.
  await expect(page.locator('.canvas-svg > rect[stroke-dasharray="4 3"]')).toHaveCount(1);

  // Click empty canvas — no movement — clears. Pick a spot far from the
  // element (which was placed at ~300,200 in canvas coords).
  await page.mouse.click(cb.x + 20, cb.y + 20);
  await expect(page.locator('.canvas-svg > rect[stroke-dasharray="4 3"]')).toHaveCount(0);
});

test('marquee: shift-drag adds to existing selection', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 500, cb.y + 200);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 500);

  const items = page.locator('.canvas-svg [data-item-id]');
  await expect(items).toHaveCount(3);

  // Select the third item (bottom-left) via click.
  await items.nth(2).click();
  await expect(page.locator('.canvas-svg > rect[stroke-dasharray="4 3"]')).toHaveCount(1);

  // Shift-drag over the two top-row items — expect all three selected.
  await page.keyboard.down('Shift');
  await page.mouse.move(cb.x + 100, cb.y + 150);
  await page.mouse.down();
  await page.mouse.move(cb.x + 350, cb.y + 250);
  await page.mouse.move(cb.x + 650, cb.y + 260);
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect(page.locator('.canvas-svg > rect[stroke-dasharray="4 3"]')).toHaveCount(3);
});
