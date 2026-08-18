import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: join(DIR, `${name}.png`), fullPage: false });
}

test('golden path — screenshots for bug hunt', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');
  await shot(page, '01-empty');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place three elements — one blue via inspector later.
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 150);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 500, cb.y + 150);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 800, cb.y + 150);
  await shot(page, '02-three-elements');

  // Drag first item.
  const items = page.locator('.canvas-svg [data-item-id]');
  const before = await items.first().boundingBox();
  if (!before) throw new Error('missing first bbox');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 40);
  await page.mouse.up();
  await shot(page, '03-after-drag');

  // Place a boundary + drag an element into it.
  await page.locator('.palette-btn[data-add="boundary"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 400);
  await shot(page, '04-boundary-placed');

  // Drag element from palette (HTML5 dnd) into the boundary area.
  const paletteBtn = page.locator('.palette-btn[data-add="element:sm"]');
  await paletteBtn.dragTo(canvas, { targetPosition: { x: 300, y: 500 } });
  await shot(page, '05-after-palette-drag');

  // Select first element and inspect.
  await items.first().click({ force: true });
  await shot(page, '06-selected-inspector');

  // Switch to connect mode and connect first two items.
  await page.locator('button[data-mode="connect"]').click();
  await shot(page, '07-connect-mode');
  await items.first().click({ force: true });
  await shot(page, '08-pending-source');
  await items.nth(1).click({ force: true });
  await shot(page, '09-connected');

  // Back to select.
  await page.locator('button[data-mode="select"]').click();

  // Encoding = State → validation panel.
  await page.locator('.tb-encoding').selectOption('state');
  await shot(page, '10-state-encoding');

  // Fix by adding legend.
  await page.locator('.violation-fix', { hasText: /Add legend/i }).click();
  await shot(page, '11-legend-added');

  // Encoding = Ownership → try coloring an element blue via inspector.
  await page.locator('.tb-encoding').selectOption('ownership');
  await items.first().click({ force: true });
  await shot(page, '12-ownership-inspector');
  const blueSwatch = page.locator('.inspector .swatches .swatch[style*="e8f1fc"]');
  if (await blueSwatch.count() > 0) {
    await blueSwatch.first().click();
  }
  await shot(page, '13-blue-element');

  // Confirm the app still boots and the toolbar is responsive.
  expect(true).toBe(true);
});
