import type { Editor } from './editorState';
import { snapTo } from './editorState';
import type { Item } from './model';
import { buildCopy, buildPaste } from './copyPaste';
import { layout, type BBox } from './layout';
import { snapInlineControlToNearestConnector } from './attach';

export type InteractionOptions = {
  /** Called with brief user-facing messages ("Now click the target"). */
  toast?: (msg: string) => void;
};

/**
 * DOM event wiring for the canvas. Everything that touches pointer events,
 * SVG DOM, or the keyboard lives here — render.ts stays a pure function.
 *
 * Drag model: during pointermove we translate the selected <g> elements
 * in-place (no re-render, no state change). On pointerup we dispatch a single
 * `move` action with the *snapped* delta, and the resulting re-render clears
 * the transient transform.
 *
 * Snap rule: we compute the primary item's proposed new *position* and snap
 * that to grid, then derive the delta from it. Applied to every dragged item,
 * so multi-select keeps its relative offsets.
 *
 * Connect mode: when state.mode === 'connect', pointerdown on an item first
 * sets pending, then a second pointerdown on a different item creates the
 * connector via reducer. A second click on the same item cancels.
 */
export function attachInteractions(svg: SVGSVGElement, editor: Editor, options: InteractionOptions = {}): () => void {
  const toast = options.toast ?? (() => { /* no-op */ });
  let clipboard: Item[] = [];
  let drag: DragState | null = null;
  let resize: ResizeState | null = null;
  let marquee: MarqueeState | null = null;
  let labelDrag: LabelDragState | null = null;

  function toSVG(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: e.clientX, y: e.clientY };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function hit(target: EventTarget | null): string | null {
    const el = target instanceof Element ? target.closest('[data-item-id]') : null;
    return el?.getAttribute('data-item-id') ?? null;
  }

  function itemById(id: string): Item | undefined {
    return editor.getState().doc.items.find((i) => i.id === id);
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const state = editor.getState();

    // Doc title strip acts like a text field: single click opens the
    // editor immediately. Double-click on SVG groups with layered hit
    // targets is unreliable in Chromium (two clicks may resolve to
    // different sub-elements), so we don't rely on it here.
    const titleEl = (e.target instanceof Element) ? e.target.closest('[data-doc-title]') : null;
    if (titleEl && state.mode === 'select' && !state.placing) {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('vdb:open-doc-title'));
      return;
    }

    // Connector label drag — takes priority over normal item drag. Users
    // grab the pill directly to slide it along the connector line.
    const labelEl = (e.target instanceof Element) ? e.target.closest('[data-connector-label]') : null;
    const labelConnId = labelEl?.getAttribute('data-connector-label');
    if (labelConnId && state.mode === 'select' && !state.placing) {
      const pathEl = svg.querySelector<SVGPathElement>(
        `[data-item-id="${cssEsc(labelConnId)}"] path`
      );
      const pillGroup = labelEl as SVGGElement;
      if (pathEl) {
        const points = parsePathPoints(pathEl.getAttribute('d') ?? '');
        if (points.length >= 2) {
          const bb = pillGroup.getBBox();
          labelDrag = {
            pointerId: e.pointerId,
            connectorId: labelConnId,
            routePoints: points,
            pillGroup,
            startCentre: { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 },
            lastT: null,
            moved: false,
          };
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }

    // Resize handles take priority — overlays atop their owner's group.
    const handleEl = (e.target instanceof Element) ? e.target.closest('[data-resize]') : null;
    const handleId = handleEl?.getAttribute('data-resize');
    const handleMode = handleEl?.getAttribute('data-resize-mode') as 'br' | 'y1' | 'y2' | null;
    if (handleId && handleMode) {
      const item = itemById(handleId);
      if (item?.kind === 'boundary' && handleMode === 'br') {
        resize = {
          pointerId: e.pointerId, id: handleId, mode: 'br',
          startSVG: toSVG(e), startW: item.w, startH: item.h,
        };
        svg.setPointerCapture(e.pointerId);
        e.preventDefault();
      } else if (item?.kind === 'zoneDivider' && (handleMode === 'y1' || handleMode === 'y2')) {
        resize = {
          pointerId: e.pointerId, id: handleId, mode: handleMode,
          startSVG: toSVG(e),
          startY: handleMode === 'y1' ? item.y1 : item.y2,
        };
        svg.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
      return;
    }

    // Placement mode: next click places the item at the snapped point.
    if (state.placing) {
      const p = toSVG(e);
      const x = state.snap ? snapTo(p.x, state.gridSize) : p.x;
      const y = state.snap ? snapTo(p.y, state.gridSize) : p.y;
      const draft = state.placing.factory(x, y);
      const newItemId = editor.newId();
      editor.dispatch({ kind: 'add', id: newItemId, item: draft });
      maybeSnapToConnector(newItemId);
      e.preventDefault();
      return;
    }

    const id = hit(e.target);

    // Connect mode has its own click semantics — no drag, no selection ring.
    if (state.mode === 'connect') {
      if (!id) {
        // Click empty canvas cancels pending source.
        if (state.pending) {
          editor.dispatch({ kind: 'cancelConnect' });
          toast('Connect cancelled.');
        }
        return;
      }
      if (!state.pending) {
        editor.dispatch({ kind: 'startConnect', id });
        toast('Now click the target element.');
      } else if (state.pending === id) {
        editor.dispatch({ kind: 'cancelConnect' });
        toast('Connect cancelled.');
      } else {
        editor.dispatch({ kind: 'finishConnect', targetId: id, connectorId: editor.newId() });
      }
      e.preventDefault();
      return;
    }

    if (!id) {
      // Empty canvas: begin a marquee. Whether it becomes a "click to clear"
      // or "drag to select intersecting items" is decided on pointerup based
      // on whether any move happened.
      marquee = {
        pointerId: e.pointerId,
        startSVG: toSVG(e),
        currentSVG: toSVG(e),
        shiftKey: e.shiftKey,
        rect: null,
        moved: false,
      };
      return;
    }

    // If the click target isn't already selected, replace selection.
    // Shift+click toggles.
    if (e.shiftKey) {
      editor.dispatch({ kind: 'select', ids: [id], mode: 'toggle' });
      return;
    }
    if (!state.selection.has(id)) {
      editor.dispatch({ kind: 'select', ids: [id], mode: 'replace' });
    }

    // Begin drag from post-select state.
    const post = editor.getState();
    if (!post.selection.has(id)) return;

    const primary = itemById(id);
    if (!primary) return;
    const anchor = anchorOf(primary);

    const ids = [...post.selection];
    const groups = ids
      .map((sid) => svg.querySelector<SVGGElement>(`[data-item-id="${cssEsc(sid)}"]`))
      .filter((g): g is SVGGElement => g !== null);

    drag = {
      pointerId: e.pointerId,
      primaryId: id,
      primaryStart: anchor,
      startSVG: toSVG(e),
      ids,
      groups,
      lastDelta: { x: 0, y: 0 },
      moved: false,
    };
    // Deferred pointer capture: we set it on the first real move rather than
    // on pointerdown, so click and dblclick events aren't suppressed. Text
    // selection during drag is blocked via CSS user-select: none.
  }

  function onPointerMove(e: PointerEvent): void {
    if (labelDrag && e.pointerId === labelDrag.pointerId) {
      const now = toSVG(e);
      const t = projectOntoPolyline(labelDrag.routePoints, now.x, now.y);
      const [tx, ty] = pointAlongPolyline(labelDrag.routePoints, t);
      const dx = tx - labelDrag.startCentre.x;
      const dy = ty - labelDrag.startCentre.y;
      labelDrag.pillGroup.setAttribute('transform', `translate(${dx} ${dy})`);
      if (!labelDrag.moved) {
        labelDrag.moved = true;
        try { svg.setPointerCapture(labelDrag.pointerId); } catch { /* already */ }
      }
      labelDrag.lastT = t;
      return;
    }
    if (marquee && e.pointerId === marquee.pointerId) {
      marquee.currentSVG = toSVG(e);
      const dx = marquee.currentSVG.x - marquee.startSVG.x;
      const dy = marquee.currentSVG.y - marquee.startSVG.y;
      if (!marquee.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        marquee.moved = true;
        marquee.rect = createMarqueeRect();
        svg.appendChild(marquee.rect);
        // Capture pointer so marquee follows even if it exits the SVG.
        try { svg.setPointerCapture(marquee.pointerId); } catch { /* already */ }
      }
      if (marquee.moved && marquee.rect) {
        const r = normalizeRect(marquee.startSVG, marquee.currentSVG);
        marquee.rect.setAttribute('x', String(r.x));
        marquee.rect.setAttribute('y', String(r.y));
        marquee.rect.setAttribute('width', String(r.w));
        marquee.rect.setAttribute('height', String(r.h));
      }
      return;
    }
    if (resize && e.pointerId === resize.pointerId) {
      const state = editor.getState();
      const now = toSVG(e);
      if (resize.mode === 'br') {
        let w = resize.startW + (now.x - resize.startSVG.x);
        let h = resize.startH + (now.y - resize.startSVG.y);
        if (state.snap) {
          w = snapTo(w, state.gridSize);
          h = snapTo(h, state.gridSize);
        }
        w = Math.max(60, w);
        h = Math.max(40, h);
        editor.dispatch({ kind: 'update', id: resize.id, patch: { w, h } });
      } else {
        // Zone divider — drag one endpoint along Y; enforce a min separation
        // from the other endpoint so the line never collapses.
        const item = itemById(resize.id);
        if (item?.kind !== 'zoneDivider') return;
        let yNew = resize.startY + (now.y - resize.startSVG.y);
        if (state.snap) yNew = snapTo(yNew, state.gridSize);
        if (resize.mode === 'y1') {
          yNew = Math.min(yNew, item.y2 - 40);
          editor.dispatch({ kind: 'update', id: resize.id, patch: { y1: yNew } });
        } else {
          yNew = Math.max(yNew, item.y1 + 40);
          editor.dispatch({ kind: 'update', id: resize.id, patch: { y2: yNew } });
        }
      }
      return;
    }
    if (!drag || e.pointerId !== drag.pointerId) return;
    const state = editor.getState();
    const now = toSVG(e);
    const rawDx = now.x - drag.startSVG.x;
    const rawDy = now.y - drag.startSVG.y;

    let dx = rawDx, dy = rawDy;
    if (state.snap) {
      const px = snapTo(drag.primaryStart.x + rawDx, state.gridSize);
      const py = snapTo(drag.primaryStart.y + rawDy, state.gridSize);
      dx = px - drag.primaryStart.x;
      dy = py - drag.primaryStart.y;
    }
    if (dx === drag.lastDelta.x && dy === drag.lastDelta.y) return;
    drag.lastDelta = { x: dx, y: dy };
    if (rawDx !== 0 || rawDy !== 0) {
      drag.moved = true;
      // Capture on the first real move so pointer events keep flowing to us
      // even if the pointer leaves the svg mid-drag.
      try { svg.setPointerCapture(drag.pointerId); } catch { /* already captured */ }
    }

    for (const g of drag.groups) {
      g.setAttribute('transform', `translate(${dx} ${dy})`);
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (labelDrag && e.pointerId === labelDrag.pointerId) {
      const { connectorId, lastT, moved, pillGroup } = labelDrag;
      labelDrag = null;
      try { svg.releasePointerCapture(e.pointerId); } catch { /* already */ }
      pillGroup.removeAttribute('transform');
      if (moved && lastT !== null) {
        editor.dispatch({
          kind: 'update', id: connectorId,
          patch: { labelOffset: Math.round(lastT * 1000) / 1000 },
        });
      }
      return;
    }
    if (marquee && e.pointerId === marquee.pointerId) {
      const m = marquee;
      marquee = null;
      if (m.rect) m.rect.remove();
      try { svg.releasePointerCapture(e.pointerId); } catch { /* already released */ }

      if (!m.moved) {
        // Bare click on empty canvas — clear selection (unless shift, in
        // which case leave the existing selection alone).
        if (!m.shiftKey) editor.dispatch({ kind: 'select', ids: [], mode: 'replace' });
        return;
      }

      // Marquee drag — collect items whose bboxes intersect the rect.
      const r = normalizeRect(m.startSVG, m.currentSVG);
      const bboxes = layout(editor.getState().doc);
      const ids: string[] = [];
      for (const [id, b] of bboxes) {
        if (rectIntersects(b, r)) ids.push(id);
      }
      editor.dispatch({
        kind: 'select', ids,
        mode: m.shiftKey ? 'add' : 'replace',
      });
      return;
    }
    if (resize && e.pointerId === resize.pointerId) {
      resize = null;
      try { svg.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      return;
    }
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { ids, lastDelta, moved, groups } = drag;
    drag = null;
    try { svg.releasePointerCapture(e.pointerId); } catch { /* pointer may already be released */ }
    // Clear transient transforms regardless — the re-render below would
    // rewrite the SVG anyway, but a lingering transform is ugly during the
    // brief tick before the state change flushes.
    for (const g of groups) g.removeAttribute('transform');

    if (moved && (lastDelta.x !== 0 || lastDelta.y !== 0)) {
      editor.dispatch({ kind: 'move', ids, dx: lastDelta.x, dy: lastDelta.y });
      // After a drag, if the moved item is a lone inline control, magnet it
      // onto the nearest connector line if within threshold.
      if (ids.length === 1) maybeSnapToConnector(ids[0]!);
    }
  }

  function maybeSnapToConnector(id: string): void {
    const item = itemById(id);
    if (item?.kind !== 'inlineControl') return;
    const snapped = snapInlineControlToNearestConnector(item, editor.getState().doc);
    if (!snapped) return;
    // Preserve grid snap by rounding to nearest grid only along the axis
    // parallel to the connector; the perpendicular axis is authoritative.
    editor.dispatch({ kind: 'update', id, patch: { x: snapped.x, y: snapped.y } });
  }

  function isInField(): boolean {
    const active = document.activeElement;
    return !!(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT'));
  }

  function onKeyDown(e: KeyboardEvent): void {
    const state = editor.getState();
    if (e.key === 'Escape') {
      if (state.placing) editor.dispatch({ kind: 'setPlacing', intent: null });
      else if (state.selection.size > 0) editor.dispatch({ kind: 'select', ids: [], mode: 'replace' });
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selection.size === 0) return;
      if (isInField()) return;
      editor.dispatch({ kind: 'delete', ids: [...state.selection] });
      e.preventDefault();
      return;
    }

    // Copy / Paste / Duplicate. Ignore modifier keypresses inside form
    // fields so browser text-editing shortcuts keep working.
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'c') {
      if (state.selection.size === 0 || isInField()) return;
      clipboard = buildCopy(state.doc, state.selection);
      toast(`Copied ${clipboard.length} item${clipboard.length === 1 ? '' : 's'}`);
      e.preventDefault();
      return;
    }
    if (mod && key === 'v') {
      if (clipboard.length === 0 || isInField()) return;
      const step = state.gridSize;
      const paste = buildPaste(clipboard, step, step, () => editor.newId());
      editor.dispatch({ kind: 'addMany', items: paste.items });
      editor.dispatch({ kind: 'select', ids: paste.ids, mode: 'replace' });
      e.preventDefault();
      return;
    }
    if (mod && key === 'd') {
      if (state.selection.size === 0 || isInField()) return;
      const copy = buildCopy(state.doc, state.selection);
      const step = state.gridSize;
      const paste = buildPaste(copy, step, step, () => editor.newId());
      editor.dispatch({ kind: 'addMany', items: paste.items });
      editor.dispatch({ kind: 'select', ids: paste.ids, mode: 'replace' });
      e.preventDefault();
      return;
    }

    const nudge = arrowNudge(e.key);
    if (nudge && state.selection.size > 0) {
      const step = e.shiftKey ? state.gridSize * 10 : state.gridSize;
      editor.dispatch({
        kind: 'move',
        ids: [...state.selection],
        dx: nudge.x * step, dy: nudge.y * step,
      });
      e.preventDefault();
    }
  }

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    svg.removeEventListener('pointerdown', onPointerDown);
    svg.removeEventListener('pointermove', onPointerMove);
    svg.removeEventListener('pointerup', onPointerUp);
    svg.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
  };
}

type DragState = {
  pointerId: number;
  primaryId: string;
  primaryStart: { x: number; y: number };
  startSVG: { x: number; y: number };
  ids: string[];
  groups: SVGGElement[];
  lastDelta: { x: number; y: number };
  moved: boolean;
};

type ResizeState =
  | { pointerId: number; id: string; mode: 'br';
      startSVG: { x: number; y: number }; startW: number; startH: number }
  | { pointerId: number; id: string; mode: 'y1' | 'y2';
      startSVG: { x: number; y: number }; startY: number };

type MarqueeState = {
  pointerId: number;
  startSVG: { x: number; y: number };
  currentSVG: { x: number; y: number };
  shiftKey: boolean;
  rect: SVGRectElement | null;
  moved: boolean;
};

type LabelDragState = {
  pointerId: number;
  connectorId: string;
  routePoints: Array<[number, number]>;
  pillGroup: SVGGElement;
  startCentre: { x: number; y: number };
  lastT: number | null;
  moved: boolean;
};

/**
 * Parse an `M x,y L x,y L x,y ...` connector path emitted by render.ts into
 * an array of points. The renderer only uses M and L (no curves), so a
 * regex sweep is sufficient.
 */
function parsePathPoints(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of d.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g)) {
    out.push([parseFloat(m[1]!), parseFloat(m[2]!)]);
  }
  return out;
}

/** Point at arc-length fraction t (0–1) along a polyline. */
function pointAlongPolyline(points: ReadonlyArray<[number, number]>, t: number): [number, number] {
  if (points.length < 2) return points[0] ?? [0, 0];
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    segLens.push(len);
    total += len;
  }
  if (total === 0) return points[0]!;
  let target = total * Math.max(0, Math.min(1, t));
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i]!) {
      const [x0, y0] = points[i]!;
      const [x1, y1] = points[i + 1]!;
      const f = segLens[i]! === 0 ? 0 : target / segLens[i]!;
      return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
    }
    target -= segLens[i]!;
  }
  return points[points.length - 1]!;
}

/**
 * Projects a point onto the polyline and returns the arc-length fraction
 * (0–1) of the closest point on the polyline. Used to convert a mouse
 * position into a labelOffset value the renderer can store.
 */
function projectOntoPolyline(points: ReadonlyArray<[number, number]>, x: number, y: number): number {
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    segLens.push(len);
    total += len;
  }
  if (total === 0) return 0.5;
  let bestT = 0, bestDist = Infinity, accum = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    const len = segLens[i - 1]!;
    if (len > 0) {
      const dx = x1 - x0, dy = y1 - y0;
      const tSeg = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (len * len)));
      const px = x0 + dx * tSeg, py = y0 + dy * tSeg;
      const dist = Math.hypot(x - px, y - py);
      if (dist < bestDist) {
        bestDist = dist;
        bestT = (accum + tSeg * len) / total;
      }
    }
    accum += len;
  }
  return bestT;
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): BBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function rectIntersects(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function createMarqueeRect(): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  el.setAttribute('class', 'marquee');
  el.setAttribute('fill', '#4c86d3');
  el.setAttribute('fill-opacity', '0.08');
  el.setAttribute('stroke', '#4c86d3');
  el.setAttribute('stroke-width', '1');
  el.setAttribute('stroke-dasharray', '3 3');
  el.setAttribute('pointer-events', 'none');
  return el;
}

function anchorOf(item: Item): { x: number; y: number } {
  switch (item.kind) {
    case 'actor':          return { x: item.cx, y: item.y };
    case 'connectorLabel': return { x: item.cx, y: item.cy };
    case 'zoneDivider':    return { x: item.x, y: item.y1 };
    case 'edge': {
      const first = item.points[0];
      return first ? { x: first[0], y: first[1] } : { x: 0, y: 0 };
    }
    case 'connector':
      // Connectors have no independent anchor — they follow their endpoints.
      return { x: 0, y: 0 };
    case 'boundary':
    case 'element':
    case 'grouped':
    case 'inlineControl':
    case 'legend':
    case 'caption':
    case 'title':
      return { x: item.x, y: item.y };
  }
}

function arrowNudge(key: string): { x: number; y: number } | null {
  switch (key) {
    case 'ArrowUp':    return { x: 0, y: -1 };
    case 'ArrowDown':  return { x: 0, y: 1 };
    case 'ArrowLeft':  return { x: -1, y: 0 };
    case 'ArrowRight': return { x: 1, y: 0 };
    default:           return null;
  }
}

/** Minimal CSS.escape for querySelector attribute values. */
function cssEsc(v: string): string {
  return v.replace(/["\\]/g, '\\$&');
}
