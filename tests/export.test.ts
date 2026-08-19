import { describe, it, expect } from 'vitest';
import { exportSvg, suggestedFilename, contentViewBox } from '../src/export';
import type { DiagramDoc } from '../src/model';

const EMPTY: DiagramDoc = { version: 2, width: 1200, height: 800, items: [] };

describe('suggestedFilename', () => {
  it('falls back to "diagram" when title is missing', () => {
    expect(suggestedFilename(EMPTY, 'svg')).toBe('diagram.svg');
    expect(suggestedFilename(EMPTY, 'png')).toBe('diagram.png');
  });

  it('slugifies the title', () => {
    const doc: DiagramDoc = { ...EMPTY, title: ['Varonis SaaS Platform (2026)', 'sub'] };
    expect(suggestedFilename(doc, 'svg')).toBe('varonis-saas-platform-2026.svg');
  });

  it('handles all-symbol titles cleanly', () => {
    const doc: DiagramDoc = { ...EMPTY, title: ['!!!', 'sub'] };
    expect(suggestedFilename(doc, 'png')).toBe('diagram.png');
  });
});

describe('contentViewBox', () => {
  it('falls back to doc dimensions when the diagram is empty', () => {
    expect(contentViewBox(EMPTY)).toEqual({ x: 0, y: 0, w: 1200, h: 800 });
  });

  it('crops to the union of item bboxes plus 40px padding on all sides', () => {
    const doc: DiagramDoc = {
      version: 2, width: 1200, height: 800,
      items: [
        { id: 'a', kind: 'element', x: 200, y: 300, label: 'A' },   // sm: 150x34
        { id: 'b', kind: 'element', x: 500, y: 400, label: 'B' },   // sm: 150x34
      ],
    };
    const vb = contentViewBox(doc);
    // Union: (200..650) x (300..434). +40 padding each side.
    expect(vb).toEqual({ x: 160, y: 260, w: 530, h: 214 });
  });

  it('clamps to non-negative coordinates', () => {
    const doc: DiagramDoc = {
      version: 2, width: 1200, height: 800,
      items: [{ id: 'a', kind: 'element', x: 20, y: 20, label: 'A' }],
    };
    const vb = contentViewBox(doc);
    expect(vb.x).toBe(0);
    expect(vb.y).toBe(0);
  });

  it('expands the crop upward to include the doc title strip', () => {
    // Item well below the title (y=300). Without the title in the union,
    // export would crop to (y=260, h=214) and clip the title text at y=42.
    const doc: DiagramDoc = {
      version: 2, width: 1200, height: 800,
      title: ['Example title', 'Some subtitle explaining the diagram'],
      items: [{ id: 'a', kind: 'element', x: 200, y: 300, label: 'A' }],
    };
    const vb = contentViewBox(doc);
    // Title strip top is y=28; export padding lifts to 0 (clamped).
    expect(vb.y).toBe(0);
    // Bottom of items (334) + 40 padding = 374; total h reflects that.
    expect(vb.y + vb.h).toBeGreaterThanOrEqual(374);
  });

  it('does not expand the crop when the doc has no title', () => {
    const doc: DiagramDoc = {
      version: 2, width: 1200, height: 800,
      items: [{ id: 'a', kind: 'element', x: 200, y: 300, label: 'A' }],
    };
    const vb = contentViewBox(doc);
    expect(vb.y).toBe(260); // 300 - 40 padding
  });
});

describe('exportSvg', () => {
  it('produces a Blob with type image/svg+xml and non-empty body', async () => {
    const blob = exportSvg(EMPTY);
    expect(blob.type).toMatch(/svg\+xml/);
    const text = await blob.text();
    expect(text.startsWith('<svg')).toBe(true);
    expect(text.endsWith('</svg>')).toBe(true);
  });

  it('emits the standard white background (matches editor rendering)', async () => {
    const blob = exportSvg(EMPTY);
    const text = await blob.text();
    expect(text).toContain('fill="#ffffff"');
  });

  it('does not carry interactive data-item-id wrappers', async () => {
    const doc: DiagramDoc = {
      version: 2, width: 1200, height: 800,
      items: [{ id: 'x', kind: 'element', x: 0, y: 0, label: 'X' }],
    };
    const blob = exportSvg(doc);
    const text = await blob.text();
    expect(text).not.toContain('data-item-id');
  });
});
