import { bbox } from './layout';
import { TOKENS } from './tokens';
import type { DiagramDoc } from './model';

/**
 * Canvas sizing rules.
 *
 * The style guide (§11) defines no canvas dimensions — it constrains what
 * goes *on* the canvas, not how big the canvas is. So size is free-form
 * rather than a set of brand presets; the only constraints are practical:
 * stay on the 10px grid, stay within sane bounds, and never shrink below
 * the content already placed.
 *
 * Pure. No DOM — the drag handles and the toolbar inputs both funnel
 * through clampCanvasSize() so the two entry points cannot disagree.
 */

export const CANVAS_MIN_W = 400;
export const CANVAS_MIN_H = 300;
export const CANVAS_MAX_W = 4000;
export const CANVAS_MAX_H = 4000;

/**
 * Bottom-right extent of everything on the canvas, rounded up to the grid.
 * Connectors are excluded: they have no independent geometry, they're
 * derived from the items they join.
 *
 * Returns {w: 0, h: 0} for an empty doc so a blank canvas can shrink to
 * the hard minimum.
 */
export function contentExtent(items: DiagramDoc['items']): { w: number; h: number } {
  const grid = TOKENS.canvas.grid;
  let w = 0;
  let h = 0;
  for (const item of items) {
    if (item.kind === 'connector') continue;
    const b = bbox(item);
    w = Math.max(w, b.x + b.w);
    h = Math.max(h, b.y + b.h);
  }
  return {
    w: Math.ceil(Math.max(0, w) / grid) * grid,
    h: Math.ceil(Math.max(0, h) / grid) * grid,
  };
}

/**
 * Snap a requested size to the grid and clamp it into the legal range.
 *
 * The floor is max(hard minimum, content extent): shrinking past the
 * diagram would otherwise either clip items or silently shove them
 * inward, and moving a user's diagram as a side effect of dragging a
 * resize handle is the more surprising of the two. The handle simply
 * stops. Non-finite input falls back to the current dimension.
 */
export function clampCanvasSize(
  requestedW: number,
  requestedH: number,
  doc: DiagramDoc,
): { width: number; height: number } {
  const grid = TOKENS.canvas.grid;
  const content = contentExtent(doc.items);
  const minW = Math.min(Math.max(CANVAS_MIN_W, content.w), CANVAS_MAX_W);
  const minH = Math.min(Math.max(CANVAS_MIN_H, content.h), CANVAS_MAX_H);

  const w = Number.isFinite(requestedW) ? requestedW : doc.width;
  const h = Number.isFinite(requestedH) ? requestedH : doc.height;

  return {
    width: clamp(Math.round(w / grid) * grid, minW, CANVAS_MAX_W),
    height: clamp(Math.round(h / grid) * grid, minH, CANVAS_MAX_H),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
