import { SIZES } from './tokens';
import { textWidth } from './textMetrics';
import { routeConnector } from './routing';
import type {
  DiagramDoc, Item, Boundary, ZoneDivider, Element, Grouped,
  InlineControl, Actor, Edge, ConnectorLabel, Connector, Legend, Caption,
} from './model';

/**
 * Bounding-box computation kept separate from render.ts so callers (canvas
 * overlay for selection rings, connector routing, hit-testing fallbacks) can
 * ask "where is item X" without invoking the renderer.
 *
 * The arithmetic mirrors render.ts. If it drifts, layout tests catch it.
 */

export type BBox = { x: number; y: number; w: number; h: number };

export function layout(doc: DiagramDoc): Map<string, BBox> {
  const out = new Map<string, BBox>();
  // First pass: non-connector items have self-contained bboxes.
  for (const item of doc.items) {
    if (item.kind !== 'connector') out.set(item.id, bbox(item));
  }
  // Second pass: connectors resolve to the bounding rect of their route,
  // using the first-pass bboxes of from/to. Skip if either endpoint missing.
  for (const item of doc.items) {
    if (item.kind !== 'connector') continue;
    const b = bboxConnector(item, out);
    if (b) out.set(item.id, b);
  }
  return out;
}

/**
 * Clamps an item's position so its bbox stays within [0, width] x [0, height].
 * Used at placement time so a drag/drop or click near the edge never leaves
 * an item straddling the canvas boundary. Item variants that don't have a
 * translatable anchor (edge, connector) are returned unchanged.
 */
export function clampToCanvas<T extends Exclude<Item, Connector>>(
  item: T, canvasW: number, canvasH: number,
): T {
  const b = bbox(item);
  const maxX = Math.max(0, canvasW - b.w);
  const maxY = Math.max(0, canvasH - b.h);
  const dx = clamp(b.x, 0, maxX) - b.x;
  const dy = clamp(b.y, 0, maxY) - b.y;
  if (dx === 0 && dy === 0) return item;

  switch (item.kind) {
    case 'boundary':
    case 'element':
    case 'grouped':
    case 'inlineControl':
    case 'legend':
    case 'caption':
      return { ...item, x: item.x + dx, y: item.y + dy };
    case 'zoneDivider':
      return { ...item, x: item.x + dx, y1: item.y1 + dy, y2: item.y2 + dy };
    case 'actor':
      return { ...item, cx: item.cx + dx, y: item.y + dy };
    case 'edge':
      return { ...item, points: item.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    case 'connectorLabel':
      return { ...item, cx: item.cx + dx, cy: item.cy + dy };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function bbox(item: Exclude<Item, Connector>): BBox {
  switch (item.kind) {
    case 'boundary':       return bboxBoundary(item);
    case 'zoneDivider':    return bboxZoneDivider(item);
    case 'element':        return bboxElement(item);
    case 'grouped':        return bboxGrouped(item);
    case 'inlineControl':  return bboxInlineControl(item);
    case 'actor':          return bboxActor(item);
    case 'edge':           return bboxEdge(item);
    case 'connectorLabel': return bboxConnectorLabel(item);
    case 'legend':         return bboxLegend(item);
    case 'caption':        return bboxCaption(item);
  }
}

function bboxBoundary(b: Boundary): BBox {
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

function bboxZoneDivider(z: ZoneDivider): BBox {
  const chipW = z.label.length * 5.6 + 20;
  const x = z.x - chipW / 2;
  return { x, y: z.y1, w: chipW, h: z.y2 - z.y1 };
}

/** Vendor-mark badge dimensions per size preset. Kept square. */
const BADGE_SIZE: Record<'sm' | 'md' | 'lg', number> = { sm: 64, md: 90, lg: 120 };

function bboxElement(e: Element): BBox {
  // §8 v2.3 — badge form is a square whose side matches the sm/md/lg
  // choice. Layout mirrors this so hit-testing, selection rings, and
  // collision checks agree with the renderer.
  if (e.markStyle === 'badge' && e.markId) {
    const s = BADGE_SIZE[e.size ?? 'md'];
    return { x: e.x, y: e.y, w: s, h: s };
  }
  const size = e.size ?? 'sm';
  const [w, h] = SIZES[size];
  return { x: e.x, y: e.y, w, h };
}

function bboxGrouped(g: Grouped): BBox {
  const w = groupedWidth(g);
  const h = 46 + g.children.length * 30 + (g.children.length - 1) * 5 + 10;
  return { x: g.x, y: g.y, w, h };
}

/**
 * Grouped shell width. §3.2 pins the default at 190px, but a row with a
 * label wider than that will overflow — so we expand horizontally to fit
 * the widest thing in the shell (header at 12px + each row at 11.5px).
 * All rows stay the same width, header stays centred; only the outer
 * width grows.
 */
export function groupedWidth(g: Grouped): number {
  const HEADER_PAD = 20;     // 10px on each side of the centred header
  const ROW_PAD_ICON = 51;   // row inset 10 + icon slot 31 + trailing 10
  const ROW_PAD_PLAIN = 30;  // row inset 10 + 5px padding either side of centred text
  const headerNeed = textWidth(g.label, 12) + HEADER_PAD;
  let widest = headerNeed;
  for (const c of g.children) {
    const rowNeed = textWidth(c.label, 11.5) + (c.icon ? ROW_PAD_ICON : ROW_PAD_PLAIN);
    if (rowNeed > widest) widest = rowNeed;
  }
  return Math.max(190, Math.ceil(widest));
}

function bboxInlineControl(c: InlineControl): BBox {
  return { x: c.x, y: c.y, w: inlineControlWidth(c.label, !!c.icon), h: 36 };
}

/**
 * Stadium pill width. Uses width-aware textWidth so labels like
 * "Metadata & Logs" (wide caps + ampersand) don't overflow the way a
 * naive char-count estimate lets them. Padding budget matches the
 * renderer: icon slot on the left + label + horizontal breathing room.
 */
export function inlineControlWidth(label: string, hasIcon: boolean): number {
  const iconPad = hasIcon ? 34 : 12;  // 12(left) + 16(icon) + 6(gap) OR 12(left)
  const rightPad = 14;
  return Math.max(90, iconPad + textWidth(label, 12) + rightPad);
}

function bboxActor(a: Actor): BBox {
  // Icon is 32×32 centred on cx; label sits 12–24px below. Treat the click
  // target as the icon square; label is a follow-along.
  return { x: a.cx - 16, y: a.y, w: 32, h: 32 };
}

function bboxEdge(e: Edge): BBox {
  const xs = e.points.map((p) => p[0]);
  const ys = e.points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function bboxConnectorLabel(c: ConnectorLabel): BBox {
  const CW = 5.0;
  const GAP = 8;
  const lines = c.text.toUpperCase().split('\n');
  const opt = (c.optional ?? '').toUpperCase();
  const lastIdx = lines.length - 1;
  const lw = lines.map((l, i) =>
    l.length * CW + (i === lastIdx && opt ? GAP + opt.length * CW : 0)
  );
  const badge = c.num ? 20 : 0;
  const w = Math.max(46, Math.max(...lw) + 22 + badge);
  const h = lines.length > 1 ? 32 : 18;
  return { x: c.cx - w / 2, y: c.cy - h / 2, w, h };
}

function bboxLegend(lg: Legend): BBox {
  const h = 26 + lg.rows.length * 16;
  const rowMax = lg.rows.length > 0
    ? Math.max(...lg.rows.map(([, lab]) => textWidth(lab, 10)))
    : 0;
  const w = Math.max(150, rowMax + 56, textWidth(lg.encoding, 9) + 30);
  return { x: lg.x, y: lg.y, w, h };
}

function bboxCaption(c: Caption): BBox {
  // Caption is a single-line text anchored at (x, y baseline). Approximate.
  return { x: c.x, y: c.y - 11, w: textWidth(c.text, 11), h: 14 };
}

/**
 * Nesting depth of a Boundary: the count of *other* boundaries in the doc
 * that strictly contain it. Depth 0 = top level, 1 = nested inside one,
 * etc. Used to derive Boundary fill per §3.4 (fill by depth, not choice).
 * Strict containment: outer must fully cover inner AND not be identical.
 */
export function containmentDepth(id: string, doc: DiagramDoc): number {
  const inner = doc.items.find((it) => it.id === id);
  if (!inner || inner.kind !== 'boundary') return 0;
  let depth = 0;
  for (const other of doc.items) {
    if (other.id === id || other.kind !== 'boundary') continue;
    if (strictlyContains(other, inner)) depth++;
  }
  return depth;
}

function strictlyContains(outer: Boundary, inner: Boundary): boolean {
  if (outer.x <= inner.x
    && outer.y <= inner.y
    && outer.x + outer.w >= inner.x + inner.w
    && outer.y + outer.h >= inner.y + inner.h) {
    // Not identical.
    return !(outer.x === inner.x && outer.y === inner.y && outer.w === inner.w && outer.h === inner.h);
  }
  return false;
}

function bboxConnector(c: Connector, resolved: Map<string, BBox>): BBox | null {
  const from = resolved.get(c.from);
  const to = resolved.get(c.to);
  if (!from || !to) return null;
  const route = routeConnector(from, to, c.routing ?? 'straight');
  const xs = route.points.map((p) => p[0]);
  const ys = route.points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
