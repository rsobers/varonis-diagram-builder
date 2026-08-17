import { render } from '../render';
import { layout } from '../layout';
import { attachInteractions } from '../interactions';
import { attachInlineEdit } from './inlineEdit';
import { snapTo, type Editor, type EditorState } from '../editorState';
import { buildDraftFromSpec } from './palette';
import type { ItemDraft } from '../model';
import type { ColorName } from '../tokens';
import type { ToastFn } from './toast';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Owns the SVG surface. Full-tree re-render on state change (small SVGs;
 * cheap). The SVG element is stable across re-renders so pointer capture and
 * event listeners keep working — only its children get replaced.
 *
 * Drag-and-drop preview: on dragover we render a snapped, real-size ghost
 * of the incoming item inside the SVG so the user sees where it will land.
 * The browser's default drag image is suppressed via a transparent
 * setDragImage() so the ghost is the single visible follower.
 *
 * Selection rings are drawn here as an overlay using layout() bboxes; the
 * renderer stays unaware of selection.
 */
export function createCanvas(container: HTMLElement, editor: Editor, toast?: ToastFn): () => void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.classList.add('canvas-svg');
  container.appendChild(svg);

  const detachInteractions = attachInteractions(svg, editor, toast ? { toast } : {});
  const detachInlineEdit = attachInlineEdit(svg, container, editor);

  // Live drop-preview node. Rebuilt per dragover so a size change (spec
  // changed mid-drag, rare) still previews correctly.
  let previewGroup: SVGGElement | null = null;

  function clearPreview(): void {
    if (previewGroup && previewGroup.parentNode) {
      previewGroup.parentNode.removeChild(previewGroup);
    }
    previewGroup = null;
  }

  function toSVG(clientX: number, clientY: number): { x: number; y: number } {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function parsePayload(dataTransfer: DataTransfer | null): { spec: string; color: ColorName } | null {
    const raw = dataTransfer?.getData('application/x-vdb-item') || dataTransfer?.getData('text/plain');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { spec?: string; color?: string };
      if (!parsed.spec) return null;
      return { spec: parsed.spec, color: (parsed.color as ColorName) ?? 'white' };
    } catch { return null; }
  }

  function renderPreview(draft: ItemDraft): SVGGElement {
    // Render a single-item synthetic doc and lift the produced nodes into a
    // low-opacity preview group. Skips the defs/background so we don't wipe
    // the live SVG's markers.
    const state = editor.getState();
    const synthetic = {
      version: 1 as const,
      width: state.doc.width,
      height: state.doc.height,
      items: [{ ...draft, id: '__preview__' } as Parameters<typeof render>[0]['items'][number]],
    };
    const svgStr = render(synthetic).svg;
    const parsed = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'drop-preview');
    group.setAttribute('opacity', '0.55');
    group.setAttribute('pointer-events', 'none');
    for (const node of Array.from(parsed.documentElement.childNodes)) {
      // Skip <defs> and the full-canvas background rect (first rect child).
      if (node.nodeName === 'defs') continue;
      if (node.nodeName === 'rect') {
        const el = node as SVGRectElement;
        if (el.getAttribute('width') === String(state.doc.width) && el.getAttribute('fill') === '#ffffff') {
          continue;
        }
      }
      group.appendChild(node);
    }
    return group;
  }

  function onDragOver(ev: DragEvent): void {
    if (!ev.dataTransfer) return;
    const types = [...ev.dataTransfer.types];
    if (!types.includes('application/x-vdb-item') && !types.includes('text/plain')) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';

    const payload = parsePayload(ev.dataTransfer);
    if (!payload) return;

    const state = editor.getState();
    const p = toSVG(ev.clientX, ev.clientY);
    const x = state.snap ? snapTo(p.x, state.gridSize) : p.x;
    const y = state.snap ? snapTo(p.y, state.gridSize) : p.y;
    const draft = buildDraftFromSpec(payload.spec, payload.color, x, y);
    if (!draft) return;

    clearPreview();
    previewGroup = renderPreview(draft);
    svg.appendChild(previewGroup);
  }

  function onDragLeave(ev: DragEvent): void {
    // Only hide when the pointer leaves the CONTAINER, not when it moves over
    // an inner element. Detect by checking whether relatedTarget is a
    // descendant of the container.
    const to = ev.relatedTarget as Node | null;
    if (to && container.contains(to)) return;
    clearPreview();
  }

  function onDrop(ev: DragEvent): void {
    ev.preventDefault();
    clearPreview();
    const payload = parsePayload(ev.dataTransfer);
    if (!payload) return;

    const state = editor.getState();
    const p = toSVG(ev.clientX, ev.clientY);
    const x = state.snap ? snapTo(p.x, state.gridSize) : p.x;
    const y = state.snap ? snapTo(p.y, state.gridSize) : p.y;
    const draft = buildDraftFromSpec(payload.spec, payload.color, x, y);
    if (!draft) return;
    editor.dispatch({ kind: 'add', id: editor.newId(), item: draft });
  }

  function onDragEnd(): void { clearPreview(); }

  container.addEventListener('dragover', onDragOver);
  container.addEventListener('dragleave', onDragLeave);
  container.addEventListener('drop', onDrop);
  window.addEventListener('dragend', onDragEnd);

  function refresh(state: EditorState): void {
    const doc = state.doc;
    svg.setAttribute('viewBox', `0 0 ${doc.width} ${doc.height}`);
    svg.setAttribute('width', String(doc.width));
    svg.setAttribute('height', String(doc.height));

    // Render body, extract inner children into the stable outer <svg>. Any
    // previous preview group is thrown away in this replace; that's fine —
    // dragover fires immediately after each state change and re-inserts it.
    const rendered = render(doc, { interactive: true }).svg;
    const parsed = new DOMParser().parseFromString(rendered, 'image/svg+xml');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (const node of Array.from(parsed.documentElement.childNodes)) {
      svg.appendChild(node);
    }
    previewGroup = null;

    // Selection + pending overlays. Both use layout() bboxes; renderer is
    // still unaware of selection or connect state.
    const needsBboxes = state.selection.size > 0 || state.pending !== null;
    if (needsBboxes) {
      const bboxes = layout(doc);
      for (const id of state.selection) {
        const b = bboxes.get(id);
        if (!b) continue;
        svg.appendChild(makeRing(b, '#4c86d3', 1.5, '4 3'));
      }
      if (state.pending) {
        const b = bboxes.get(state.pending);
        if (b) {
          // Amber solid ring — a distinct hue from selection blue so the
          // user can tell "pending source" apart from "selected item".
          svg.appendChild(makeRing(b, '#e8a12b', 2.5, undefined));
        }
      }

      // Resize handles for the single selected item, per kind.
      if (state.selection.size === 1) {
        const selId = [...state.selection][0]!;
        const selItem = doc.items.find((i) => i.id === selId);
        const b = bboxes.get(selId);
        if (selItem?.kind === 'boundary' && b) {
          svg.appendChild(makeHandle(b.x + b.w - 6, b.y + b.h - 6, selId, 'br', 'nwse-resize'));
        } else if (selItem?.kind === 'zoneDivider') {
          // Two handles — drag the top (y1) or bottom (y2) endpoint along Y.
          svg.appendChild(makeHandle(selItem.x - 6, selItem.y1 - 6, selId, 'y1', 'ns-resize'));
          svg.appendChild(makeHandle(selItem.x - 6, selItem.y2 - 6, selId, 'y2', 'ns-resize'));
        }
      }
    }

    container.classList.toggle('placing', state.placing !== null);
    container.classList.toggle('mode-connect', state.mode === 'connect');
  }

  refresh(editor.getState());
  const unsubscribe = editor.subscribe(refresh);
  return () => {
    unsubscribe();
    detachInteractions();
    detachInlineEdit();
    container.removeEventListener('dragover', onDragOver);
    container.removeEventListener('dragleave', onDragLeave);
    container.removeEventListener('drop', onDrop);
    window.removeEventListener('dragend', onDragEnd);
  };
}

function makeHandle(
  x: number, y: number, id: string, mode: 'br' | 'y1' | 'y2', cursor: string,
): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', '12');
  el.setAttribute('height', '12');
  el.setAttribute('fill', '#ffffff');
  el.setAttribute('stroke', '#4c86d3');
  el.setAttribute('stroke-width', '1.5');
  el.setAttribute('data-resize', id);
  el.setAttribute('data-resize-mode', mode);
  el.setAttribute('style', `cursor: ${cursor}`);
  return el;
}

function makeRing(
  b: { x: number; y: number; w: number; h: number },
  stroke: string,
  width: number,
  dash?: string,
): SVGRectElement {
  const ring = document.createElementNS(SVG_NS, 'rect');
  ring.setAttribute('x', String(b.x - 4));
  ring.setAttribute('y', String(b.y - 4));
  ring.setAttribute('width', String(b.w + 8));
  ring.setAttribute('height', String(b.h + 8));
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', stroke);
  ring.setAttribute('stroke-width', String(width));
  if (dash) ring.setAttribute('stroke-dasharray', dash);
  ring.setAttribute('pointer-events', 'none');
  return ring;
}
