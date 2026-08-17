import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('vendor mark palette places a marked element', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Scroll palette to reveal the Vendor marks section.
  await page.locator('.palette h3', { hasText: 'Vendor marks' }).scrollIntoViewIfNeeded();
  await expect(page.locator('.palette-marks-list')).toBeVisible();

  // Click the Okta mark → arm placement.
  await page.locator('.palette [data-mark="okta"]').click();

  // Click on the canvas to place.
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');
  await page.mouse.click(cb.x + 300, cb.y + 200);

  // The element renders with an <image> node for the mark.
  await expect(page.locator('.canvas-svg [data-item-id] image').first()).toBeAttached();
  await page.screenshot({ path: join(DIR, 'mark-on-element.png') });
});

test('vendor mark on a boundary renders as a top-right badge', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="boundary"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);

  // Boundary is now selected. Find and click the Okta mark in the inspector's picker.
  const markPicker = page.locator('.inspector .mark-picker');
  await expect(markPicker).toBeVisible();
  await markPicker.locator('[aria-label="Okta"]').click();

  const boundaryImage = page.locator('.canvas-svg [data-item-id] image');
  await expect(boundaryImage).toHaveCount(1);
  await page.screenshot({ path: join(DIR, 'mark-boundary-badge.png') });
});

test('mark on a blue element is blocked and explained', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Switch to Ownership so blue becomes available.
  await page.locator('.tb-encoding').selectOption('ownership');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  // Change the element's fill to blue via inspector.
  const blueSwatch = page.locator('.inspector .swatches .swatch[data-fill]').filter({ hasNotText: /^/ }).nth(2);
  // Fallback via title attribute if data-fill wasn't set on inspector swatches.
  const blueByTitle = page.locator('.inspector .swatches .swatch[title="blue"], .inspector .swatches .swatch[aria-label="blue"]');
  if (await blueByTitle.count() > 0) await blueByTitle.first().click();
  else await blueSwatch.click();

  // Now attempt to open the mark picker — it should show the block message,
  // not the grid of marks.
  const markPicker = page.locator('.inspector .mark-picker');
  await expect(markPicker).toContainText(/only sit on white or gray/i);
  // No mark grid should be present in the picker.
  await expect(markPicker.locator('.icon-grid')).toHaveCount(0);
  await page.screenshot({ path: join(DIR, 'mark-blocked-on-blue.png') });
});
