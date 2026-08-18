import { describe, it, expect } from 'vitest';
import { render } from '../src/render';
import { example1 } from '../src/fixtures/example1';
import { example2 } from '../src/fixtures/example2';
import { example3 } from '../src/fixtures/example3';

/**
 * Snapshot tests are the backbone. Any change to spacing, padding, or wrapping
 * shows up as a diff in review. Snapshots were generated once, reviewed
 * visually against docs/example-{1,2}-v2.svg, and then treated as golden.
 */

describe('render(example1)', () => {
  const { svg, warnings } = render(example1);

  it('matches the committed snapshot', async () => {
    await expect(svg).toMatchFileSnapshot('./__snapshots__/example-1.svg');
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
    await expect(svg).toMatchFileSnapshot('./__snapshots__/example-2.svg');
  });

  it('produces zero fit warnings', () => {
    expect(warnings).toEqual([]);
  });
});

describe('render(example3)', () => {
  const { svg, warnings } = render(example3);

  it('matches the committed snapshot', async () => {
    await expect(svg).toMatchFileSnapshot('./__snapshots__/example-3.svg');
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
