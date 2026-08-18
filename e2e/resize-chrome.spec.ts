import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

/** Panel width as the grid actually resolved it, not as it was requested. */
async function panelWidth(page: import('@playwright/test').Page, sel: string): Promise<number> {
  const box = await page.locator(sel).boundingBox();
  if (!box) throw new Error(`${sel} not laid out`);
  return box.width;
}

test.describe('canvas resize', () => {
  test('corner handle drag grows the canvas, and it is one undo step', async ({ page }) => {
    page.setViewportSize({ width: 1600, height: 950 });
    await page.goto('/?blank=1');
    await page.waitForLoadState('networkidle');

    const widthInput = page.locator('.tb-canvas-w');
    const heightInput = page.locator('.tb-canvas-h');
    await expect(widthInput).toHaveValue('1200');
    await expect(heightInput).toHaveValue('800');

    const handle = page.locator('.canvas-handle-se');
    const hb = await handle.boundingBox();
    if (!hb) throw new Error('corner handle not laid out');

    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 100, hb.y + 60);
    await page.mouse.move(hb.x + 150, hb.y + 90);
    await page.mouse.up();

    const grownW = Number(await widthInput.inputValue());
    const grownH = Number(await heightInput.inputValue());
    expect(grownW).toBeGreaterThan(1200);
    expect(grownH).toBeGreaterThan(800);
    // Committed size lands on the grid.
    expect(grownW % 10).toBe(0);
    expect(grownH % 10).toBe(0);

    // The SVG itself followed the commit.
    await expect(page.locator('.canvas-svg')).toHaveAttribute('width', String(grownW));

    // A whole drag is a single undo entry, not one per pointermove.
    await page.keyboard.press('Meta+z');
    await expect(widthInput).toHaveValue('1200');
    await expect(heightInput).toHaveValue('800');

    await page.screenshot({ path: join(DIR, 'canvas-resized.png') });
  });

  test('toolbar inputs resize, and out-of-range entries correct themselves', async ({ page }) => {
    page.setViewportSize({ width: 1600, height: 950 });
    await page.goto('/?blank=1');
    await page.waitForLoadState('networkidle');

    const widthInput = page.locator('.tb-canvas-w');
    await widthInput.fill('1600');
    await widthInput.press('Enter');
    await expect(page.locator('.canvas-svg')).toHaveAttribute('width', '1600');

    // Below the floor: the field snaps back to the accepted value.
    await widthInput.fill('10');
    await widthInput.press('Enter');
    await expect(widthInput).toHaveValue('400');

    // Off-grid input snaps to the grid.
    await widthInput.fill('1234');
    await widthInput.press('Enter');
    await expect(widthInput).toHaveValue('1230');
  });

  test('canvas will not shrink below placed content, and Fit shrink-wraps to it', async ({ page }) => {
    page.setViewportSize({ width: 1600, height: 950 });
    await page.goto('/?blank=1');
    await page.waitForLoadState('networkidle');

    const canvas = page.locator('.canvas-svg');
    const cb = await canvas.boundingBox();
    if (!cb) throw new Error('canvas not laid out');

    // Place an element far from the origin so it sets a real floor.
    await page.locator('.palette-btn[data-add="element:md"]').click();
    await page.mouse.click(cb.x + 700, cb.y + 500);

    const widthInput = page.locator('.tb-canvas-w');
    await widthInput.fill('400');
    await widthInput.press('Enter');
    const floored = Number(await widthInput.inputValue());
    expect(floored).toBeGreaterThan(400);

    // Fit collapses the canvas to exactly that floor.
    await page.locator('.tb-canvas-fit').click();
    await expect(widthInput).toHaveValue(String(floored));
    // ...and having done so, there is nothing left to fit.
    await expect(page.locator('.tb-canvas-fit')).toBeDisabled();
  });
});

test.describe('sidebar resize', () => {
  test('dragging the left gutter widens the palette and survives reload', async ({ page }) => {
    page.setViewportSize({ width: 1600, height: 950 });
    await page.goto('/?blank=1');
    await page.waitForLoadState('networkidle');

    const before = await panelWidth(page, '#palette-slot');
    expect(Math.round(before)).toBe(240);

    const gutter = page.locator('.col-gutter-left');
    const gb = await gutter.boundingBox();
    if (!gb) throw new Error('left gutter not laid out');

    await page.mouse.move(gb.x + gb.width / 2, gb.y + 200);
    await page.mouse.down();
    await page.mouse.move(gb.x + 60, gb.y + 200);
    await page.mouse.move(gb.x + 120, gb.y + 200);
    await page.mouse.up();

    const after = await panelWidth(page, '#palette-slot');
    expect(after).toBeGreaterThan(before + 80);

    // Persisted, not reset on reload.
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(await panelWidth(page, '#palette-slot')).toBeCloseTo(after, 0);

    await page.screenshot({ path: join(DIR, 'sidebars-resized.png') });
  });

  test('right gutter grows the inspector leftward', async ({ page }) => {
    page.setViewportSize({ width: 1600, height: 950 });
    await page.goto('/?blank=1');
    await page.waitForLoadState('networkidle');

    const before = await panelWidth(page, '#right-slot');
    const gutter = page.locator('.col-gutter-right');
    const gb = await gutter.boundingBox();
    if (!gb) throw new Error('right gutter not laid out');

    await page.mouse.move(gb.x + gb.width / 2, gb.y + 200);
    await page.mouse.down();
    await page.mouse.move(gb.x - 60, gb.y + 200);
    await page.mouse.move(gb.x - 110, gb.y + 200);
    await page.mouse.up();

    expect(await panelWidth(page, '#right-slot')).toBeGreaterThan(before + 80);
  });

  test('gutters are keyboard operable and double-click resets', async ({ page }) => {
    page.setViewportSize({ width: 1600, height: 950 });
    await page.goto('/?blank=1');
    await page.waitForLoadState('networkidle');

    const gutter = page.locator('.col-gutter-left');
    await gutter.focus();
    await gutter.press('ArrowRight');
    await gutter.press('ArrowRight');
    expect(Math.round(await panelWidth(page, '#palette-slot'))).toBe(260);

    await gutter.press('Shift+ArrowRight');
    expect(Math.round(await panelWidth(page, '#palette-slot'))).toBe(310);

    await gutter.dblclick();
    expect(Math.round(await panelWidth(page, '#palette-slot'))).toBe(240);
  });

  test('a panel cannot be dragged wide enough to squeeze out the canvas', async ({ page }) => {
    page.setViewportSize({ width: 1100, height: 900 });
    await page.goto('/?blank=1');
    await page.waitForLoadState('networkidle');

    const gutter = page.locator('.col-gutter-left');
    const gb = await gutter.boundingBox();
    if (!gb) throw new Error('left gutter not laid out');

    await page.mouse.move(gb.x + gb.width / 2, gb.y + 200);
    await page.mouse.down();
    await page.mouse.move(gb.x + 700, gb.y + 200);
    await page.mouse.up();

    expect(await panelWidth(page, '#canvas-slot')).toBeGreaterThanOrEqual(320);
  });
});
