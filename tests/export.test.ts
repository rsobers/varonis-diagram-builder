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
