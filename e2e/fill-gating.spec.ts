import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });

/**
 * Verifies §6.3: the palette exposes exactly the colors allowed under the
 * current encoding — white/gray always, blue under Ownership/Emphasis,
 * red/amber/green only under State (blue drops under State per §6.3.1).
 */
test('fill gating per encoding', async ({ page }) => {
  page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?blank=1');
  await page.waitForLoadState('networkidle');

  async function paletteSwatches(): Promise<string[]> {
    return await page.$$eval('.palette .swatches .swatch', (els) =>
      els.map((el) => (el as HTMLElement).dataset.fill ?? ''),
    );
  }

  // No encoding.
  await expect(page.locator('.tb-encoding')).toHaveValue('');
  await page.screenshot({ path: join(DIR, 'gate-none.png') });
  expect(await paletteSwatches()).toEqual(['white', 'gray']);

  // Ownership.
  await page.locator('.tb-encoding').selectOption('ownership');
  await page.screenshot({ path: join(DIR, 'gate-ownership.png') });
  expect(await paletteSwatches()).toEqual(['white', 'gray', 'blue']);

  // Emphasis.
  await page.locator('.tb-encoding').selectOption('emphasis');
  await page.screenshot({ path: join(DIR, 'gate-emphasis.png') });
  expect(await paletteSwatches()).toEqual(['white', 'gray', 'blue']);

  // State — blue drops, tints appear.
  await page.locator('.tb-encoding').selectOption('state');
  await page.screenshot({ path: join(DIR, 'gate-state.png') });
  expect(await paletteSwatches()).toEqual(['white', 'gray', 'red', 'amber', 'green']);
});
