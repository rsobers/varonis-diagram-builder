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

test('badge scales with sm / md / lg size choice', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette h3', { hasText: 'Vendor marks' }).scrollIntoViewIfNeeded();
  await page.locator('.mark-style-btn', { hasText: 'Badge' }).click();

  // Place three Okta badges — md by default. Then flip size via inspector
  // for the first (to sm) and the third (to lg).
  const cx = cb.x + cb.width / 2;
  const positions = [cb.y + 150, cb.y + 300, cb.y + 450];
  for (const y of positions) {
    await page.locator('.palette [data-mark="okta"]').click();
    await page.mouse.click(cx, y);
  }

  const items = page.locator('.canvas-svg [data-item-id]');
  await expect(items).toHaveCount(3);

  // Get the three placed ids in DOM order.
  const ids = await items.evaluateAll((els) =>
    els.map((el) => (el as SVGElement).getAttribute('data-item-id')!)
  );

  // Change first placed to sm.
  await page.locator(`[data-item-id="${ids[0]}"] rect`).first().click({ force: true });
  const sizeSel = page.locator('label.field:has(> span:text("Size")) select');
  await sizeSel.selectOption('sm');

  // Change third placed to lg.
  await page.locator(`[data-item-id="${ids[2]}"] rect`).first().click({ force: true });
  await sizeSel.selectOption('lg');

  // Read all rect sizes and confirm three distinct badge dimensions.
  const rects = await page.locator('.canvas-svg [data-item-id] rect').evaluateAll((els) =>
    els.map((el) => ({
      w: Number((el as SVGRectElement).getAttribute('width')),
      h: Number((el as SVGRectElement).getAttribute('height')),
    }))
  );
  const sides = new Set(
    rects.filter((r) => r.w === r.h && [64, 90, 120].includes(r.w)).map((r) => r.w)
  );
  expect(sides).toEqual(new Set([64, 90, 120]));

  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'badge-size-progression.png') });
});
