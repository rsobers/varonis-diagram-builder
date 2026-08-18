import { describe, it, expect } from 'vitest';
import { routeConnector, edgeMidpoint } from '../src/routing';
import type { BBox } from '../src/layout';

const box = (x: number, y: number, w = 100, h = 60): BBox => ({ x, y, w, h });

describe('edgeMidpoint', () => {
  it('returns the geometric centre of each side', () => {
    const b = box(10, 20, 100, 60); // centre = (60, 50)
    expect(edgeMidpoint(b, 'top')).toEqual([60, 20]);
    expect(edgeMidpoint(b, 'right')).toEqual([110, 50]);
    expect(edgeMidpoint(b, 'bottom')).toEqual([60, 80]);
    expect(edgeMidpoint(b, 'left')).toEqual([10, 50]);
  });
});

describe('routeConnector — straight', () => {
  it('right-aligned pair exits right, enters left', () => {
    const a = box(0, 0);      // centre (50, 30), right = (100, 30)
    const b = box(300, 0);    // centre (350, 30), left = (300, 30)
    const r = routeConnector(a, b, 'straight');
    expect(r.points).toEqual([[100, 30], [300, 30]]);
    expect(r.mid).toEqual([200, 30]);
  });

  it('vertically stacked pair exits bottom, enters top', () => {
    const a = box(0, 0);       // bottom (50, 60)
    const b = box(0, 200);     // top (50, 200)
    const r = routeConnector(a, b, 'straight');
    expect(r.points).toEqual([[50, 60], [50, 200]]);
  });

  it('mixed offsets pick the dominant axis, then align to target midpoint (§4)', () => {
    // to is far right + slightly down → dominant horizontal. y-ranges
    // overlap [10, 60], so the route aligns to target's midpoint (40),
    // truly horizontal — not the diagonal centre-to-centre used to emit.
    const a = box(0, 0);           // y range [0, 60]
    const b = box(400, 10);        // y range [10, 70], midpoint y=40
    const r = routeConnector(a, b, 'straight');
    expect(r.points[0]).toEqual([100, 40]); // exit right, aligned to target midpoint
    expect(r.points[1]).toEqual([400, 40]); // enter target's left-edge midpoint
  });

  it('grouped-vs-small case: taller box connects horizontally at target midpoint', () => {
    // The bug the user hit: a tall group (h=400) connected to a shorter
    // element (h=64) shouldn't render a diagonal.
    const group = box(100, 100, 190, 400);       // y range [100, 500]
    const element = box(500, 250, 180, 64);      // midpoint y=282
    const r = routeConnector(group, element, 'straight');
    // Both endpoints at y=282 (target's midpoint, inside group's range).
    expect(r.points[0]![1]).toBe(282);
    expect(r.points[1]![1]).toBe(282);
    expect(r.points[0]![0]).toBe(290); // group's right edge
    expect(r.points[1]![0]).toBe(500); // element's left edge
  });

  it('falls back to diagonal when perpendicular ranges do not overlap', () => {
    // No y overlap: source is [0, 60], target is [200, 260]. Can't be
    // truly straight; fallback to centre-to-centre.
    const a = box(0, 0);
    const b = box(400, 200);
    const r = routeConnector(a, b, 'straight');
    // Dominant horizontal, but with no y-overlap the two endpoints are at
    // their own midpoints.
    expect(r.points[0]).toEqual([100, 30]);
    expect(r.points[1]).toEqual([400, 230]);
  });
});

describe('routeConnector — parallel siblings', () => {
  it('offsets endpoints along the shared edge when multiple connectors share a pair', () => {
    const a = box(0, 0);       // right (100, 30)
    const b = box(300, 0);     // left (300, 30)

    // Baseline: single connector runs through the midpoints.
    const solo = routeConnector(a, b, 'straight');
    expect(solo.points[0]![1]).toBe(30);

    // Two siblings should offset above and below the midpoint.
    const first = routeConnector(a, b, 'straight', { fromGroup: { index: 0, total: 2 }, toGroup: { index: 0, total: 2 } });
    const second = routeConnector(a, b, 'straight', { fromGroup: { index: 1, total: 2 }, toGroup: { index: 1, total: 2 } });
    // Same x (right/left edges), different y — offset perpendicular to run.
    expect(first.points[0]![0]).toBe(100);
    expect(second.points[0]![0]).toBe(100);
    expect(first.points[0]![1]).not.toBe(second.points[0]![1]);
    // Centre of the pair equals the midpoint (30) — spec §4.
    const mid = (first.points[0]![1] + second.points[0]![1]) / 2;
    expect(mid).toBeCloseTo(30);
  });

  it('spaces top/bottom sides along X and left/right along Y', () => {
    const a = box(0, 0);         // bottom (50, 60)
    const b = box(0, 300);       // top (50, 300)
    const first = routeConnector(a, b, 'straight', { fromGroup: { index: 0, total: 2 }, toGroup: { index: 0, total: 2 } });
    const second = routeConnector(a, b, 'straight', { fromGroup: { index: 1, total: 2 }, toGroup: { index: 1, total: 2 } });
    // Bottom edge is horizontal → offset shifts X, not Y.
    expect(first.points[0]![1]).toBe(60);
    expect(second.points[0]![1]).toBe(60);
    expect(first.points[0]![0]).not.toBe(second.points[0]![0]);
  });
});

describe('routeConnector — elbow', () => {
  it('horizontal-dominant: three segments with a vertical bend at midX', () => {
    const a = box(0, 0);      // right (100, 30)
    const b = box(400, 200);  // left (400, 230)
    const r = routeConnector(a, b, 'elbow');
    // Four corners: exit, bend, bend, enter
    expect(r.points).toHaveLength(4);
    expect(r.points[0]).toEqual([100, 30]);
    expect(r.points[3]).toEqual([400, 230]);
    // Middle two share x = midX = 250
    expect(r.points[1]![0]).toBe(250);
    expect(r.points[2]![0]).toBe(250);
    // Elbow preserves y at start/end
    expect(r.points[1]![1]).toBe(30);
    expect(r.points[2]![1]).toBe(230);
  });

  it('vertical-dominant: three segments with a horizontal bend at midY', () => {
    const a = box(0, 0);      // bottom (50, 60)
    const b = box(200, 400);  // top (250, 400)
    const r = routeConnector(a, b, 'elbow');
    expect(r.points).toHaveLength(4);
    // Segments enter/exit on top/bottom
    expect(r.points[0]).toEqual([50, 60]);
    expect(r.points[3]).toEqual([250, 400]);
    // Bend at midY = 230
    expect(r.points[1]![1]).toBe(230);
    expect(r.points[2]![1]).toBe(230);
  });
});
