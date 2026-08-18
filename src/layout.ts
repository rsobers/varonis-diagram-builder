import { SIZES } from './tokens';
import { textWidth, wrap } from './textMetrics';
import { routeConnector, type Side, type SideGroup } from './routing';
import type {
  DiagramDoc, Item, Boundary, ZoneDivider, Element, Grouped,
  InlineControl, Actor, Edge, ConnectorLabel, Connector, Legend, Caption, Title,
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
    case 'title':
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
    case 'title':          return bboxTitle(item);
  }
}

function bboxBoundary(b: Boundary): BBox {
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

function bboxZoneDivider(z: ZoneDivider): BBox {
  const chipW = zoneDividerChipWidth(z.label);
  const x = z.x - chipW / 2;
  return { x, y: z.y1, w: chipW, h: z.y2 - z.y1 };
}

/**
 * ZoneDivider chip width. Label is uppercase monospace at 8px, so a
 * per-char constant is accurate (each glyph is the same width). Kept
 * generous (14px of side padding total) so short labels still read as
 * chips rather than crowded text.
 */
export function zoneDividerChipWidth(label: string): number {
  return label.length * 5.6 + 20;
}

/** Vendor-mark badge dimensions per size preset. Kept square. */
const BADGE_SIZE: Record<'sm' | 'md' | 'lg', number> = { sm: 64, md: 90, lg: 120 };

function bboxElement(e: Element): BBox {
  if (e.markStyle === 'badge' && e.markId) {
    const s = BADGE_SIZE[e.size ?? 'md'];
    return { x: e.x, y: e.y, w: s, h: s };
  }
  const size = e.size ?? 'sm';
  const [, h] = SIZES[size];
  return { x: e.x, y: e.y, w: elementWidth(e), h };
}

/**
 * Element rect width. §3.1 pins defaults (sm 150, md/lg 180), but a label
 * that doesn't fit within those widths would overflow the rect — same
 * class of problem as grouped rows. Consistent fix: keep the default as
 * a floor and expand horizontally when needed. Height stays fixed per §3.1
 * (icon-plus-two-lines still triggers a "needs a large element" warning
 * in the renderer).
 *
 * Doesn't apply in badge mode (that has its own square sizing table).
 */
export function elementWidth(e: Element): number {
  if (e.markStyle === 'badge' && e.markId) return BADGE_SIZE[e.size ?? 'md'];
  const size = e.size ?? 'sm';
  const [defaultW] = SIZES[size];

  if (size === 'sm') {
    // Single line; expand to fit the whole label plus §9 padding.
    // With icon: 10 inset + 16 icon + 5 gap + text + 15 pad = text + 46
    // Plain:     15 pad + text + 15 pad                       = text + 30
    const need = textWidth(e.label, 12) + (e.icon ? 46 : 30);
    return Math.max(defaultW, Math.ceil(need));
  }

  // md / lg: wrap at the default budget first; if any wrapped line still
  // exceeds it, or the sub-label does, widen the box to fit the widest.
  const budget = defaultW - 30;
  const lines = wrap(e.label, budget, 12.5).lines;
  let widest = 0;
  for (const ln of lines) {
    const w = textWidth(ln, 12.5);
    if (w > widest) widest = w;
  }
  if (e.sub) {
    const subW = textWidth(e.sub, 11.5);
    if (subW > widest) widest = subW;
  }
  return Math.max(defaultW, Math.ceil(widest + 30));
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
  // Padding budgets follow §9 element padding (15px between label and edge)
  // so rows don't feel cramped against their borders.
  //
  //   header: 15 padding + text + 15 padding                        = text + 30
  //   row plain: 10 row-inset + 15 pad + text + 15 pad + 10 inset   = text + 50
  //   row icon:  10 inset + 8 icon-inset + 16 icon + 7 gap
  //              + text + 15 pad + 10 inset                          = text + 66
  const HEADER_PAD = 30;
  const ROW_PAD_ICON = 66;
  const ROW_PAD_PLAIN = 50;
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
  // Text-start inset in the renderer: 38 with icon (matches iconSvg at x+12,
  // 16px icon slot, 10px gap → text at x+38); 12 without.
  const leftInset = hasIcon ? 38 : 12;
  const rightPad = 14;
  return Math.max(90, leftInset + textWidth(label, 12) + rightPad);
}

function bboxActor(a: Actor): BBox {
  // Icon is 32×32 centred on cx; label sits below at y+50 (baseline).
  // Include the label in the bbox so selection ring / hit-testing /
  // marquee match the visible actor. Otherwise clicking on the label
  // misses and a long name overflows a rect that thinks it's 32 wide.
  const labelW = Math.max(32, textWidth(a.label, 12) + 8);
  const halfW = labelW / 2;
  return { x: a.cx - halfW, y: a.y, w: labelW, h: 54 };
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

function bboxTitle(t: Title): BBox {
  // Title font is 18px bold; measured with the same width heuristic.
  return { x: t.x, y: t.y - 18, w: textWidth(t.text, 18), h: 22 };
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
  // Layout doesn't know about the sibling group, so bbox uses the geometry-
  // only defaults. Overhead versus the perfect route is at most `spacing` px,
  // which is fine for selection rings and connector-label collision checks.
  const route = routeConnector(from, to, c.routing ?? 'straight');
  const xs = route.points.map((p) => p[0]);
  const ys = route.points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Per-connector anchor metadata: which side of each endpoint the connector
 * leaves/arrives on, and its index within the set of siblings sharing that
 * side. Computed once per render/layout pass; connectors then look up their
 * own entry when it's their turn to be drawn.
 *
 * §4: connectors sharing one edge are spaced evenly and centred on the
 * midpoint. Sort within a side by the far endpoint's centre so parallel
 * lines don't cross each other unnecessarily.
 */
export type ConnectorAnchor = {
  fSide: Side; tSide: Side;
  fromGroup: SideGroup; toGroup: SideGroup;
};

export function computeConnectorAnchors(
  items: readonly Item[], bboxes: Map<string, BBox>,
): Map<string, ConnectorAnchor> {
  type Landing = { connId: string; side: Side; farCx: number; farCy: number };
  const landingsByElement = new Map<string, Landing[]>();

  const connectors = items.filter((i): i is Connector => i.kind === 'connector');

  // First pass: decide the side each endpoint lands on, from centre-to-centre
  // geometry (matches routeConnector's own rule).
  const firstPass = new Map<string, { fSide: Side; tSide: Side }>();
  for (const c of connectors) {
    const from = bboxes.get(c.from);
    const to = bboxes.get(c.to);
    if (!from || !to) continue;
    const fCx = from.x + from.w / 2, fCy = from.y + from.h / 2;
    const tCx = to.x + to.w / 2, tCy = to.y + to.h / 2;
    const dx = tCx - fCx, dy = tCy - fCy;
    let fSide: Side, tSide: Side;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) { fSide = 'right'; tSide = 'left'; }
      else         { fSide = 'left';  tSide = 'right'; }
    } else {
      if (dy >= 0) { fSide = 'bottom'; tSide = 'top'; }
      else         { fSide = 'top';    tSide = 'bottom'; }
    }
    firstPass.set(c.id, { fSide, tSide });

    push(landingsByElement, c.from, { connId: c.id, side: fSide, farCx: tCx, farCy: tCy });
    push(landingsByElement, c.to,   { connId: c.id, side: tSide, farCx: fCx, farCy: fCy });
  }

  // Second pass: within each (element, side), sort by the far endpoint's
  // perpendicular coordinate and assign each connector an index/total.
  // Vertical sides (left/right) sort by farCy; horizontal (top/bottom) by farCx.
  const sideOrder = new Map<string, { index: number; total: number }>();
  for (const [elId, list] of landingsByElement) {
    const bySide = new Map<Side, Landing[]>();
    for (const l of list) {
      const arr = bySide.get(l.side) ?? [];
      arr.push(l);
      bySide.set(l.side, arr);
    }
    for (const [side, arr] of bySide) {
      arr.sort((a, b) =>
        side === 'left' || side === 'right' ? a.farCy - b.farCy : a.farCx - b.farCx
      );
      const total = arr.length;
      arr.forEach((l, i) => {
        sideOrder.set(`${elId}|${l.connId}`, { index: i, total });
      });
    }
  }

  const out = new Map<string, ConnectorAnchor>();
  for (const c of connectors) {
    const fp = firstPass.get(c.id);
    if (!fp) continue;
    const fromGroup = sideOrder.get(`${c.from}|${c.id}`) ?? { index: 0, total: 1 };
    const toGroup = sideOrder.get(`${c.to}|${c.id}`) ?? { index: 0, total: 1 };
    out.set(c.id, { fSide: fp.fSide, tSide: fp.tSide, fromGroup, toGroup });
  }
  return out;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k) ?? [];
  arr.push(v);
  m.set(k, arr);
}
