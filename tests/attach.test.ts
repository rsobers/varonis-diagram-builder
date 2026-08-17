import { describe, it, expect } from 'vitest';
import { projectPointToSegment, snapInlineControlToNearestConnector, SNAP_THRESHOLD } from '../src/attach';
import { withIds, type DiagramDoc, type Item, type ItemDraft, type InlineControl } from '../src/model';

describe('projectPointToSegment', () => {
  it('drops a perpendicular onto a horizontal segment', () => {
    const r = projectPointToSegment(50, 100, 0, 40, 200, 40);
    expect(r.x).toBe(50);
    expect(r.y).toBe(40);
    expect(r.distance).toBe(60);
  });
  it('clamps to the endpoints when outside the segment', () => {
    const r = projectPointToSegment(-20, 0, 0, 0, 100, 0);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.distance).toBe(20);
  });
  it('handles zero-length segment as a point-to-point distance', () => {
    const r = projectPointToSegment(3, 4, 0, 0, 0, 0);
    expect(r.distance).toBe(5);
  });
});

function doc<T extends ItemDraft>(items: T[]): DiagramDoc {
  return { version: 1, width: 1200, height: 800, items: withIds(items) as unknown as Item[] };
}

describe('snapInlineControlToNearestConnector', () => {
  it('pulls the inline control onto a nearby horizontal connector', () => {
    // Two md elements at same y=200 (midpoint 232). Connector runs
    // horizontally at y=232.
    const d = doc([
      { kind: 'element', x: 100, y: 200, label: 'A', size: 'md' },
      { kind: 'element', x: 500, y: 200, label: 'B', size: 'md' },
      { kind: 'connector', from: 'i0', to: 'i1' },
      // Inline control center at y+18=228, 4px above the line → within threshold.
      { kind: 'inlineControl', x: 300, y: 210, label: 'WAF' },
    ]);
    const ic = d.items.find((i) => i.kind === 'inlineControl') as InlineControl;
    const r = snapInlineControlToNearestConnector(ic, d);
    expect(r).not.toBeNull();
    if (!r) throw new Error();
    const h = 36;
    expect(r.y + h / 2).toBe(232);
  });

  it('returns null when no connector is within threshold', () => {
    const d = doc([
      { kind: 'element', x: 100, y: 200, label: 'A', size: 'md' },
      { kind: 'element', x: 500, y: 200, label: 'B', size: 'md' },
      { kind: 'connector', from: 'i0', to: 'i1' },
      // Placed far below the connector line — well outside threshold.
      { kind: 'inlineControl', x: 300, y: 600, label: 'WAF' },
    ]);
    const ic = d.items.find((i) => i.kind === 'inlineControl') as InlineControl;
    expect(snapInlineControlToNearestConnector(ic, d)).toBeNull();
  });

  it('honours a custom threshold', () => {
    const d = doc([
      { kind: 'element', x: 100, y: 200, label: 'A', size: 'md' },
      { kind: 'element', x: 500, y: 200, label: 'B', size: 'md' },
      { kind: 'connector', from: 'i0', to: 'i1' },
      // Center at y+18=318; line at 232 → distance 86.
      { kind: 'inlineControl', x: 300, y: 300, label: 'WAF' },
    ]);
    const ic = d.items.find((i) => i.kind === 'inlineControl') as InlineControl;
    expect(snapInlineControlToNearestConnector(ic, d)).toBeNull();
    expect(SNAP_THRESHOLD).toBe(24);
    // Bump threshold beyond 86 → snap succeeds.
    expect(snapInlineControlToNearestConnector(ic, d, 100)).not.toBeNull();
  });
});
