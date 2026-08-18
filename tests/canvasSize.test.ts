import { describe, it, expect } from 'vitest';
import {
  clampCanvasSize, contentExtent,
  CANVAS_MIN_W, CANVAS_MIN_H, CANVAS_MAX_W, CANVAS_MAX_H,
} from '../src/canvasSize';
import { reduce, initialState } from '../src/editorState';
import { withIds, type DiagramDoc, type Item, type ItemDraft } from '../src/model';

function doc(items: ItemDraft[] = [], width = 1200, height = 800): DiagramDoc {
  return { version: 2, width, height, items: withIds(items) as unknown as Item[] };
}

const elementAt = (x: number, y: number): ItemDraft =>
  ({ kind: 'element', x, y, label: 'Box', size: 'sm', color: 'white' } as ItemDraft);

describe('contentExtent', () => {
  it('is zero for an empty doc', () => {
    expect(contentExtent([])).toEqual({ w: 0, h: 0 });
  });

  it('reaches the far edge of the furthest item', () => {
    const d = doc([elementAt(0, 0), elementAt(400, 300)]);
    const ext = contentExtent(d.items);
    expect(ext.w).toBeGreaterThan(400);
    expect(ext.h).toBeGreaterThan(300);
  });

  it('rounds up to the grid', () => {
    const d = doc([elementAt(5, 5)]);
    const ext = contentExtent(d.items);
    expect(ext.w % 10).toBe(0);
    expect(ext.h % 10).toBe(0);
  });

  it('ignores connectors, which have no independent geometry', () => {
    const d = doc([elementAt(0, 0), elementAt(100, 100)]);
    const [a, b] = d.items;
    const withConnector = [...d.items, { id: 'c1', kind: 'connector', from: a!.id, to: b!.id } as Item];
    expect(contentExtent(withConnector)).toEqual(contentExtent(d.items));
  });
});

describe('clampCanvasSize', () => {
  it('snaps to the 10px grid', () => {
    const r = clampCanvasSize(1234, 807, doc());
    expect(r.width).toBe(1230);
    expect(r.height).toBe(810);
  });

  it('clamps to the hard minimum on an empty canvas', () => {
    const r = clampCanvasSize(10, 10, doc());
    expect(r).toEqual({ width: CANVAS_MIN_W, height: CANVAS_MIN_H });
  });

  it('clamps to the hard maximum', () => {
    const r = clampCanvasSize(99999, 99999, doc());
    expect(r).toEqual({ width: CANVAS_MAX_W, height: CANVAS_MAX_H });
  });

  it('will not shrink below the content already placed', () => {
    const d = doc([elementAt(900, 600)]);
    const ext = contentExtent(d.items);
    const r = clampCanvasSize(CANVAS_MIN_W, CANVAS_MIN_H, d);
    expect(r.width).toBe(ext.w);
    expect(r.height).toBe(ext.h);
  });

  it('shrink-wraps to exactly the content extent when asked for 0×0', () => {
    const d = doc([elementAt(900, 600)]);
    const ext = contentExtent(d.items);
    expect(clampCanvasSize(0, 0, d)).toEqual({ width: ext.w, height: ext.h });
  });

  it('still allows growth when content sets a high floor', () => {
    const d = doc([elementAt(900, 600)]);
    const r = clampCanvasSize(2000, 1500, d);
    expect(r).toEqual({ width: 2000, height: 1500 });
  });

  it('falls back to the current dimension for non-finite input', () => {
    const d = doc([], 1200, 800);
    expect(clampCanvasSize(Number.NaN, Number.NaN, d)).toEqual({ width: 1200, height: 800 });
  });

  it('never lets the content floor exceed the hard maximum', () => {
    const d = doc([elementAt(CANVAS_MAX_W + 500, CANVAS_MAX_H + 500)]);
    const r = clampCanvasSize(100, 100, d);
    expect(r.width).toBeLessThanOrEqual(CANVAS_MAX_W);
    expect(r.height).toBeLessThanOrEqual(CANVAS_MAX_H);
  });
});

describe('setCanvasSize reducer', () => {
  it('resizes the doc', () => {
    const s = reduce(initialState(doc()), { kind: 'setCanvasSize', width: 1600, height: 1000 });
    expect(s.doc.width).toBe(1600);
    expect(s.doc.height).toBe(1000);
  });

  it('clamps rather than trusting the caller', () => {
    const s = reduce(initialState(doc()), { kind: 'setCanvasSize', width: 5, height: 5 });
    expect(s.doc.width).toBe(CANVAS_MIN_W);
    expect(s.doc.height).toBe(CANVAS_MIN_H);
  });

  it('is a no-op — same state reference — when the size is unchanged', () => {
    const before = initialState(doc());
    const after = reduce(before, { kind: 'setCanvasSize', width: 1200, height: 800 });
    expect(after).toBe(before);
  });

  it('does not push an undo entry for a no-op resize', () => {
    let s = initialState(doc());
    s = reduce(s, { kind: 'setCanvasSize', width: 1200, height: 800 });
    // 1204 snaps to 1200 — same size, so still nothing to undo.
    s = reduce(s, { kind: 'setCanvasSize', width: 1204, height: 800 });
    expect(s.undoStack).toHaveLength(0);
  });

  it('is undoable as a single step', () => {
    let s = initialState(doc());
    s = reduce(s, { kind: 'setCanvasSize', width: 1600, height: 1000 });
    expect(s.undoStack).toHaveLength(1);
    s = reduce(s, { kind: 'undo' });
    expect(s.doc.width).toBe(1200);
    expect(s.doc.height).toBe(800);
    s = reduce(s, { kind: 'redo' });
    expect(s.doc.width).toBe(1600);
  });

  it('leaves items untouched — resizing never moves the diagram', () => {
    const d = doc([elementAt(300, 200)]);
    const s = reduce(initialState(d), { kind: 'setCanvasSize', width: 400, height: 300 });
    expect(s.doc.items).toEqual(d.items);
  });
});
