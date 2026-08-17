import type { DiagramDoc, InlineControl } from './model';
import { bbox, layout } from './layout';
import { routeConnector } from './routing';

/**
 * Snap an inline control onto the nearest connector line if its center lies
 * within a small threshold of one. Inline controls per §3.3 "sit on the
 * connector path"; grid snapping otherwise leaves them a handful of pixels
 * off. This magnet closes the gap.
 *
 * Returns the corrected (x, y) or null if no connector was close enough.
 */
export const SNAP_THRESHOLD = 24;

export function snapInlineControlToNearestConnector(
  item: InlineControl, doc: DiagramDoc, threshold = SNAP_THRESHOLD,
): { x: number; y: number } | null {
  const b = bbox(item);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  const bboxes = layout(doc);
  let best: { x: number; y: number; distance: number } | null = null;

  for (const other of doc.items) {
    if (other.kind !== 'connector') continue;
    const from = bboxes.get(other.from);
    const to = bboxes.get(other.to);
    if (!from || !to) continue;
    // Skip degenerate connectors.
    if (other.from === item.id || other.to === item.id) continue;
    const route = routeConnector(from, to, other.routing ?? 'straight');
    const pts = route.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = projectPointToSegment(cx, cy, pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]);
      if (!best || p.distance < best.distance) best = p;
    }
  }

  if (!best || best.distance > threshold) return null;
  return { x: best.x - b.w / 2, y: best.y - b.h / 2 };
}

/**
 * Nearest point on segment (a → b) to point p, and its distance.
 * Standard AABB-friendly projection with clamp to [0,1].
 */
export function projectPointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { x: number; y: number; distance: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    const d = Math.hypot(px - ax, py - ay);
    return { x: ax, y: ay, distance: d };
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { x, y, distance: Math.hypot(px - x, py - y) };
}
