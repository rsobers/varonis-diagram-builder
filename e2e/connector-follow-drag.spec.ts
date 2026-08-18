import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

/**
 * Structural guarantee: connectors are relationships, not point lists.
 * Dragging an element must re-anchor every connector touching it. We place
 * two elements, join them, drag one far away, and confirm the connector
 * path endpoints track the new geometry (not the placement geometry).
 */
test('dragging an element re-anchors its connectors', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place two Medium elements.
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 700, cb.y + 200);

  // Connect them: connect mode, click source then target.
  await page.locator('.tb-btn[data-mode="connect"]').click();
  const items = await page.locator('.canvas-svg [data-item-id]').evaluateAll(
    (els) => els.map((e) => (e as SVGElement).getAttribute('data-item-id')!)
  );
  const [srcId, dstId] = items;
  await page.locator(`.canvas-svg [data-item-id="${srcId}"] rect`).first().click({ force: true });
  await page.locator(`.canvas-svg [data-item-id="${dstId}"] rect`).first().click({ force: true });
  await page.locator('.tb-btn[data-mode="select"]').click();

  // Capture the original connector path.
  const pathBefore = await page.locator('.canvas-svg [data-item-id] path').first().getAttribute('d');
  expect(pathBefore).toBeTruthy();
  await page.screenshot({ path: join(DIR, 'drag-before.png') });

  // Drag the source element well away — 400px down and 300px right.
  const srcBox = await page.locator(`.canvas-svg [data-item-id="${srcId}"] rect`).first().boundingBox();
  if (!srcBox) throw new Error('source item missing bbox');
  const startX = srcBox.x + srcBox.width / 2;
  const startY = srcBox.y + srcBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 300, startY + 400, { steps: 15 });
  await page.mouse.up();

  // Path should have changed and the new endpoints should reflect the moved
  // source, not the original placement.
  const pathAfter = await page.locator('.canvas-svg [data-item-id] path').first().getAttribute('d');
  expect(pathAfter).toBeTruthy();
  expect(pathAfter).not.toBe(pathBefore);

  // Endpoints of a connector path are the first M-point and the last L-point.
  // Parse the "M x,y L x,y ... " string.
  const pts = pathAfter!.replace(/^M/, '').split(/[ML]/).map((s) => s.trim().split(',').map(Number));
  const [ex, ey] = pts[0]!;
  // The exit point should have moved from its pre-drag Y (~ srcBox.center)
  // to something ~400 lower in SVG coords.
  const srcBoxAfter = await page.locator(`.canvas-svg [data-item-id="${srcId}"] rect`).first().boundingBox();
  if (!srcBoxAfter) throw new Error('source item missing bbox after drag');
  // Endpoint sits on the element's edge midpoint. Compare in SVG space via
  // getBBox against the rect element itself.
  const rectAttrs = await page.locator(`.canvas-svg [data-item-id="${srcId}"] rect`).first().evaluate((el) => ({
    x: Number(el.getAttribute('x')), y: Number(el.getAttribute('y')),
    w: Number(el.getAttribute('width')), h: Number(el.getAttribute('height')),
  }));
  // Exit is on one of the rect's edges, so its coords must satisfy one of:
  //   x === rect.x, x === rect.x + w, y === rect.y, y === rect.y + h  (with
  // some tolerance from parallel-connector offset). Use ±40 tolerance so we
  // don't over-specify the exact side chosen by the router.
  const nearAny = (v: number, targets: number[], tol = 40): boolean =>
    targets.some((t) => Math.abs(v - t) <= tol);
  expect(
    nearAny(ex!, [rectAttrs.x, rectAttrs.x + rectAttrs.w]) ||
    nearAny(ey!, [rectAttrs.y, rectAttrs.y + rectAttrs.h])
  ).toBe(true);

  await page.screenshot({ path: join(DIR, 'drag-after.png') });
});
