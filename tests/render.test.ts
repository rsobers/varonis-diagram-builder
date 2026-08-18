import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '../src/render';
import { example1 } from '../src/fixtures/example1';
import { example2 } from '../src/fixtures/example2';
import { example3 } from '../src/fixtures/example3';

/**
 * Snapshot tests are the backbone. Any change to spacing, padding, or wrapping
 * shows up as a diff in review. Snapshots were generated once, reviewed
 * visually against docs/example-{1,2}-v2.svg, and then treated as golden.
 *
 * Vendor mark inlining: in production Vite auto-embeds small (<4KB) asset
 * files as data URLs (its assetsInlineLimit default). Under Vitest we get
 * plain URL strings back from `?url` glob queries — so the snapshots
 * wouldn't otherwise look like what the browser exports. `inlineMarkAssets`
 * post-processes the SVG to replace those URLs with real data URLs, so a
 * committed snapshot is self-contained and previews correctly on GitHub
 * or in the HTML style guide.
 */
const MIME: Record<string, string> = {
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', svg: 'image/svg+xml',
};
function inlineMarkAssets(svg: string): string {
  const assetsRoot = join(__dirname, '..');
  return svg.replace(/href="(\/assets\/logos\/[^"]+)"/g, (_full, urlPath: string) => {
    const ext = (urlPath.split('.').pop() ?? '').toLowerCase();
    const mime = MIME[ext];
    if (!mime) return `href="${urlPath}"`;
    const buf = readFileSync(join(assetsRoot, urlPath));
    const b64 = buf.toString('base64');
    return `href="data:${mime};base64,${b64}"`;
  });
}

describe('render(example1)', () => {
  const { svg, warnings } = render(example1);

  it('matches the committed snapshot', async () => {
    await expect(inlineMarkAssets(svg)).toMatchFileSnapshot('./__snapshots__/example-1.svg');
  });

  // CLAUDE.md: fit warnings must fail CI.
  it('produces zero fit warnings', () => {
    expect(warnings).toEqual([]);
  });

  it('starts with a valid SVG root element', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });
});

describe('render(example2)', () => {
  const { svg, warnings } = render(example2);

  it('matches the committed snapshot', async () => {
    await expect(inlineMarkAssets(svg)).toMatchFileSnapshot('./__snapshots__/example-2.svg');
  });

  it('produces zero fit warnings', () => {
    expect(warnings).toEqual([]);
  });
});

describe('render(example3)', () => {
  const { svg, warnings } = render(example3);

  it('matches the committed snapshot', async () => {
    await expect(inlineMarkAssets(svg)).toMatchFileSnapshot('./__snapshots__/example-3.svg');
  });

  it('produces zero fit warnings', () => {
    expect(warnings).toEqual([]);
  });
});

describe('render(interactive)', () => {
  it('does not emit data-item-id by default', () => {
    const { svg } = render(example1);
    expect(svg).not.toContain('data-item-id');
  });

  it('wraps each item in <g data-item-id="…"> when interactive: true', () => {
    const { svg } = render(example1, { interactive: true });
    for (const item of example1.items) {
      expect(svg).toContain(`data-item-id="${item.id}"`);
    }
  });
});
