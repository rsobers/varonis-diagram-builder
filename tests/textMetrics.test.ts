import { describe, it, expect } from 'vitest';
import { charWidth, textWidth, wrap } from '../src/textMetrics';

describe('charWidth', () => {
  it('classifies characters into the expected buckets', () => {
    // Narrow: i, l, j, punctuation
    expect(charWidth('i', 10)).toBeCloseTo(3.0);
    expect(charWidth('.', 10)).toBeCloseTo(3.0);
    // Semi-narrow: f, r, space
    expect(charWidth('f', 10)).toBeCloseTo(3.6);
    expect(charWidth(' ', 10)).toBeCloseTo(3.6);
    // Wide: m, w
    expect(charWidth('m', 10)).toBeCloseTo(8.5);
    // Extra-wide: M, W, @
    expect(charWidth('M', 10)).toBeCloseTo(9.5);
    // Uppercase / digit fallback
    expect(charWidth('A', 10)).toBeCloseTo(6.2);
    expect(charWidth('7', 10)).toBeCloseTo(6.2);
    // Lowercase default
    expect(charWidth('a', 10)).toBeCloseTo(5.5);
  });

  it('scales linearly with size', () => {
    expect(charWidth('a', 20)).toBeCloseTo(charWidth('a', 10) * 2);
  });
});

describe('textWidth', () => {
  it('sums per-character widths', () => {
    // "iM" at 10px = 3.0 + 9.5 = 12.5
    expect(textWidth('iM', 10)).toBeCloseTo(12.5);
  });

  it('makes two same-length strings measurably different', () => {
    // The whole reason we're doing width-aware wrapping: character count lies.
    const wide = textWidth('MMMMMMMMMM', 12.5);
    const narrow = textWidth('iiiiiiiiii', 12.5);
    expect(wide).toBeGreaterThan(narrow);
    expect(wide - narrow).toBeGreaterThan(20);
  });
});

describe('wrap', () => {
  it('returns the input as a single line when it fits', () => {
    const r = wrap('Short label', 500);
    expect(r.lines).toEqual(['Short label']);
    expect(r.warnings).toEqual([]);
  });

  it('wraps at word boundaries under the width budget', () => {
    const r = wrap('one two three four', 40, 12.5);
    expect(r.lines.length).toBeGreaterThan(1);
    for (const line of r.lines) {
      expect(textWidth(line, 12.5)).toBeLessThanOrEqual(40);
    }
  });

  it('warns and truncates when wrap produces more than 3 lines', () => {
    // Force each word onto its own line by using a tiny budget.
    const r = wrap('one two three four five', 20, 12.5, 'test-label');
    expect(r.lines.length).toBe(3);
    expect(r.warnings.some((w) => w.includes('exceeds 3 lines'))).toBe(true);
  });

  it('warns when a single unbreakable word overflows', () => {
    const r = wrap('superduperlongword', 20, 12.5, 'test-label');
    expect(r.warnings.some((w) => w.includes('overflows'))).toBe(true);
  });

  it('handles empty input without throwing', () => {
    const r = wrap('', 100);
    expect(r.lines).toEqual(['']);
    expect(r.warnings).toEqual([]);
  });
});
