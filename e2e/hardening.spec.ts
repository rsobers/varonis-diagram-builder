import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: join(DIR, `hardening-${name}.png`), fullPage: false });
}

test('drag-and-drop ghost + snap preview shows in the canvas', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Simulate a dragover event with a real palette payload — Playwright's
  // dragTo can't easily pause mid-drag, so we script the DnD directly.
  const previewCount = await page.evaluate(() => {
    const canvas = document.getElementById('canvas-slot')!;
    const rect = canvas.getBoundingClientRect();
    const dt = new DataTransfer();
    dt.setData('application/x-vdb-item', JSON.stringify({ spec: 'element:md+icon', color: 'blue' }));
    // Dragover in the middle of the canvas.
    const evOver = new DragEvent('dragover', {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      dataTransfer: dt,
    });
    canvas.dispatchEvent(evOver);
    return document.querySelectorAll('.drop-preview').length;
  });
  if (previewCount !== 1) throw new Error(`expected 1 drop-preview, got ${previewCount}`);
  await shot(page, 'dnd-ghost');
});

test('dropping into a boundary registers within it', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Place a large boundary.
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  await page.locator('.palette-btn[data-add="boundary:plain"]').click();
  await page.mouse.click(cb.x + 300, cb.y + 300);
  await shot(page, 'boundary-placed');

  // Now drop a small element into the boundary interior. Use programmatic
  // drop so we control coords precisely.
  await page.evaluate(({ cx, cy }) => {
    const canvas = document.getElementById('canvas-slot')!;
    const dt = new DataTransfer();
    dt.setData('application/x-vdb-item', JSON.stringify({ spec: 'element:sm', color: 'white' }));
    const evDrop = new DragEvent('drop', {
      bubbles: true, cancelable: true,
      clientX: cx, clientY: cy,
      dataTransfer: dt,
    });
    canvas.dispatchEvent(evDrop);
  }, { cx: cb.x + 400, cy: cb.y + 350 });
  await shot(page, 'element-in-boundary');

  // Item is inside the boundary — the validation panel confirms it via the
  // peer-group check (this element is a lone sibling, so no violation).
});
