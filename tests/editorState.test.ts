import { describe, it, expect } from 'vitest';
import {
  initialState, reduce, snapTo, createEditor, type EditorState,
} from '../src/editorState';
import { withIds, type DiagramDoc, type Item, type ItemDraft } from '../src/model';
import { namedIcon } from '../src/icons';

function docWith<T extends ItemDraft>(items: T[]): DiagramDoc {
  return { version: 1, width: 500, height: 500, items: withIds(items) as unknown as Item[] };
}

function seed(): EditorState {
  return initialState(docWith([
    { kind: 'element', x: 100, y: 100, label: 'A' },
    { kind: 'element', x: 200, y: 100, label: 'B' },
  ]));
}

describe('snapTo', () => {
  it('rounds to nearest grid multiple', () => {
    expect(snapTo(103, 10)).toBe(100);
    expect(snapTo(105, 10)).toBe(110);   // .5 rounds up
    expect(snapTo(-3, 10)).toBe(0);
    expect(snapTo(0, 10)).toBe(0);
  });
});

describe('reduce', () => {
  it('add: appends item and selects it', () => {
    const s = reduce(seed(), {
      kind: 'add',
      id: 'new',
      item: { kind: 'element', x: 300, y: 300, label: 'C' },
    });
    expect(s.doc.items).toHaveLength(3);
    expect(s.doc.items[2]!.id).toBe('new');
    expect([...s.selection]).toEqual(['new']);
  });

  it('add: clears placing', () => {
    const before: EditorState = {
      ...seed(),
      placing: { label: 'x', factory: () => ({ kind: 'actor', cx: 0, y: 0, label: 'x' }) },
    };
    const after = reduce(before, {
      kind: 'add', id: 'x', item: { kind: 'actor', cx: 0, y: 0, label: 'x' },
    });
    expect(after.placing).toBeNull();
  });

  it('update: undefined values remove the key entirely', () => {
    let s = initialState(docWith([
      { kind: 'element', x: 0, y: 0, label: 'A', icon: namedIcon('shield') },
    ]));
    s = reduce(s, { kind: 'update', id: 'i0', patch: { icon: undefined } });
    const item = s.doc.items[0] as Record<string, unknown>;
    expect('icon' in item).toBe(false);
  });

  it('update: merges patch into the matching item', () => {
    const s = reduce(seed(), { kind: 'update', id: 'i0', patch: { label: 'renamed' } });
    const item = s.doc.items.find((i) => i.id === 'i0');
    expect(item?.kind === 'element' && item.label).toBe('renamed');
    // untouched
    expect(s.doc.items.find((i) => i.id === 'i1')?.kind === 'element'
      && (s.doc.items.find((i) => i.id === 'i1') as { label: string }).label).toBe('B');
  });

  it('delete: removes items and prunes them from selection', () => {
    let s = reduce(seed(), { kind: 'select', ids: ['i0', 'i1'], mode: 'replace' });
    s = reduce(s, { kind: 'delete', ids: ['i0'] });
    expect(s.doc.items.map((i) => i.id)).toEqual(['i1']);
    expect([...s.selection]).toEqual(['i1']);
  });

  it('move: shifts x/y of every id in the set', () => {
    const s = reduce(seed(), { kind: 'move', ids: ['i0', 'i1'], dx: 10, dy: -5 });
    const a = s.doc.items[0] as { x: number; y: number };
    const b = s.doc.items[1] as { x: number; y: number };
    expect([a.x, a.y]).toEqual([110, 95]);
    expect([b.x, b.y]).toEqual([210, 95]);
  });

  it('move: is a no-op when dx=dy=0 (identity return)', () => {
    const before = seed();
    const after = reduce(before, { kind: 'move', ids: ['i0'], dx: 0, dy: 0 });
    expect(after).toBe(before);
  });

  it('move: translates Actor via cx, ZoneDivider via y1/y2, Edge via each point', () => {
    const s = initialState(docWith([
      { kind: 'actor', cx: 50, y: 60, label: 'u' },
      { kind: 'zoneDivider', x: 100, y1: 20, y2: 200, label: 'z' },
      { kind: 'edge', points: [[0, 0], [10, 10]] },
    ]));
    const moved = reduce(s, { kind: 'move', ids: ['i0', 'i1', 'i2'], dx: 5, dy: 7 });
    const actor = moved.doc.items[0] as { cx: number; y: number };
    const zd = moved.doc.items[1] as { x: number; y1: number; y2: number };
    const edge = moved.doc.items[2] as { points: Array<[number, number]> };
    expect([actor.cx, actor.y]).toEqual([55, 67]);
    expect([zd.x, zd.y1, zd.y2]).toEqual([105, 27, 207]);
    expect(edge.points).toEqual([[5, 7], [15, 17]]);
  });

  it('select: replace, add, toggle modes', () => {
    let s = seed();
    s = reduce(s, { kind: 'select', ids: ['i0'], mode: 'replace' });
    expect([...s.selection]).toEqual(['i0']);
    s = reduce(s, { kind: 'select', ids: ['i1'], mode: 'add' });
    expect(new Set(s.selection)).toEqual(new Set(['i0', 'i1']));
    s = reduce(s, { kind: 'select', ids: ['i0'], mode: 'toggle' });
    expect([...s.selection]).toEqual(['i1']);
    s = reduce(s, { kind: 'select', ids: ['i0'], mode: 'toggle' });
    expect(new Set(s.selection)).toEqual(new Set(['i0', 'i1']));
  });

  it('setPlacing / setSnap flip the corresponding fields', () => {
    const s0 = seed();
    const s1 = reduce(s0, {
      kind: 'setPlacing',
      intent: { label: 'x', factory: () => ({ kind: 'actor', cx: 0, y: 0, label: 'x' }) },
    });
    expect(s1.placing?.label).toBe('x');
    const s2 = reduce(s1, { kind: 'setSnap', on: false });
    expect(s2.snap).toBe(false);
  });

  it('load: swaps doc but preserves snap/gridSize', () => {
    const s0 = reduce(seed(), { kind: 'setSnap', on: false });
    const s1 = reduce(s0, { kind: 'load', doc: docWith([{ kind: 'actor', cx: 0, y: 0, label: 'u' }]) });
    expect(s1.snap).toBe(false);
    expect(s1.gridSize).toBe(s0.gridSize);
    expect(s1.doc.items).toHaveLength(1);
    expect(s1.selection.size).toBe(0);
  });
});

describe('reduce — encoding & mode', () => {
  it('setEncoding sets and clears the document encoding', () => {
    let s = seed();
    expect(s.doc.encoding).toBeUndefined();
    s = reduce(s, { kind: 'setEncoding', encoding: 'state' });
    expect(s.doc.encoding).toBe('state');
    s = reduce(s, { kind: 'setEncoding', encoding: undefined });
    expect(s.doc.encoding).toBeUndefined();
  });

  it('setMode clears pending and placing', () => {
    let s: EditorState = { ...seed(), pending: 'i0', placing: { label: 'x', factory: () => ({ kind: 'actor', cx: 0, y: 0, label: 'x' }) } };
    s = reduce(s, { kind: 'setMode', mode: 'connect' });
    expect(s.mode).toBe('connect');
    expect(s.pending).toBeNull();
    expect(s.placing).toBeNull();
  });
});

describe('reduce — connector flow', () => {
  it('startConnect → finishConnect creates a connector and selects it', () => {
    let s = seed();
    s = reduce(s, { kind: 'startConnect', id: 'i0' });
    expect(s.pending).toBe('i0');
    s = reduce(s, { kind: 'finishConnect', targetId: 'i1', connectorId: 'c1' });
    expect(s.pending).toBeNull();
    const created = s.doc.items.find((it) => it.id === 'c1');
    expect(created?.kind).toBe('connector');
    expect(created && (created as { from: string; to: string }).from).toBe('i0');
    expect(created && (created as { from: string; to: string }).to).toBe('i1');
    expect([...s.selection]).toEqual(['c1']);
  });

  it('finishConnect on the same source cancels instead of self-looping', () => {
    let s = seed();
    s = reduce(s, { kind: 'startConnect', id: 'i0' });
    s = reduce(s, { kind: 'finishConnect', targetId: 'i0', connectorId: 'c-should-not-exist' });
    expect(s.pending).toBeNull();
    expect(s.doc.items.find((it) => it.id === 'c-should-not-exist')).toBeUndefined();
  });

  it('cancelConnect clears pending', () => {
    let s = seed();
    s = reduce(s, { kind: 'startConnect', id: 'i0' });
    s = reduce(s, { kind: 'cancelConnect' });
    expect(s.pending).toBeNull();
  });

  it('reverseConnector swaps from and to', () => {
    let s = initialState(docWith([
      { kind: 'element', x: 0, y: 0, label: 'A' },
      { kind: 'element', x: 200, y: 0, label: 'B' },
      { kind: 'connector', from: 'i0', to: 'i1' },
    ]));
    s = reduce(s, { kind: 'reverseConnector', id: 'i2' });
    const c = s.doc.items.find((it) => it.id === 'i2') as { from: string; to: string };
    expect(c.from).toBe('i1');
    expect(c.to).toBe('i0');
  });
});

describe('reduce — grouped children', () => {
  const groupedSeed = (): EditorState => initialState(docWith([
    { kind: 'grouped', x: 0, y: 0, label: 'G', children: [{ label: 'one' }, { label: 'two' }] },
  ]));

  it('addGroupChild appends', () => {
    let s = groupedSeed();
    s = reduce(s, { kind: 'addGroupChild', id: 'i0', child: { label: 'three' } });
    const g = s.doc.items[0] as { children: Array<{ label: string }> };
    expect(g.children.map((c) => c.label)).toEqual(['one', 'two', 'three']);
  });

  it('removeGroupChild removes by index', () => {
    let s = groupedSeed();
    s = reduce(s, { kind: 'removeGroupChild', id: 'i0', index: 0 });
    const g = s.doc.items[0] as { children: Array<{ label: string }> };
    expect(g.children.map((c) => c.label)).toEqual(['two']);
  });

  it('updateGroupChild patches label and unsets icon on undefined', () => {
    let s = initialState(docWith([
      { kind: 'grouped', x: 0, y: 0, label: 'G', children: [{ label: 'a', icon: namedIcon('shield') }] },
    ]));
    s = reduce(s, { kind: 'updateGroupChild', id: 'i0', index: 0, patch: { label: 'renamed' } });
    let g = s.doc.items[0] as { children: Array<Record<string, unknown>> };
    expect(g.children[0]!.label).toBe('renamed');
    expect((g.children[0]!.icon as { name?: string }).name).toBe('shield'); // untouched
    s = reduce(s, { kind: 'updateGroupChild', id: 'i0', index: 0, patch: { icon: undefined } });
    g = s.doc.items[0] as { children: Array<Record<string, unknown>> };
    expect('icon' in g.children[0]!).toBe(false);
  });
});

describe('createEditor', () => {
  it('notifies subscribers on state change and stops on unsubscribe', () => {
    const ed = createEditor(seed());
    let calls = 0;
    const off = ed.subscribe(() => { calls++; });
    ed.dispatch({ kind: 'select', ids: ['i0'], mode: 'replace' });
    expect(calls).toBe(1);
    off();
    ed.dispatch({ kind: 'select', ids: ['i1'], mode: 'replace' });
    expect(calls).toBe(1);
  });

  it('does not notify when reducer returns the same state (move by 0)', () => {
    const ed = createEditor(seed());
    let calls = 0;
    ed.subscribe(() => { calls++; });
    ed.dispatch({ kind: 'move', ids: ['i0'], dx: 0, dy: 0 });
    expect(calls).toBe(0);
  });

  it('produces distinct newId() values', () => {
    const ed = createEditor(seed());
    const ids = new Set(Array.from({ length: 20 }, () => ed.newId()));
    expect(ids.size).toBe(20);
  });
});
