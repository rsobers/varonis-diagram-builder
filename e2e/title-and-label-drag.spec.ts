import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('doc title: single-click to edit, empty to clear', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  // Load example 1 (has a doc title) — no ?blank so the preload fires.
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const titleGroup = page.locator('.canvas-svg [data-doc-title]');
  await expect(titleGroup).toBeVisible();

  await titleGroup.click();
  const editor = page.locator('.inline-edit-title');
  await expect(editor).toBeVisible();

  // Rewrite the title.
  await editor.fill('My custom diagram\nRevised subtitle');
  await editor.press('Enter');
  await expect(page.locator('.canvas-svg text').first()).toHaveText('My custom diagram');

  // Now clear it — open again, wipe, commit.
  await titleGroup.click();
  const editor2 = page.locator('.inline-edit-title');
  await editor2.fill('');
  await editor2.press('Enter');

  // Title strip should be gone — the group is no longer emitted.
  await expect(page.locator('.canvas-svg [data-doc-title]')).toHaveCount(0);
  await page.screenshot({ path: join(DIR, 'doc-title-cleared.png') });
});

test('connector label: drag along its route persists as labelOffset', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');

  // Place two md elements horizontally.
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 150, cb.y + 200);
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 600, cb.y + 200);

  // Connect them.
  await page.locator('.tb-btn[data-mode="connect"]').click();
  const ids = await page.locator('.canvas-svg [data-item-id]').evaluateAll(
    (els) => els.map((e) => (e as SVGElement).getAttribute('data-item-id')!)
  );
  const [srcId, dstId] = ids;
  await page.locator(`.canvas-svg [data-item-id="${srcId}"] rect`).first().click({ force: true });
  await page.locator(`.canvas-svg [data-item-id="${dstId}"] rect`).first().click({ force: true });
  await page.locator('.tb-btn[data-mode="select"]').click();

  // Find the connector's id and add a label via the inspector.
  const connId = await page.locator('.canvas-svg [data-item-id] path').first()
    .evaluate((el) => el.parentElement?.getAttribute('data-item-id') ?? '');
  expect(connId).not.toBe('');
  await page.locator(`.canvas-svg [data-item-id="${connId}"]`).first().click({ force: true });
  const labelInput = page.locator('.inspector textarea').first();
  await labelInput.fill('LABEL MOVED');
  // textarea commits on blur (change event), not Enter — click elsewhere.
  await labelInput.blur();

  // Grab the pill and drag it far to the right along the connector.
  const pill = page.locator(`.canvas-svg [data-connector-label="${connId}"]`);
  const before = await pill.boundingBox();
  if (!before) throw new Error('pill missing bbox');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + 300, before.y + before.height / 2, { steps: 15 });
  await page.mouse.up();

  const after = await pill.boundingBox();
  if (!after) throw new Error('pill missing bbox after drag');
  // Pill centre should have moved noticeably along the connector's direction.
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(80);

  // labelOffset persisted → clicking away and back should keep the new position.
  await page.mouse.click(cb.x + 20, cb.y + 20);
  await page.screenshot({ path: join(DIR, 'connector-label-dragged.png') });
});
