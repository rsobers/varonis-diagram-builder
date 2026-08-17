import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('zone divider exposes y1/y2 handles when selected, drag adjusts endpoint', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place a zone divider.
  await page.locator('.palette-btn[data-add="zoneDivider"]').click();
  await page.mouse.click(cb.x + 400, cb.y + 100);

  // Just-placed items are selected — two handles should be present.
  const handles = page.locator('.canvas-svg [data-resize]');
  await expect(handles).toHaveCount(2);
  await expect(handles.nth(0)).toHaveAttribute('data-resize-mode', 'y1');
  await expect(handles.nth(1)).toHaveAttribute('data-resize-mode', 'y2');

  // Read the y1/y2 inspector fields for baseline.
  const y1Input = page.locator('div.field:has(> span:text("y1 / y2")) input').nth(0);
  const y2Input = page.locator('div.field:has(> span:text("y1 / y2")) input').nth(1);
  const y1Before = Number(await y1Input.inputValue());
  const y2Before = Number(await y2Input.inputValue());

  // Drag the y2 handle down 80px.
  const handleBox = await handles.nth(1).boundingBox();
  if (!handleBox) throw new Error('y2 handle missing bbox');
  await page.mouse.move(handleBox.x + 6, handleBox.y + 6);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 6, handleBox.y + 40);
  await page.mouse.move(handleBox.x + 6, handleBox.y + 80);
  await page.mouse.up();

  const y2After = Number(await y2Input.inputValue());
  expect(y2After).toBeGreaterThan(y2Before);
  // y1 untouched by y2 drag.
  const y1After = Number(await y1Input.inputValue());
  expect(y1After).toBe(y1Before);

  await page.screenshot({ path: join(DIR, 'zone-divider-resized.png') });
});
