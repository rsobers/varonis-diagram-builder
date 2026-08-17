import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

// Tiny 10x10 PNG so setInputFiles has real bytes to hand to createImageBitmap.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FABJfAlIeFTZTAAAAAElFTkSuQmCC';
const IMAGE_BUFFER = Buffer.from(PNG_BASE64, 'base64');

// Canned Anthropic-side response for the intercepted proxy.
const FIXTURE_DOC = {
  encoding: 'state',
  items: [
    { id: 'b1', kind: 'boundary', label: 'Untrusted zone', x: 380, y: 260, w: 340, h: 260, tint: 'amber' },
    { id: 'n1', kind: 'element', label: 'Web app', x: 100, y: 120, size: 'md', icon: 'shield' },
    { id: 'n2', kind: 'element', label: 'Database', x: 100, y: 300, size: 'md', icon: 'database' },
    { id: 'n3', kind: 'element', label: 'External API', x: 460, y: 340, size: 'md', color: 'red', icon: 'globe' },
    { id: 'c1', kind: 'connector', from: 'n1', to: 'n2', label: 'READS' },
    { id: 'c2', kind: 'connector', from: 'n1', to: 'n3', label: 'CALLS', dashed: true },
    { id: 'l1', kind: 'legend', x: 40, y: 40, encoding: 'State', rows: [['red', 'At risk'], ['amber', 'Untrusted']] },
  ],
};

test('generate-from-image: upload → preview → accept loads the diagram', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });

  // Intercept the proxy before the app boots.
  let receivedRequest: unknown = null;
  await page.route('**/api/generate', async (route, request) => {
    const body = request.postData();
    receivedRequest = body ? JSON.parse(body) : null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ doc: FIXTURE_DOC }),
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(DIR, 'gen-01-idle.png') });

  await page.locator('.tb-generate').click();
  await expect(page.locator('.generate-dialog')).toBeVisible();
  await page.screenshot({ path: join(DIR, 'gen-02-dialog-open.png') });

  await page.locator('.gd-file').setInputFiles({
    name: 'sample.png', mimeType: 'image/png', buffer: IMAGE_BUFFER,
  });

  // Preprocessing needs a tick; the Generate button becomes enabled once done.
  await expect(page.locator('.gd-generate')).toBeEnabled();
  await page.locator('.gd-hint').fill('Show storage inside the untrusted zone');
  await page.screenshot({ path: join(DIR, 'gen-03-ready.png') });

  await page.locator('.gd-generate').click();

  await expect(page.locator('.gd-preview svg')).toBeVisible();
  // The preview should carry items from the fixture.
  const previewItems = page.locator('.gd-preview svg rect');
  expect(await previewItems.count()).toBeGreaterThan(0);
  await page.screenshot({ path: join(DIR, 'gen-04-preview.png') });

  // Sanity: the request the proxy received forwarded the image + hint.
  expect(receivedRequest).toBeTruthy();
  const req = receivedRequest as { image?: { data?: string; media?: string }; hint?: string };
  expect(req.image?.media).toMatch(/^image\/jpeg$/);
  expect(typeof req.image?.data).toBe('string');
  expect((req.image?.data ?? '').length).toBeGreaterThan(0);
  expect(req.hint).toContain('untrusted zone');

  await page.locator('.gd-accept').click();
  await expect(page.locator('.generate-dialog[open]')).toHaveCount(0);

  // Distinct item ids: 7 (b1, n1, n2, n3, c1, c2, l1). Note that a
  // labelled connector emits two <g data-item-id> wrappers (path + pill),
  // so we count unique ids rather than DOM nodes.
  const uniqueIds = await page.locator('.canvas-svg [data-item-id]').evaluateAll((els) =>
    Array.from(new Set(els.map((el) => (el as SVGElement).getAttribute('data-item-id'))))
  );
  expect(uniqueIds).toHaveLength(7);
  await page.screenshot({ path: join(DIR, 'gen-05-loaded.png') });
});

test('generate-from-image: accept confirms before overwriting a non-empty canvas', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });

  await page.route('**/api/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ doc: FIXTURE_DOC }),
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Place a manual element first — this is the "current canvas" that we
  // must not silently overwrite.
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);

  // Answer the confirm dialog automatically.
  let confirmSeen = false;
  page.on('dialog', (d) => { confirmSeen = true; void d.accept(); });

  await page.locator('.tb-generate').click();
  await page.locator('.gd-file').setInputFiles({
    name: 'sample.png', mimeType: 'image/png', buffer: IMAGE_BUFFER,
  });
  await expect(page.locator('.gd-generate')).toBeEnabled();
  await page.locator('.gd-generate').click();
  await expect(page.locator('.gd-preview svg')).toBeVisible();
  await page.locator('.gd-accept').click();

  // Confirm was raised, and the canvas was replaced only after we accepted.
  expect(confirmSeen).toBe(true);
  const uniqueIds = await page.locator('.canvas-svg [data-item-id]').evaluateAll((els) =>
    Array.from(new Set(els.map((el) => (el as SVGElement).getAttribute('data-item-id'))))
  );
  expect(uniqueIds).toHaveLength(7);
});

test('generate-from-image: discard clears the preview and leaves the canvas alone', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });

  await page.route('**/api/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ doc: FIXTURE_DOC }),
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Existing canvas has one element.
  const canvas = page.locator('.canvas-svg');
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas not laid out');
  await page.locator('.palette-btn[data-add="element:md"]').click();
  await page.mouse.click(cb.x + 200, cb.y + 200);

  await page.locator('.tb-generate').click();
  await page.locator('.gd-file').setInputFiles({
    name: 'sample.png', mimeType: 'image/png', buffer: IMAGE_BUFFER,
  });
  await expect(page.locator('.gd-generate')).toBeEnabled();
  await page.locator('.gd-generate').click();
  await expect(page.locator('.gd-preview svg')).toBeVisible();

  await page.locator('.gd-discard').click();

  // Dialog reset to upload state, preview gone, canvas unchanged.
  await expect(page.locator('.gd-preview')).toHaveCount(0);
  await expect(page.locator('.gd-drop')).toBeVisible();
  await expect(page.locator('.canvas-svg [data-item-id]')).toHaveCount(1);
});
