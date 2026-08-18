import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('inline label editing: dblclick → edit → Enter commits', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place an element.
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  const items = page.locator('.canvas-svg [data-item-id]');
  await expect(items).toHaveCount(1);

  // Confirm the initial label reads "Element".
  await expect(items.first()).toContainText('Element');

  // Double-click the item's SVG group.
  const box = await items.first().boundingBox();
  if (!box) throw new Error('item bbox missing');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  // Inline input appears.
  const input = page.locator('.inline-edit');
  await expect(input).toBeVisible();
  await page.screenshot({ path: join(DIR, 'inline-edit-open.png') });

  // Replace label and press Enter.
  await input.fill('Web UI');
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(items.first()).toContainText('Web UI');
  await page.screenshot({ path: join(DIR, 'inline-edit-committed.png') });
});

test('inline label editing: Escape cancels without change', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  const items = page.locator('.canvas-svg [data-item-id]');
  const first = items.first();
  const box = await first.boundingBox();
  if (!box) throw new Error('item bbox missing');
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  const input = page.locator('.inline-edit');
  await input.fill('Discarded');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(first).toContainText('Element');
  await expect(first).not.toContainText('Discarded');
});
