import { test, expect } from '@playwright/test';

/**
 * Undo/redo via Cmd-Z / Cmd-Shift-Z (or Ctrl-Z / Ctrl-Y on Windows).
 * Verifies the reducer's history hook is wired through the keyboard.
 */
test('Cmd-Z undoes a delete; Cmd-Shift-Z redoes it', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place two md elements.
  const paletteMd = page.locator('.palette-btn[data-add="element:md"]');
  await paletteMd.click();
  await page.mouse.click(cb.x + 200, cb.y + 200);
  await paletteMd.click();
  await page.mouse.click(cb.x + 500, cb.y + 200);

  const items = page.locator('.canvas-svg [data-item-id]');
  await expect(items).toHaveCount(2);

  // Delete one — select first, hit Delete.
  await page.locator('.canvas-svg [data-item-id]').first().click({ force: true });
  await page.keyboard.press('Delete');
  await expect(items).toHaveCount(1);

  // Cmd-Z restores it. Playwright abstracts modifier as `Meta` on mac,
  // Control elsewhere; use ControlOrMeta.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(items).toHaveCount(2);

  // Cmd-Shift-Z re-deletes.
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(items).toHaveCount(1);
});

test('Cmd-Z undoes a move (dragged element returns to origin)', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);

  const rect = page.locator('.canvas-svg [data-item-id] rect').first();
  const startX = Number(await rect.getAttribute('x'));

  // Drag the element 200px right.
  const box = await page.locator('.canvas-svg [data-item-id]').first().boundingBox();
  if (!box) throw new Error('element missing bbox');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  const movedX = Number(await rect.getAttribute('x'));
  expect(movedX).toBeGreaterThan(startX + 50);

  await page.keyboard.press('ControlOrMeta+z');
  const undoneX = Number(await rect.getAttribute('x'));
  expect(undoneX).toBe(startX);
});
