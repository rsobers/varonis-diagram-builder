import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('grouped element connects to a medium element with a truly-straight line', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Reproduce the user's scenario: grouped list (tall, 3 rows w/ icons) on
  // the left, medium element on the right at similar-but-not-matching y.
  await page.locator('.palette-btn[data-add="grouped+icons"]').click();
  await page.mouse.click(cb.x + 150, cb.y + 250);

  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 550, cb.y + 350);

  // Capture ids up front (DOM order shifts after a connector is added).
  const initial = page.locator('.canvas-svg [data-item-id]');
  const ids = await initial.evaluateAll((els) =>
    els.map((el) => (el as SVGElement).getAttribute('data-item-id')!)
  );
  const [idGroup, idElement] = ids;

  await page.locator('button[data-mode="connect"]').click();
  await page.locator(`.canvas-svg [data-item-id="${idGroup}"]`).click({ force: true });
  await page.locator(`.canvas-svg [data-item-id="${idElement}"]`).click({ force: true });
  await page.locator('button[data-mode="select"]').click();

  // Deselect and screenshot.
  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'group-connector-straight.png'), clip: {
    x: cb.x, y: cb.y, width: 900, height: 500,
  }});
});
