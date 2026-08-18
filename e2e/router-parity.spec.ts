import { test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'screenshots');
mkdirSync(DIR, { recursive: true });
const ROOT = join(HERE, '..');

async function compareTwo(page: any, a: string, b: string, outFile: string) {
  const svgA = readFileSync(a, 'utf8');
  const svgB = readFileSync(b, 'utf8');
  const html = `<!doctype html><meta charset=utf-8><style>
    body { margin:0; font:14px system-ui; background:#f4f6f8 }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:12px }
    .card { background:white; border:1px solid #d3d9e0; border-radius:8px; padding:10px }
    .card h2 { margin:0 0 8px; font-size:13px; color:#5a6570 }
    svg { max-width:100%; height:auto; display:block }
  </style>
  <div class=row>
    <div class=card><h2>Python reference (docs/${a.split('/').pop()})</h2>${svgA}</div>
    <div class=card><h2>App renderer (tests/__snapshots__/${b.split('/').pop()})</h2>${svgB}</div>
  </div>`;
  await page.setContent(html);
  await page.setViewportSize({ width: 2600, height: 1200 });
  await page.screenshot({ path: outFile, fullPage: true });
}

test('example 1: python reference vs app-renderer output side by side', async ({ page }) => {
  await compareTwo(
    page,
    join(ROOT, 'docs/example-1-v2.svg'),
    join(ROOT, 'tests/__snapshots__/example-1.svg'),
    join(DIR, 'example-1-compare.png'),
  );
});

test('example 2: python reference vs app-renderer output side by side', async ({ page }) => {
  await compareTwo(
    page,
    join(ROOT, 'docs/example-2-v2.svg'),
    join(ROOT, 'tests/__snapshots__/example-2.svg'),
    join(DIR, 'example-2-compare.png'),
  );
});
