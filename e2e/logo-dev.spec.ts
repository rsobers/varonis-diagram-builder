import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

// 10x10 red PNG (base64). Stand-in for logo.dev's response so the test is
// hermetic (no network, no real token required).
const FIXTURE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FABJfAlIeFTZTAAAAAElFTkSuQmCC';

test('add a vendor mark by domain via logo.dev → available in the palette', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });

  // Intercept logo.dev before the app boots and return a canned PNG.
  await page.route('**/img.logo.dev/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(FIXTURE_PNG_BASE64, 'base64'),
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Scroll to the Vendor marks section and type a domain.
  await page.locator('.palette h3', { hasText: 'Vendor marks' }).scrollIntoViewIfNeeded();
  const input = page.locator('.palette-add-mark-input');
  await input.fill('databricks.com');

  const marksBefore = await page.locator('.palette [data-mark]').count();
  await page.locator('.palette-add-mark-btn').click();

  // Success status appears; new entry shows in the list.
  await expect(page.locator('.palette').getByText(/Added .+/)).toBeVisible();
  await expect(page.locator('.palette [data-mark="databricks-com"]')).toBeVisible();
  const marksAfter = await page.locator('.palette [data-mark]').count();
  expect(marksAfter).toBe(marksBefore + 1);
  await page.screenshot({ path: join(DIR, 'logo-dev-added.png') });

  // Place it and confirm the element renders with the fetched mark.
  await page.locator('.palette [data-mark="databricks-com"]').click();
  const cb = await page.locator('.canvas-svg').boundingBox();
  if (!cb) throw new Error('canvas missing');
  await page.mouse.click(cb.x + 300, cb.y + 200);
  await expect(page.locator('.canvas-svg [data-item-id] image')).toHaveCount(1);
});

test('logo.dev failure surfaces a clear error in the palette', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });

  // Force logo.dev to fail so we can verify the error UI.
  await page.route('**/img.logo.dev/**', async (route) => {
    await route.fulfill({ status: 500, contentType: 'text/plain', body: 'oops' });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('.palette h3', { hasText: 'Vendor marks' }).scrollIntoViewIfNeeded();
  await page.locator('.palette-add-mark-input').fill('slack.com');
  await page.locator('.palette-add-mark-btn').click();
  await expect(page.locator('.palette-error')).toContainText(/Error/);
});
