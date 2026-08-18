import { describe, it, expect } from 'vitest';
import { layout, bbox } from '../src/layout';
import { withIds, type Item } from '../src/model';
import { example1 } from '../src/fixtures/example1';

describe('bbox', () => {
  it('sizes an Element by its size token', () => {
    // sm = 150×34, md = 180×64, lg = 180×92
    expect(bbox({ id: 'a', kind: 'element', x: 10, y: 20, label: 'x' })).toEqual(
      { x: 10, y: 20, w: 150, h: 34 }
    );
    expect(bbox({ id: 'b', kind: 'element', x: 10, y: 20, label: 'x', size: 'md' })).toEqual(
      { x: 10, y: 20, w: 180, h: 64 }
    );
    expect(bbox({ id: 'c', kind: 'element', x: 10, y: 20, label: 'x', size: 'lg' })).toEqual(
      { x: 10, y: 20, w: 180, h: 92 }
    );
  });

  it('gives an Actor a bbox that includes icon + label', () => {
    // Short label fits the 32-icon width; bbox stays icon-centred at min.
    const shortActor = bbox({ id: 'a', kind: 'actor', cx: 100, y: 50, label: 'A' });
    expect(shortActor.h).toBe(54); // icon 32 + gap + label baseline area
    expect(shortActor.w).toBe(32); // icon width dominates

    // Longer label widens the bbox horizontally so hit-testing covers it.
    const wideActor = bbox({ id: 'a', kind: 'actor', cx: 100, y: 50, label: 'Very long user name' });
    expect(wideActor.w).toBeGreaterThan(32);
    // Centred on cx=100.
    expect(wideActor.x + wideActor.w / 2).toBe(100);
  });

  it('sizes a Boundary directly from its w/h', () => {
    expect(
      bbox({ id: 'b', kind: 'boundary', x: 0, y: 0, w: 300, h: 200, label: 'Zone' })
    ).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });

  it('grows a Grouped element with child count', () => {
    const one = bbox({ id: 'g', kind: 'grouped', x: 0, y: 0, label: 'x', children: [{ label: 'a' }] });
    const three = bbox({
      id: 'g', kind: 'grouped', x: 0, y: 0, label: 'x',
      children: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
    });
    // Header 46 + n*30 + (n-1)*5 + 10; 1 child → 86; 3 children → 156
    expect(one.h).toBe(86);
    expect(three.h).toBe(156);
    expect(one.w).toBe(180);
  });

  it('enforces InlineControl min width', () => {
    const tiny = bbox({ id: 'c', kind: 'inlineControl', x: 0, y: 0, label: 'x' });
    expect(tiny.w).toBe(90);
    expect(tiny.h).toBe(36);
  });
});

describe('layout', () => {
  it('returns one bbox per item, keyed by id', () => {
    const map = layout(example1);
    expect(map.size).toBe(example1.items.length);
    for (const item of example1.items) {
      expect(map.has(item.id)).toBe(true);
    }
  });

  it('resolves connector bboxes from endpoint bboxes', () => {
    const doc = {
      version: 2 as const,
      width: 500, height: 500,
      items: withIds([
        { kind: 'element' as const, x: 0, y: 0, label: 'A' },
        { kind: 'element' as const, x: 300, y: 200, label: 'B' },
        { kind: 'connector' as const, from: 'i0', to: 'i1' },
      ]) as Item[],
    };
    const map = layout(doc);
    const box = map.get('i2');
    expect(box).toBeDefined();
    // The straight route runs from A's right edge midpoint to B's left edge
    // midpoint. That gives a rect spanning that horizontal run.
    expect(box!.w).toBeGreaterThan(0);
    expect(box!.h).toBeGreaterThanOrEqual(0);
  });

  it('drops connectors whose endpoints are missing', () => {
    const doc = {
      version: 2 as const,
      width: 500, height: 500,
      items: withIds([
        { kind: 'element' as const, x: 0, y: 0, label: 'A' },
        { kind: 'connector' as const, from: 'i0', to: 'does-not-exist' },
      ]) as Item[],
    };
    const map = layout(doc);
    expect(map.has('i1')).toBe(false);
  });

  it('handles withIds-generated fixtures without collision', () => {
    const doc = {
      version: 2 as const,
      width: 100, height: 100,
      items: withIds([
        { kind: 'element' as const, x: 0, y: 0, label: 'a' },
        { kind: 'element' as const, x: 0, y: 0, label: 'b' },
      ]),
    };
    const map = layout(doc);
    expect(map.size).toBe(2);
    expect(map.get('i0')).toBeDefined();
    expect(map.get('i1')).toBeDefined();
  });
});
