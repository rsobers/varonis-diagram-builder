import { describe, it, expect } from 'vitest';
import { buildCopy, buildPaste } from '../src/copyPaste';
import { withIds, type Item, type ItemDraft } from '../src/model';

function docWith<T extends ItemDraft>(items: T[]) {
  return { version: 2 as const, width: 800, height: 600, items: withIds(items) as unknown as Item[] };
}

const seqNewId = () => {
  let n = 0;
  return () => `new${++n}`;
};

describe('buildCopy', () => {
  it('includes selected items but drops connectors with unselected endpoints', () => {
    const doc = docWith([
      { kind: 'element', x: 0, y: 0, label: 'A' },   // i0
      { kind: 'element', x: 200, y: 0, label: 'B' }, // i1
      { kind: 'element', x: 400, y: 0, label: 'C' }, // i2
      { kind: 'connector', from: 'i0', to: 'i1' },   // i3 — both endpoints selected
      { kind: 'connector', from: 'i1', to: 'i2' },   // i4 — one endpoint outside
    ]);
    const copied = buildCopy(doc, new Set(['i0', 'i1', 'i3', 'i4']));
    // Expect i0, i1, i3 (both endpoints in selection). i4 drops out because
    // i2 isn't selected.
    expect(copied.map((it) => it.id)).toEqual(['i0', 'i1', 'i3']);
  });
});

describe('buildPaste', () => {
  it('remaps ids and connector endpoints', () => {
    const doc = docWith([
      { kind: 'element', x: 100, y: 100, label: 'A' },
      { kind: 'element', x: 300, y: 100, label: 'B' },
      { kind: 'connector', from: 'i0', to: 'i1' },
    ]);
    const copied = buildCopy(doc, new Set(['i0', 'i1', 'i2']));
    const paste = buildPaste(copied, 10, 10, seqNewId());
    expect(paste.items.map((it) => it.id)).toEqual(['new1', 'new2', 'new3']);
    // Elements got offset.
    const a = paste.items[0] as { x: number; y: number };
    const b = paste.items[1] as { x: number; y: number };
    expect([a.x, a.y]).toEqual([110, 110]);
    expect([b.x, b.y]).toEqual([310, 110]);
    // Connector remapped to the new ids.
    const c = paste.items[2] as { from: string; to: string };
    expect(c.from).toBe('new1');
    expect(c.to).toBe('new2');
  });

  it('offsets an actor by cx/y not x/y', () => {
    const doc = docWith([{ kind: 'actor', cx: 50, y: 60, label: 'u' }]);
    const paste = buildPaste(buildCopy(doc, new Set(['i0'])), 10, 10, seqNewId());
    const a = paste.items[0] as { cx: number; y: number };
    expect([a.cx, a.y]).toEqual([60, 70]);
  });
});
