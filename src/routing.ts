import type { BBox } from './layout';

/**
 * Connector routing per spec §4.
 *
 *  - Terminates on the edge MIDPOINT of the appropriate side (not on the
 *    corner-approaching intersection the prototype's `edgePoint()` yields).
 *    §4: "a connector meets the midpoint of the edge it lands on".
 *  - Straight: two points, from edge midpoint of the dominant-axis side of
 *    the source to the opposite midpoint on the target.
 *  - Elbow: four points, three orthogonal segments, entering/exiting on the
 *    dominant-axis edge midpoints.
 */

export type RouteStyle = 'straight' | 'elbow';
export type Point = [number, number];
export type Route = { points: Point[]; mid: Point };

export type Side = 'top' | 'right' | 'bottom' | 'left';

/**
 * Options for parallel-connector spacing. Callers supply the source and
 * target side indices independently — a connector shares its source side
 * with siblings that leave the source's same edge, and its target side
 * with siblings that arrive at the target's same edge. Those are two
 * different crowds; the router doesn't guess, the caller resolves it.
 *
 * `fromSide` / `toSide`, when supplied, override the geometry-derived
 * side choice. This lets the caller enforce a consistent side pick for a
 * whole group of connectors, so a slight overlap in centres doesn't flip
 * one connector to the opposite side of the box.
 */
export type SideGroup = { index: number; total: number };
export type RouteOptions = {
  fromSide?: Side;
  toSide?: Side;
  fromGroup?: SideGroup;
  toGroup?: SideGroup;
  spacing?: number;
};

export function routeConnector(
  from: BBox, to: BBox,
  style: RouteStyle = 'straight',
  opts: RouteOptions = {},
): Route {
  const spacing = opts.spacing ?? 30;
  const { fromSide: pinnedF, toSide: pinnedT } = opts;

  const fCx = from.x + from.w / 2;
  const fCy = from.y + from.h / 2;
  const tCx = to.x + to.w / 2;
  const tCy = to.y + to.h / 2;

  const dx = tCx - fCx;
  const dy = tCy - fCy;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  let fSide: Side, tSide: Side;
  if (pinnedF && pinnedT) {
    fSide = pinnedF;
    tSide = pinnedT;
  } else if (horizontal) {
    if (dx >= 0) { fSide = 'right'; tSide = 'left'; }
    else         { fSide = 'left';  tSide = 'right'; }
  } else {
    if (dy >= 0) { fSide = 'bottom'; tSide = 'top'; }
    else         { fSide = 'top';    tSide = 'bottom'; }
  }

  const fOffset = offsetForGroup(opts.fromGroup, spacing);
  const tOffset = offsetForGroup(opts.toGroup, spacing);
  const fPt = edgeMidpointOffset(from, fSide, fOffset);
  const tPt = edgeMidpointOffset(to, tSide, tOffset);

  const alignedHorizontally = fSide === 'right' && tSide === 'left' || fSide === 'left' && tSide === 'right';
  const alignedVertically = fSide === 'top' && tSide === 'bottom' || fSide === 'bottom' && tSide === 'top';

  if (style === 'straight') {
    // §4: "A straight connector may align to its target's midpoint instead
    // when that avoids an unnecessary elbow." When the two boxes' perpendicular
    // ranges overlap we can pull the source's exit point away from its own
    // midpoint so the line is truly straight, landing on the target's midpoint.
    // With only one connector on each side, prefer the target's midpoint.
    // With crowds, keep each connector at its group-assigned offset.
    if (alignedHorizontally) {
      const overlapMin = Math.max(from.y, to.y);
      const overlapMax = Math.min(from.y + from.h, to.y + to.h);
      if (overlapMin <= overlapMax) {
        const preferred = (opts.fromGroup && opts.fromGroup.total > 1) ? fPt[1] : tPt[1];
        const sharedY = Math.max(overlapMin, Math.min(overlapMax, preferred));
        const straightF: Point = [fPt[0], sharedY];
        const straightT: Point = [tPt[0], sharedY];
        return {
          points: [straightF, straightT],
          mid: [(straightF[0] + straightT[0]) / 2, sharedY],
        };
      }
    } else if (alignedVertically) {
      const overlapMin = Math.max(from.x, to.x);
      const overlapMax = Math.min(from.x + from.w, to.x + to.w);
      if (overlapMin <= overlapMax) {
        const preferred = (opts.fromGroup && opts.fromGroup.total > 1) ? fPt[0] : tPt[0];
        const sharedX = Math.max(overlapMin, Math.min(overlapMax, preferred));
        const straightF: Point = [sharedX, fPt[1]];
        const straightT: Point = [sharedX, tPt[1]];
        return {
          points: [straightF, straightT],
          mid: [sharedX, (straightF[1] + straightT[1]) / 2],
        };
      }
    }
    // Fallback: no perpendicular overlap or sides don't oppose. Use the
    // plain midpoint-to-midpoint segment (slight diagonal). User can switch
    // to elbow.
    return {
      points: [fPt, tPt],
      mid: [(fPt[0] + tPt[0]) / 2, (fPt[1] + tPt[1]) / 2],
    };
  }

  // Elbow: 3 orthogonal segments. Bend along the dominant axis given by the
  // chosen sides.
  const bendHorizontal = alignedHorizontally || (!alignedVertically && horizontal);
  if (bendHorizontal) {
    const midX = (fPt[0] + tPt[0]) / 2;
    return {
      points: [fPt, [midX, fPt[1]], [midX, tPt[1]], tPt],
      mid: [midX, (fPt[1] + tPt[1]) / 2],
    };
  }
  const midY = (fPt[1] + tPt[1]) / 2;
  return {
    points: [fPt, [fPt[0], midY], [tPt[0], midY], tPt],
    mid: [(fPt[0] + tPt[0]) / 2, midY],
  };
}

function offsetForGroup(g: SideGroup | undefined, spacing: number): number {
  if (!g || g.total <= 1) return 0;
  return -((g.total - 1) * spacing) / 2 + g.index * spacing;
}

export function edgeMidpoint(b: BBox, side: Side): Point {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  switch (side) {
    case 'top':    return [cx, b.y];
    case 'right':  return [b.x + b.w, cy];
    case 'bottom': return [cx, b.y + b.h];
    case 'left':   return [b.x, cy];
  }
}

/**
 * Edge midpoint with a lateral offset — used by parallel connectors so
 * multiple lines sharing a pair of endpoints spread along the shared edge
 * rather than stacking on top of each other.
 */
function edgeMidpointOffset(b: BBox, side: Side, offset: number): Point {
  const [x, y] = edgeMidpoint(b, side);
  // Top/bottom edges are horizontal → shift along X. Left/right → shift Y.
  return side === 'top' || side === 'bottom' ? [x + offset, y] : [x, y + offset];
}
