import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('inline control vs small element size comparison', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place a small element.
  await page.locator('.palette-btn[data-add="element:sm"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);

  // Place an inline control right below it, similar horizontal position.
  await page.locator('.palette-btn[data-add="inlineControl"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 260);

  // Also an inline control with icon.
  await page.locator('.palette-btn[data-add="inlineControl+icon"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 320);

  // Deselect so no ring interferes.
  await page.mouse.click(cb.x + 700, cb.y + 500);

  await page.screenshot({ path: join(DIR, 'inline-control-compare.png'), clip: {
    x: cb.x, y: cb.y, width: 400, height: 300,
  }});
});
