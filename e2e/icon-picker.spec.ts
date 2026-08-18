import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('icon picker: search + curated kit + path storage', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  // Place an element and select it to reveal the icon picker.
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');
  await page.locator('.palette-btn[data-add="element:md+icon"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  // Screenshot the picker in its default state.
  await page.screenshot({ path: join(DIR, 'icon-picker-default.png') });

  const searchInput = page.locator('.icon-picker-search');
  await expect(searchInput).toBeVisible();

  // Type a search term — the grid narrows.
  const cellsBefore = await page.locator('.icon-grid .icon-cell').count();
  await searchInput.fill('cloud');
  await page.screenshot({ path: join(DIR, 'icon-picker-search-cloud.png') });
  const cellsAfter = await page.locator('.icon-grid .icon-cell').count();
  expect(cellsAfter).toBeLessThan(cellsBefore);
  expect(cellsAfter).toBeGreaterThanOrEqual(2); // at least "none" + cloud match

  // Pick the cloud icon — the model should get a { name, path }.
  await page.locator('.icon-cell[aria-label="cloud"]').click();

  // Confirm the picker's "Current: cloud" indicator updates.
  await expect(page.locator('.icon-picker-current')).toContainText('cloud');

  // Confirm the rendered element's SVG contains the cloud path (self-contained).
  const cloudFragment = 'M19.35 10.04C18.67'; // first ~20 chars of the cloud path
  const svg = await page.locator('.canvas-svg').innerHTML();
  expect(svg).toContain(cloudFragment);

  await page.screenshot({ path: join(DIR, 'icon-picker-cloud-applied.png') });
});
