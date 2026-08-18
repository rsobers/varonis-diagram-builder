import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('Cmd-D duplicates the selection to a shifted copy', async ({ page, browserName }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  const items = page.locator('.canvas-svg [data-item-id]');
  await expect(items).toHaveCount(1);

  // Focus canvas so the shortcut isn't captured by a form field.
  await canvas.click({ position: { x: 10, y: 10 } });
  await items.first().click();

  const modifier = browserName === 'webkit' || process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+d`);
  await expect(items).toHaveCount(2);
  await page.screenshot({ path: join(DIR, 'duplicate.png') });
});

test('Cmd-C then Cmd-V pastes', async ({ page, browserName }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  const items = page.locator('.canvas-svg [data-item-id]');
  await items.first().click();

  const modifier = browserName === 'webkit' || process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+c`);
  await expect(page.locator('#toast-slot .toast')).toContainText(/copied/i);
  await page.keyboard.press(`${modifier}+v`);
  await expect(items).toHaveCount(2);
  await page.screenshot({ path: join(DIR, 'paste.png') });
});
