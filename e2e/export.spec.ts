import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('Export SVG downloads a valid SVG', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Place an element so the export isn't empty.
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');
  await page.locator('.palette-btn[data-add="element:md+icon"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('.tb-export-svg').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);

  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  expect(text.startsWith('<svg')).toBe(true);
  expect(text.endsWith('</svg>')).toBe(true);
  // Interactive wrappers must NOT appear in exported files.
  expect(text).not.toContain('data-item-id');
  // The placed element should carry through.
  expect(text).toContain('Element');
  await page.screenshot({ path: join(DIR, 'export-svg-done.png') });
});

test('Export PNG downloads a valid transparent PNG at 2×', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 200);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('.tb-export-png').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);

  const path = await download.path();
  const bytes = readFileSync(path);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  // Width from IHDR (bytes 16–19 big-endian). Doc width is 1200 → 2× = 2400.
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  expect(width).toBe(2400);
  expect(height).toBe(1600);
  await page.screenshot({ path: join(DIR, 'export-png-done.png') });
});
