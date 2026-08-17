/**
 * Width-aware text measurement, ported from reference/v2.py.
 *
 * The wrap logic in v1 counted characters, which is why some 24-char labels
 * fit and others overflowed by 25px. These bucket widths approximate a system
 * sans-serif at the given point size closely enough to catch overflow at
 * build time.
 */

const NARROW = new Set("iljt.,:;'!|[]()");
const SEMI_NARROW = new Set('fr ');
const WIDE = new Set('mw');
const EXTRA_WIDE = new Set('MW@');

export function charWidth(ch: string, size: number): number {
  let f: number;
  if (NARROW.has(ch)) f = 0.30;
  else if (SEMI_NARROW.has(ch)) f = 0.36;
  else if (WIDE.has(ch)) f = 0.85;
  else if (EXTRA_WIDE.has(ch)) f = 0.95;
  else if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) f = 0.62;
  else f = 0.55;
  return f * size;
}

export function textWidth(s: string, size = 12.5): number {
  let sum = 0;
  for (const ch of s) sum += charWidth(ch, size);
  return sum;
}

export type WrapResult = { lines: string[]; warnings: string[] };

/**
 * Greedy width-aware wrap. Truncates at 3 lines (spec §3.1 max) and warns
 * when a single line still overflows after wrapping.
 */
export function wrap(text: string, maxPx: number, size = 12.5, label = ''): WrapResult {
  const warnings: string[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [''], warnings };

  const out: string[] = [];
  let cur = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    if (textWidth(cur + ' ' + w, size) <= maxPx) {
      cur += ' ' + w;
    } else {
      out.push(cur);
      cur = w;
    }
  }
  out.push(cur);

  for (const ln of out) {
    if (textWidth(ln, size) > maxPx) {
      warnings.push(`"${ln}" overflows its element (${label || text})`);
    }
  }
  if (out.length > 3) {
    warnings.push(`"${text}" exceeds 3 lines and was truncated`);
  }
  return { lines: out.slice(0, 3), warnings };
}
