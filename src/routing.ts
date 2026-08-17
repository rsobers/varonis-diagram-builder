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

type Side = 'top' | 'right' | 'bottom' | 'left';

/**
 * Options for parallel-connector spacing. When N connectors share the same
 * pair of endpoints, they're spaced evenly and centred on the midpoint per
 * spec §4. Callers supply their own index-in-group and total-in-group;
 * routing.ts doesn't need to know the doc structure.
 */
export type RouteOptions = {
  index?: number;
  total?: number;
  spacing?: number;
};

export function routeConnector(
  from: BBox, to: BBox,
  style: RouteStyle = 'straight',
  opts: RouteOptions = {},
): Route {
  const total = Math.max(1, opts.total ?? 1);
  const index = opts.index ?? 0;
  const spacing = opts.spacing ?? 18;
  const offset = total <= 1 ? 0 : -((total - 1) * spacing) / 2 + index * spacing;

  const fCx = from.x + from.w / 2;
  const fCy = from.y + from.h / 2;
  const tCx = to.x + to.w / 2;
  const tCy = to.y + to.h / 2;

  const dx = tCx - fCx;
  const dy = tCy - fCy;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  let fSide: Side, tSide: Side;
  if (horizontal) {
    if (dx >= 0) { fSide = 'right'; tSide = 'left'; }
    else         { fSide = 'left';  tSide = 'right'; }
  } else {
    if (dy >= 0) { fSide = 'bottom'; tSide = 'top'; }
    else         { fSide = 'top';    tSide = 'bottom'; }
  }

  const fPt = edgeMidpointOffset(from, fSide, offset);
  const tPt = edgeMidpointOffset(to, tSide, offset);

  if (style === 'straight') {
    return {
      points: [fPt, tPt],
      mid: [(fPt[0] + tPt[0]) / 2, (fPt[1] + tPt[1]) / 2],
    };
  }

  // Elbow: 3 orthogonal segments. Bend along the dominant axis.
  if (horizontal) {
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
