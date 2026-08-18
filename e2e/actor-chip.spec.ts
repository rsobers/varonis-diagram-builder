import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

test('palette actor chips center vertically', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  // Screenshot just the ACTORS section.
  const actorHeader = page.locator('.palette h3', { hasText: 'Actors' });
  await actorHeader.scrollIntoViewIfNeeded();
  const clipTop = await actorHeader.evaluate((el) => el.getBoundingClientRect().top);
  await page.screenshot({
    path: join(DIR, 'actor-chip-fixed.png'),
    clip: { x: 0, y: clipTop - 4, width: 240, height: 120 },
  });
});
