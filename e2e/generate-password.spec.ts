import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FABJfAlIeFTZTAAAAAElFTkSuQmCC';
const IMAGE_BUFFER = Buffer.from(PNG_BASE64, 'base64');

const FIXTURE_DOC = {
  encoding: null,
  items: [{ id: 'n1', kind: 'element', label: 'Placeholder', x: 100, y: 100, size: 'md' }],
};

// A route factory that only accepts `expected` as the password.
async function gatedRoute(page: import('@playwright/test').Page, expected: string) {
  await page.route('**/api/generate', async (route, request) => {
    const raw = request.postData();
    const body = raw ? JSON.parse(raw) : {};
    if (body.password !== expected) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Password required to use image-to-diagram on this deployment.' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ doc: FIXTURE_DOC }),
    });
  });
}

test('generate: wrong password → 401 surfaced as inline error, dialog stays open', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await gatedRoute(page, 'letmein');
  // Ensure no lingering saved password from previous runs.
  await page.addInitScript(() => localStorage.removeItem('vdb.generate.password'));

  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');
  await page.locator('.tb-generate').click();
  await page.locator('.gd-file').setInputFiles({
    name: 'sample.png', mimeType: 'image/png', buffer: IMAGE_BUFFER,
  });
  await expect(page.locator('.gd-generate')).toBeEnabled();

  await page.locator('.gd-password').fill('wrong');
  await page.locator('.gd-generate').click();

  await expect(page.locator('.gd-error')).toContainText(/password/i);
  // Preview must NOT appear.
  await expect(page.locator('.gd-preview')).toHaveCount(0);
  await page.screenshot({ path: join(DIR, 'password-wrong.png') });
});

test('generate: right password → preview appears, password persists to localStorage', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await gatedRoute(page, 'letmein');
  await page.addInitScript(() => localStorage.removeItem('vdb.generate.password'));

  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');
  await page.locator('.tb-generate').click();
  await page.locator('.gd-file').setInputFiles({
    name: 'sample.png', mimeType: 'image/png', buffer: IMAGE_BUFFER,
  });
  await expect(page.locator('.gd-generate')).toBeEnabled();

  await page.locator('.gd-password').fill('letmein');
  await page.locator('.gd-generate').click();
  await expect(page.locator('.gd-preview svg')).toBeVisible();
  await page.screenshot({ path: join(DIR, 'password-right.png') });

  // localStorage has the successful password.
  const stored = await page.evaluate(() => localStorage.getItem('vdb.generate.password'));
  expect(stored).toBe('letmein');

  // Reopen the dialog — password field prefilled.
  await page.locator('.gd-discard').click();
  const prefilled = await page.locator('.gd-password').inputValue();
  expect(prefilled).toBe('letmein');
});
