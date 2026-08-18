import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('boundary fill flips live when dragged inside another (§3.4 v2.3)', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place a large outer boundary (default 300×200), then bump its size via
  // the inspector so it can strictly contain another 300×200 boundary later.
  await page.locator('.palette-btn[data-add="boundary"]').click();
  await page.mouse.click(cb.x + 100, cb.y + 100);
  // Boundary is now selected — expand its width & height via inspector.
  const widthInput = page.locator('div.field:has(> span:text("width / height")) input').nth(0);
  const heightInput = page.locator('div.field:has(> span:text("width / height")) input').nth(1);
  await widthInput.fill('700');
  await widthInput.press('Enter');
  await heightInput.fill('500');
  await heightInput.press('Enter');
  // Deselect.
  await page.mouse.click(cb.x + 20, cb.y + 20);

  // Place a smaller (default 300×200) boundary elsewhere on the canvas.
  // Use a position guaranteed to be within the visible SVG area.
  await page.locator('.palette-btn[data-add="boundary"]').click();
  await page.mouse.click(cb.x + Math.min(cb.width - 40, 700), cb.y + Math.min(cb.height - 40, 60));

  // Wait for exactly two boundary groups to be in the DOM.
  await expect(page.locator('.canvas-svg [data-item-id]')).toHaveCount(2);
  const ids = await page.locator('.canvas-svg [data-item-id]').evaluateAll((els) =>
    els.map((el) => (el as SVGElement).getAttribute('data-item-id')!)
  );
  const [outerId, innerId] = ids;
  if (!outerId || !innerId) throw new Error(`expected 2 boundary ids, got ${JSON.stringify(ids)}`);

  // Baseline: both boundaries are top-level → both should have fill="none".
  const fillBefore = await page.locator(`.canvas-svg [data-item-id="${innerId}"] rect`).first().getAttribute('fill');
  expect(fillBefore).toBe('none');
  await page.screenshot({ path: join(DIR, 'nesting-01-both-top-level.png') });

  // Drag the smaller boundary into the outer one. Clicking selects, then
  // pointer down/move/up drags — matches interactions.ts drag flow.
  const inner = page.locator(`.canvas-svg [data-item-id="${innerId}"] rect`).first();
  const box = await inner.boundingBox();
  if (!box) throw new Error('inner bbox missing');

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  // Target: roughly the centre of the outer boundary.
  const outer = page.locator(`.canvas-svg [data-item-id="${outerId}"] rect`).first();
  const outerBox = await outer.boundingBox();
  if (!outerBox) throw new Error('outer bbox missing');
  const endX = outerBox.x + outerBox.width / 2;
  const endY = outerBox.y + outerBox.height / 2;

  // Select-first click, then drag.
  await inner.click({ force: true });
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2);
  await page.mouse.move(endX, endY);
  await page.mouse.up();

  // Deselect for a clean screenshot.
  await page.mouse.click(cb.x + 20, cb.y + 20);

  const fillAfter = await page.locator(`.canvas-svg [data-item-id="${innerId}"] rect`).first().getAttribute('fill');
  expect(fillAfter).toBe('#f8f9fa');
  await page.screenshot({ path: join(DIR, 'nesting-02-inner-filled.png') });
});
