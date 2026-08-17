import {
  PALETTE, SIZES, INK, SUB, ICON_COLOR, CONN, CONN_DASHED,
  LABEL_STROKE, BOUNDARY_STROKE, OPTIONAL_TEXT, MONO_FAMILY, UI_FAMILY,
} from './tokens';
import { namedIcon, type IconRef } from './icons';
import { logoUrl } from './logos';

// Actors default to the "person" glyph when none is set. Resolved at
// import so the fallback still bakes a self-contained path into exports.
const DEFAULT_ACTOR_ICON: IconRef = namedIcon('person');
import type {
  DiagramDoc, Item, Boundary, ZoneDivider, Element, Grouped,
  InlineControl, Actor, Edge, ConnectorLabel, Connector, Legend, Caption,
} from './model';
import { textWidth, wrap } from './textMetrics';
import { layout, containmentDepth, inlineControlWidth, groupedWidth, zoneDividerChipWidth, elementWidth, type BBox } from './layout';
import { routeConnector } from './routing';

/**
 * Pure renderer — no DOM, no globals, no side effects. Ported from
 * reference/v2.py, which has been debugged against real output; keep the
 * geometry identical unless the guide changes.
 *
 * All numbers are rounded at emission via num() so IEEE-754 noise
 * ("173.39999999999995") never reaches the SVG. Rounding is presentation-only;
 * upstream geometry stays in full precision.
 */

export type RenderOptions = {
  /**
   * When true, wraps each item's primary output in `<g data-item-id="…">` so
   * the interactive editor can hit-test via `event.target.closest(...)`.
   * Off by default so exported/committed SVGs stay unmarked.
   */
  interactive?: boolean;
  /**
   * Whether to emit the full-canvas white background rect. Default 'white'
   * matches the editor and the reference; 'none' is used by PNG export so
   * the rasterized output is transparent per §9.
   */
  background?: 'white' | 'none';
  /**
   * Override the SVG root's viewBox / width / height. Used by the exporter
   * to crop the diagram to content plus a padding margin so no element sits
   * against the edge. Falls back to (0, 0, doc.width, doc.height).
   */
  viewBox?: { x: number; y: number; w: number; h: number };
};

export type RenderResult = { svg: string; warnings: string[] };

export function render(doc: DiagramDoc, opts: RenderOptions = {}): RenderResult {
  const layers = {
    boundaries: [] as string[],
    edges: [] as string[],
    blabels: [] as string[],
    nodes: [] as string[],
    labels: [] as string[],
  };
  const warnings: string[] = [];
  // layout() is only needed when the doc has auto-routed connectors; skip
  // when it doesn't so fixture rendering has no new dependency at runtime.
  const hasConnector = doc.items.some((it) => it.kind === 'connector');
  const bboxes = hasConnector ? layout(doc) : new Map<string, BBox>();
  const ctx: Ctx = { interactive: opts.interactive === true, bboxes, items: doc.items, doc };

  // Boundaries must emit outer-first so nested ones layer on top with their
  // derived fill. Everything else keeps document order.
  const orderedItems = orderForRender(doc);
  for (const item of orderedItems) {
    renderItem(item, layers, warnings, ctx);
  }

  // orient="auto-start-reverse" so the SAME marker works at either end of a
  // connector — it flips 180° when used as marker-start, giving us source
  // arrows without a second marker definition.
  const defs =
    `<defs>` +
    `<marker id="ar" markerWidth="9" markerHeight="9" refX="6.2" refY="3" orient="auto-start-reverse" ` +
      `markerUnits="userSpaceOnUse"><path d="M0,0 L6.2,3 L0,6 Z" fill="${CONN}"/></marker>` +
    `<marker id="ard" markerWidth="9" markerHeight="9" refX="6.2" refY="3" orient="auto-start-reverse" ` +
      `markerUnits="userSpaceOnUse"><path d="M0,0 L6.2,3 L0,6 Z" fill="${CONN_DASHED}"/></marker>` +
    `</defs>`;

  const head = doc.title
    ? `<text x="40" y="42" font-size="15" font-weight="600" fill="${INK}">${esc(doc.title[0])}</text>` +
      `<text x="40" y="62" font-size="11.5" fill="${SUB}">${esc(doc.title[1])}</text>`
    : '';

  const vb = opts.viewBox ?? { x: 0, y: 0, w: doc.width, h: doc.height };
  // Default (0, 0) origin omits explicit x/y attrs so fixture snapshots
  // stay byte-identical with earlier renders.
  const bgXY = vb.x === 0 && vb.y === 0 ? '' : ` x="${num(vb.x)}" y="${num(vb.y)}"`;
  const bg = (opts.background ?? 'white') === 'white'
    ? `<rect${bgXY} width="${num(vb.w)}" height="${num(vb.h)}" fill="#ffffff"/>`
    : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(vb.w)}" height="${num(vb.h)}" ` +
      `viewBox="${num(vb.x)} ${num(vb.y)} ${num(vb.w)} ${num(vb.h)}" font-family="${UI_FAMILY}">` +
    defs +
    bg +
    head +
    layers.boundaries.join('') +
    layers.edges.join('') +
    layers.blabels.join('') +
    layers.nodes.join('') +
    layers.labels.join('') +
    `</svg>`;

  return { svg, warnings: dedupe(warnings) };
}

// ---- dispatcher ---------------------------------------------------------

type Layers = {
  boundaries: string[]; edges: string[]; blabels: string[];
  nodes: string[]; labels: string[];
};

type Ctx = { interactive: boolean; bboxes: Map<string, BBox>; items: readonly Item[]; doc: DiagramDoc };

function renderItem(item: Item, layers: Layers, warnings: string[], ctx: Ctx): void {
  switch (item.kind) {
    case 'boundary':        renderBoundary(item, layers, ctx); return;
    case 'zoneDivider':     renderZoneDivider(item, layers, ctx); return;
    case 'element':         renderElement(item, layers, warnings, ctx); return;
    case 'grouped':         renderGrouped(item, layers, warnings, ctx); return;
    case 'inlineControl':   renderInlineControl(item, layers, ctx); return;
    case 'actor':           renderActor(item, layers, ctx); return;
    case 'edge':            renderEdge(item, layers, ctx); return;
    case 'connectorLabel':  renderConnectorLabel(item, layers, ctx); return;
    case 'connector':       renderConnector(item, layers, ctx); return;
    case 'legend':          renderLegend(item, layers, ctx); return;
    case 'caption':         renderCaption(item, layers, ctx); return;
  }
}

// ---- shared helpers -----------------------------------------------------

/** Round to 2 decimals for SVG output. Presentation-only. */
function num(n: number): number {
  return Math.round(n * 100) / 100;
}

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function iconSvg(ref: IconRef | undefined, x: number, y: number, scale = 0.667, fill = ICON_COLOR): string {
  if (!ref) return '';
  return `<g transform="translate(${num(x)},${num(y)}) scale(${num(scale)})"><path d="${ref.path}" fill="${fill}"/></g>`;
}

/**
 * Render a vendor mark at (x, y) sized to width×height. Uses <image> with a
 * bundled asset URL (data URL for small files). Marks preserve their own
 * colors per §8.2 ("Never recolor"). Returns empty string when the id is
 * unresolved (unknown or unregistered vendor).
 */
function markSvg(markId: string | undefined, x: number, y: number, size = 16): string {
  if (!markId) return '';
  const url = logoUrl(markId);
  if (!url) return '';
  return `<image href="${url}" x="${num(x)}" y="${num(y)}" width="${num(size)}" height="${num(size)}" preserveAspectRatio="xMidYMid meet"/>`;
}

function wrapId(ctx: Ctx, id: string, content: string): string {
  return ctx.interactive ? `<g data-item-id="${esc(id)}">${content}</g>` : content;
}

/**
 * Boundaries emit outer-first so nested siblings paint on top of their
 * parent's derived fill. Non-boundary items keep their original order.
 */
function orderForRender(doc: DiagramDoc): Item[] {
  const boundaries: Boundary[] = [];
  const rest: Item[] = [];
  for (const it of doc.items) {
    if (it.kind === 'boundary') boundaries.push(it);
    else rest.push(it);
  }
  boundaries.sort((a, b) => containmentDepth(a.id, doc) - containmentDepth(b.id, doc));
  return [...boundaries, ...rest];
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

// ---- containers ---------------------------------------------------------

function renderBoundary(b: Boundary, L: Layers, ctx: Ctx): void {
  // §3.4 v2.3: fill is derived from nesting depth, never chosen.
  // Depth 0 → none; depth ≥ 1 → #f8f9fa. Tint overrides regardless.
  const depth = containmentDepth(b.id, ctx.doc);
  let fill: string;
  let stroke: string;
  let back: string;
  if (b.tint) {
    const p = PALETTE[b.tint];
    fill = p.fill;
    stroke = p.stroke;
    back = p.fill;
  } else if (depth >= 1) {
    fill = '#f8f9fa';
    stroke = BOUNDARY_STROKE;
    back = '#f8f9fa';
  } else {
    fill = 'none';
    stroke = BOUNDARY_STROKE;
    back = '#ffffff';
  }

  // In interactive mode the boundary rect is made hit-testable so clicks in
  // its interior land on the boundary rather than falling through to the
  // background. Nested elements draw later in DOM order and still win.
  const peAttr = ctx.interactive ? ' pointer-events="all"' : '';
  L.boundaries.push(wrapId(ctx, b.id,
    `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="${fill}" ` +
    `stroke="${stroke}" stroke-width="1.2" stroke-dasharray="6 4"${peAttr}/>`
  ));

  const tw = textWidth(b.label, 12) + 12;
  let tx: number; let anchor: string; let bx: number;
  if (b.labelSide === 'right') {
    tx = b.x + b.w - 15;
    anchor = ' text-anchor="end"';
    bx = b.x + b.w - 15 - tw + 6;
  } else {
    tx = b.x + 15;
    anchor = '';
    bx = b.x + 9;
  }
  L.blabels.push(
    `<rect x="${num(bx)}" y="${num(b.y + 8)}" width="${num(tw)}" height="18" fill="${back}"/>` +
    `<text x="${num(tx)}" y="${num(b.y + 21)}"${anchor} font-size="12" fill="${SUB}">${esc(b.label)}</text>`
  );

  // §8.3 — Vendor mark badge in the top-right corner opposite the label.
  // Push to blabels so it sits above the boundary rect but under nodes.
  if (b.markId) {
    const size = 24;
    // If the label is right-aligned, put the badge top-left instead so they
    // don't collide.
    const bx2 = b.labelSide === 'right' ? b.x + 10 : b.x + b.w - size - 10;
    const by2 = b.y + 10;
    const badge = markSvg(b.markId, bx2, by2, size);
    if (badge) L.blabels.push(wrapId(ctx, b.id, badge));
  }
}

function renderZoneDivider(z: ZoneDivider, L: Layers, ctx: Ctx): void {
  const w = zoneDividerChipWidth(z.label);
  const line =
    `<line x1="${num(z.x)}" y1="${num(z.y1 + 22)}" x2="${num(z.x)}" y2="${num(z.y2)}" stroke="${BOUNDARY_STROKE}" ` +
    `stroke-width="1" stroke-dasharray="6 4"/>`;
  const chip =
    `<rect x="${num(z.x - w / 2)}" y="${num(z.y1)}" width="${num(w)}" height="18" rx="9" fill="#ffffff" stroke="${BOUNDARY_STROKE}"/>` +
    `<text x="${num(z.x)}" y="${num(z.y1 + 12)}" text-anchor="middle" font-size="8" font-weight="700" ` +
    `font-family="${MONO_FAMILY}" fill="${SUB}">${esc(z.label.toUpperCase())}</text>`;
  L.boundaries.push(wrapId(ctx, z.id, line + chip));
}

// ---- elements -----------------------------------------------------------

function renderElement(e: Element, L: Layers, warnings: string[], ctx: Ctx): void {
  // §8 v2.3 — badge form: square whose side matches sm/md/lg, mark centred
  // at ~66% of the box side, text label suppressed. The label survives in
  // the model for alt-text.
  if (e.markStyle === 'badge' && e.markId) {
    const BADGE = { sm: 64, md: 90, lg: 120 }[e.size ?? 'md'];
    const MARK = Math.round(BADGE * 0.66);
    const { fill: f, stroke: s } = PALETTE[e.color ?? 'white'];
    const parts: string[] = [
      `<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(BADGE)}" height="${num(BADGE)}" fill="${f}" stroke="${s}"/>`,
      markSvg(e.markId, e.x + (BADGE - MARK) / 2, e.y + (BADGE - MARK) / 2, MARK),
    ];
    L.nodes.push(wrapId(ctx, e.id, parts.join('')));
    return;
  }

  const size = e.size ?? 'sm';
  const [, h] = SIZES[size];
  // Width expands past the sm/md/lg default when the label doesn't fit,
  // matching the pattern used for grouped and inline controls. Height is
  // still fixed per §3.1.
  const w = elementWidth(e);
  const { fill: f, stroke: s } = PALETTE[e.color ?? 'white'];
  const parts: string[] = [
    `<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(w)}" height="${num(h)}" fill="${f}" stroke="${s}"/>`,
  ];

  // §8.2 — a mark replaces the icon; presence of markId is authoritative.
  const hasMark = !!e.markId;
  const hasIcon = !hasMark && !!e.icon;
  const hasGlyph = hasMark || hasIcon;
  const MARK_SM_SIZE = 16;
  const MARK_MD_SIZE = 20;

  if (size === 'sm') {
    if (hasMark) parts.push(markSvg(e.markId, e.x + 10, e.y + 9, MARK_SM_SIZE));
    else if (hasIcon) parts.push(iconSvg(e.icon, e.x + 10, e.y + 9));
    const tx = hasGlyph ? e.x + 31 : e.x + w / 2;
    const anchor = hasGlyph ? '' : ' text-anchor="middle"';
    parts.push(
      `<text x="${num(tx)}" y="${num(e.y + h / 2 + 4)}"${anchor} font-size="12" fill="${INK}">${esc(e.label)}</text>`
    );
  } else {
    const wrapped = wrap(e.label, w - 30, 12.5, e.label);
    warnings.push(...wrapped.warnings);
    const lines = wrapped.lines;
    const n = lines.length + (e.sub ? 1 : 0);

    if (hasGlyph && lines.length > 1 && h < 92) {
      warnings.push(`"${e.label}" needs a large element (icon/mark + two lines)`);
    }

    let ty: number;
    if (hasGlyph) {
      const block = 16 + 6 + n * 16;
      const top = e.y + (h - block) / 2;
      if (hasMark) parts.push(markSvg(e.markId, e.x + w / 2 - MARK_MD_SIZE / 2, top - 2, MARK_MD_SIZE));
      else if (hasIcon) parts.push(iconSvg(e.icon, e.x + w / 2 - 8, top));
      ty = top + 16 + 6 + 12;
    } else {
      ty = e.y + h / 2 + 4 - (n - 1) * 8;
    }
    for (const ln of lines) {
      parts.push(
        `<text x="${num(e.x + w / 2)}" y="${num(ty)}" text-anchor="middle" font-size="12.5" fill="${INK}">${esc(ln)}</text>`
      );
      ty += 16;
    }
    if (e.sub) {
      parts.push(
        `<text x="${num(e.x + w / 2)}" y="${num(ty)}" text-anchor="middle" font-size="11.5" fill="${INK}">${esc(e.sub)}</text>`
      );
    }
  }
  L.nodes.push(wrapId(ctx, e.id, parts.join('')));
}

function renderGrouped(g: Grouped, L: Layers, _warnings: string[], ctx: Ctx): void {
  // §3.2 default width is 190; we expand horizontally to fit the widest
  // label (header or any row) so long labels never overflow the row rect.
  const w = groupedWidth(g);
  const h = 46 + g.children.length * 30 + (g.children.length - 1) * 5 + 10;
  const { fill: f, stroke: s } = PALETTE[g.color ?? 'white'];
  const parts: string[] = [
    `<rect x="${num(g.x)}" y="${num(g.y)}" width="${num(w)}" height="${num(h)}" fill="${f}" stroke="${s}"/>`,
    `<text x="${num(g.x + w / 2)}" y="${num(g.y + 26)}" text-anchor="middle" font-size="12" fill="${INK}">${esc(g.label)}</text>`,
  ];
  g.children.forEach((c, i) => {
    const cy = g.y + 46 + i * 35;
    parts.push(
      `<rect x="${num(g.x + 10)}" y="${num(cy)}" width="${num(w - 20)}" height="30" fill="#ffffff" stroke="#d3d9e0"/>`
    );
    if (c.icon) parts.push(iconSvg(c.icon, g.x + 18, cy + 7));
    const tx = c.icon ? g.x + 41 : g.x + w / 2;
    const anchor = c.icon ? '' : ' text-anchor="middle"';
    parts.push(
      `<text x="${num(tx)}" y="${num(cy + 19)}"${anchor} font-size="11.5" fill="${INK}">${esc(c.label)}</text>`
    );
  });
  L.nodes.push(wrapId(ctx, g.id, parts.join('')));
}

function renderInlineControl(c: InlineControl, L: Layers, ctx: Ctx): void {
  const w = inlineControlWidth(c.label, !!c.icon);
  const h = 36;
  const parts: string[] = [
    `<rect x="${num(c.x)}" y="${num(c.y)}" width="${num(w)}" height="${num(h)}" rx="18" fill="#ffffff" ` +
    `stroke="${LABEL_STROKE}" stroke-width="1.5"/>`,
  ];
  if (c.icon) parts.push(iconSvg(c.icon, c.x + 12, c.y + 10, 0.667));
  const tx = c.icon ? c.x + 38 : c.x + w / 2;
  const anchor = c.icon ? '' : ' text-anchor="middle"';
  parts.push(
    `<text x="${num(tx)}" y="${num(c.y + h / 2 + 4)}"${anchor} font-size="12" fill="${INK}">${esc(c.label)}</text>`
  );
  L.nodes.push(wrapId(ctx, c.id, parts.join('')));
}

function renderActor(a: Actor, L: Layers, ctx: Ctx): void {
  const ic = a.icon ?? DEFAULT_ACTOR_ICON;
  const parts: string[] = [
    iconSvg(ic, a.cx - 16, a.y, 1.333),
    `<text x="${num(a.cx)}" y="${num(a.y + 50)}" text-anchor="middle" font-size="12" fill="${INK}">${esc(a.label)}</text>`,
  ];
  L.nodes.push(wrapId(ctx, a.id, parts.join('')));
}

// ---- connectors ---------------------------------------------------------

function renderEdge(e: Edge, L: Layers, ctx: Ctx): void {
  const d = 'M' + e.points.map(([x, y]) => `${num(x)},${num(y)}`).join(' L');
  const col = e.dashed ? CONN_DASHED : CONN;
  const dash = e.dashed ? ' stroke-dasharray="5 4"' : '';
  const arrow = e.arrow !== false;
  const mk = arrow ? ` marker-end="url(#${e.dashed ? 'ard' : 'ar'})"` : '';
  L.edges.push(wrapId(ctx, e.id,
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.3"${dash}${mk}/>`
  ));
}

function renderConnectorLabel(c: ConnectorLabel, L: Layers, ctx: Ctx): void {
  L.labels.push(wrapId(ctx, c.id, pillSvg({
    cx: c.cx, cy: c.cy,
    text: c.text,
    optional: c.optional ?? '',
    num: c.num ?? '',
  })));
}

/**
 * Connector-label pill geometry ported from reference/v2.py::clabel(). Text
 * is uppercased and centred; optional secondary text runs alongside the
 * label; number badge occupies a leading circle. Returned as an SVG string
 * fragment (not wrapped in <g>) so both ConnectorLabel and Connector can
 * decide how to identify it.
 */
function pillSvg(o: { cx: number; cy: number; text: string; optional: string; num: string }): string {
  const CW = 5.0;
  const GAP = 8;
  const lines = o.text.toUpperCase().split('\n');
  const opt = o.optional.toUpperCase();
  const lastIdx = lines.length - 1;

  const lw = lines.map((l, i) =>
    l.length * CW + (i === lastIdx && opt ? GAP + opt.length * CW : 0)
  );
  const badge = o.num ? 20 : 0;
  const w = Math.max(46, Math.max(...lw) + 22 + badge);
  const h = lines.length > 1 ? 32 : 18;
  const x = o.cx - w / 2;
  const y = o.cy - h / 2;

  const parts: string[] = [
    `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(h / 2)}" fill="#ffffff" stroke="${LABEL_STROKE}"/>`,
  ];

  if (o.num) {
    parts.push(
      `<circle cx="${num(x + 13)}" cy="${num(o.cy)}" r="7.5" fill="#ffffff" stroke="${LABEL_STROKE}"/>` +
      `<text x="${num(x + 13)}" y="${num(o.cy + 3)}" text-anchor="middle" font-size="8" font-weight="700" ` +
      `font-family="${MONO_FAMILY}" fill="${ICON_COLOR}">${esc(o.num)}</text>`
    );
  }

  const tcx = x + badge + (w - badge) / 2;
  const sy = lines.length > 1 ? o.cy - 4 : o.cy + 3;
  const F = `font-size="8" font-family="${MONO_FAMILY}" text-anchor="middle"`;

  lines.forEach((ln, i) => {
    const ty = sy + i * 12;
    if (i === lastIdx && opt) {
      const mw = ln.length * CW;
      const ow = opt.length * CW;
      const total = mw + GAP + ow;
      parts.push(
        `<text x="${num(tcx - total / 2 + mw / 2)}" y="${num(ty)}" ${F} font-weight="700" fill="${ICON_COLOR}">${esc(ln)}</text>`
      );
      parts.push(
        `<text x="${num(tcx + total / 2 - ow / 2)}" y="${num(ty)}" ${F} fill="${OPTIONAL_TEXT}">${esc(opt)}</text>`
      );
    } else {
      parts.push(
        `<text x="${num(tcx)}" y="${num(ty)}" ${F} font-weight="700" fill="${ICON_COLOR}">${esc(ln)}</text>`
      );
    }
  });

  return parts.join('');
}

function renderConnector(c: Connector, L: Layers, ctx: Ctx): void {
  const from = ctx.bboxes.get(c.from);
  const to = ctx.bboxes.get(c.to);
  if (!from || !to) return; // Endpoint gone — connector renders nothing.

  // Sibling awareness: connectors sharing the same unordered endpoint pair
  // are spaced along the shared edge per §4. We index by DOM order among
  // items with the same {from, to} set.
  const pairKey = [c.from, c.to].slice().sort().join('|');
  const siblings = ctx.items.filter((it): it is Connector =>
    it.kind === 'connector' && [it.from, it.to].slice().sort().join('|') === pairKey
  );
  const index = siblings.findIndex((s) => s.id === c.id);
  const total = siblings.length;

  const route = routeConnector(from, to, c.routing ?? 'straight', { index, total });
  const d = 'M' + route.points.map(([x, y]) => `${num(x)},${num(y)}`).join(' L');
  const col = c.dashed ? CONN_DASHED : CONN;
  const dash = c.dashed ? ' stroke-dasharray="5 4"' : '';

  const arrows: 'none' | 'target' | 'source' | 'both' = c.arrows ?? 'target';
  const arrowId = c.dashed ? 'ard' : 'ar';
  const mkEnd = arrows === 'target' || arrows === 'both' ? ` marker-end="url(#${arrowId})"` : '';
  const mkStart = arrows === 'source' || arrows === 'both' ? ` marker-start="url(#${arrowId})"` : '';

  L.edges.push(wrapId(ctx, c.id,
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.3"${dash}${mkStart}${mkEnd}/>`
  ));

  // Optional embedded label at the route midpoint. Reuses the same pill
  // geometry as ConnectorLabel so the two shapes are visually identical.
  const hasLabel = (c.label && c.label.length > 0) || (c.num && c.num.length > 0);
  if (hasLabel) {
    const [mx, my] = route.mid;
    const pill = pillSvg({
      cx: mx, cy: my,
      text: c.label ?? '',
      optional: c.optional ?? '',
      num: c.num ?? '',
    });
    // Under interactive mode, wrap the pill under the connector's id too so
    // clicking either the line or the label selects the connector.
    L.labels.push(wrapId(ctx, c.id, pill));
  }
}

function renderLegend(lg: Legend, L: Layers, ctx: Ctx): void {
  const h = 26 + lg.rows.length * 16;
  const rowMax = lg.rows.length > 0
    ? Math.max(...lg.rows.map(([, lab]) => textWidth(lab, 10)))
    : 0;
  const w = Math.max(150, rowMax + 56, textWidth(lg.encoding, 9) + 30);
  const parts: string[] = [
    `<rect x="${num(lg.x)}" y="${num(lg.y)}" width="${num(w)}" height="${num(h)}" rx="6" fill="#ffffff" stroke="#e4e8ec"/>`,
    `<text x="${num(lg.x + 12)}" y="${num(lg.y + 17)}" font-size="9" font-weight="700" font-family="${MONO_FAMILY}" ` +
    `fill="${SUB}">${esc(lg.encoding.toUpperCase())}</text>`,
  ];
  lg.rows.forEach(([color, lab], i) => {
    const { fill: f, stroke: s } = PALETTE[color];
    const ry = lg.y + 25 + i * 16;
    parts.push(
      `<rect x="${num(lg.x + 12)}" y="${num(ry)}" width="14" height="10" rx="2" fill="${f}" stroke="${s}"/>` +
      `<text x="${num(lg.x + 32)}" y="${num(ry + 9)}" font-size="10" fill="${INK}">${esc(lab)}</text>`
    );
  });
  L.labels.push(wrapId(ctx, lg.id, parts.join('')));
}

function renderCaption(c: Caption, L: Layers, ctx: Ctx): void {
  L.labels.push(wrapId(ctx, c.id,
    `<text x="${num(c.x)}" y="${num(c.y)}" font-size="11" fill="${SUB}">${esc(c.text)}</text>`
  ));
}
