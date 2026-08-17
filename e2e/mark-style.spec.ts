import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('vendor mark supports both inline and badge placement', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Scroll palette to reveal the Vendor marks section (below the fold).
  await page.locator('.palette h3', { hasText: 'Vendor marks' }).scrollIntoViewIfNeeded();

  // Default toggle is Inline — place an Okta element inline.
  await expect(page.locator('.mark-style-btn.active', { hasText: 'Inline' })).toBeVisible();
  await page.locator('.palette [data-mark="okta"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);

  // Flip the toggle to Badge and place another Okta.
  await page.locator('.mark-style-btn', { hasText: 'Badge' }).click();
  await expect(page.locator('.mark-style-btn.active', { hasText: 'Badge' })).toBeVisible();
  await page.locator('.palette [data-mark="okta"]').click();
  await page.mouse.click(cb.x + 500, cb.y + 200);

  const items = page.locator('.canvas-svg [data-item-id]');
  await expect(items).toHaveCount(2);

  // Verify the two rects have different sizes: inline uses the md preset
  // (180×64); badge uses the fixed 90×90 square.
  const rects = await page.locator('.canvas-svg [data-item-id] rect').evaluateAll((els) =>
    els.map((el) => ({
      w: Number((el as SVGRectElement).getAttribute('width')),
      h: Number((el as SVGRectElement).getAttribute('height')),
    }))
  );
  // Filter to just the element rects (not overlay/selection rings).
  const elementRects = rects.filter((r) => (r.w === 180 && r.h === 64) || (r.w === 90 && r.h === 90));
  expect(elementRects.some((r) => r.w === 180 && r.h === 64)).toBe(true);
  expect(elementRects.some((r) => r.w === 90 && r.h === 90)).toBe(true);

  // Deselect for a clean screenshot.
  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'mark-inline-vs-badge.png') });
});
