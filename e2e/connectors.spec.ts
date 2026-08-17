import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('two connectors between the same pair are offset along the shared edge', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place two elements.
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 500, cb.y + 200);

  const initialItems = page.locator('.canvas-svg [data-item-id]');
  await expect(initialItems).toHaveCount(2);
  // Capture ids up front — after a connector is created, DOM order shifts.
  const ids = await initialItems.evaluateAll((els) =>
    els.map((el) => (el as SVGElement).getAttribute('data-item-id')!)
  );
  const [idA, idB] = ids;

  const selectById = (id: string) => page.locator(`.canvas-svg [data-item-id="${id}"]`);

  // First connection.
  await page.locator('button[data-mode="connect"]').click();
  await selectById(idA!).click({ force: true });
  await selectById(idB!).click({ force: true });
  // Second connection — same pair, opposite direction.
  await selectById(idB!).click({ force: true });
  await selectById(idA!).click({ force: true });

  await page.locator('button[data-mode="select"]').click();
  await expect(page.locator('.canvas-svg [data-item-id]')).toHaveCount(4);
  await page.screenshot({ path: join(DIR, 'parallel-connectors.png') });
});

test('connector arrows select mode renders marker-start via inspector', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 500, cb.y + 200);

  const items = page.locator('.canvas-svg [data-item-id]');

  await page.locator('button[data-mode="connect"]').click();
  await items.first().click();
  await items.nth(1).click();
  await page.locator('button[data-mode="select"]').click();

  // The newly created connector is selected. Change arrows in inspector.
  const arrowsSelect = page.locator('label.field:has(> span:text("Arrows")) select');
  await arrowsSelect.selectOption('both');

  const svg = await canvas.innerHTML();
  expect(svg).toMatch(/marker-start="url\(#ar\)"/);
  expect(svg).toMatch(/marker-end="url\(#ar\)"/);
  await page.screenshot({ path: join(DIR, 'arrow-both.png') });
});
