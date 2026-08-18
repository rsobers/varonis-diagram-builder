import { clampCanvasSize } from '../canvasSize';
import { TOKENS } from '../tokens';
import type { Editor } from '../editorState';

/**
 * Drag handles on the base canvas — right edge, bottom edge, and the
 * bottom-right corner.
 *
 * The handles are HTML, not SVG: they resize the SVG element itself, so
 * they cannot live inside its coordinate space. They are positioned over
 * the SVG's rendered box on every state change.
 *
 * Drag model follows the item-drag idiom in interactions.ts — resize the
 * SVG in place during pointermove (no state change, no re-render), then
 * dispatch a single action on pointerup. That keeps one drag to one undo
 * entry instead of one per pointer event.
 */

type Mode = 'e' | 's' | 'se';

const MODES: { mode: Mode; cursor: string; label: string }[] = [
  { mode: 'e', cursor: 'ew-resize', label: 'Resize canvas width' },
  { mode: 's', cursor: 'ns-resize', label: 'Resize canvas height' },
  { mode: 'se', cursor: 'nwse-resize', label: 'Resize canvas' },
];

export function attachCanvasResize(
  svg: SVGSVGElement,
  container: HTMLElement,
  editor: Editor,
): () => void {
  const handles = MODES.map(({ mode, cursor, label }) => {
    const el = document.createElement('div');
    el.className = `canvas-handle canvas-handle-${mode}`;
    el.dataset['mode'] = mode;
    el.style.cursor = cursor;
    el.tabIndex = 0;
    el.setAttribute('role', 'separator');
    el.setAttribute('aria-label', label);
    el.title = 'Drag to resize the canvas';
    container.appendChild(el);
    return el;
  });

  let drag: {
    mode: Mode; pointerId: number;
    startX: number; startY: number;
    startW: number; startH: number;
    scale: number;
    width: number; height: number;
  } | null = null;

  /**
   * Rendered-pixels per doc-unit. The SVG is `max-width: 100%`, so on a
   * narrow window it draws smaller than its intrinsic size and a raw
   * pixel delta would over-resize the doc.
   */
  function currentScale(): number {
    const rect = svg.getBoundingClientRect();
    const w = editor.getState().doc.width;
    if (!rect.width || !w) return 1;
    return rect.width / w;
  }

  /** Park the handles on the SVG's current rendered edges. */
  function position(): void {
    const svgRect = svg.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const left = svgRect.left - box.left + container.scrollLeft;
    const top = svgRect.top - box.top + container.scrollTop;
    const { width, height } = svgRect;
    for (const el of handles) {
      const mode = el.dataset['mode'] as Mode;
      if (mode === 'e') {
        el.style.left = `${left + width - 3}px`;
        el.style.top = `${top}px`;
        el.style.width = '7px';
        el.style.height = `${height}px`;
      } else if (mode === 's') {
        el.style.left = `${left}px`;
        el.style.top = `${top + height - 3}px`;
        el.style.width = `${width}px`;
        el.style.height = '7px';
      } else {
        el.style.left = `${left + width - 7}px`;
        el.style.top = `${top + height - 7}px`;
        el.style.width = '14px';
        el.style.height = '14px';
      }
    }
  }

  /**
   * Live preview during a drag. Only the SVG's own box changes — the
   * rendered content is untouched, and the element's white CSS background
   * fills the new area so the canvas reads as genuinely growing.
   */
  function preview(width: number, height: number): void {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    position();
  }

  function onPointerDown(ev: PointerEvent): void {
    const el = ev.currentTarget as HTMLElement;
    const doc = editor.getState().doc;
    drag = {
      mode: el.dataset['mode'] as Mode,
      pointerId: ev.pointerId,
      startX: ev.clientX, startY: ev.clientY,
      startW: doc.width, startH: doc.height,
      scale: currentScale(),
      width: doc.width, height: doc.height,
    };
    el.setPointerCapture(ev.pointerId);
    el.classList.add('dragging');
    document.body.classList.add('resizing-canvas');
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const dx = (ev.clientX - drag.startX) / drag.scale;
    const dy = (ev.clientY - drag.startY) / drag.scale;
    const wantW = drag.mode === 's' ? drag.startW : drag.startW + dx;
    const wantH = drag.mode === 'e' ? drag.startH : drag.startH + dy;
    // Clamp through the same pure function the reducer uses, so the
    // preview can never show a size the commit would refuse.
    const { width, height } = clampCanvasSize(wantW, wantH, editor.getState().doc);
    drag.width = width;
    drag.height = height;
    preview(width, height);
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const el = ev.currentTarget as HTMLElement;
    try { el.releasePointerCapture(ev.pointerId); } catch { /* already released */ }
    el.classList.remove('dragging');
    document.body.classList.remove('resizing-canvas');
    const { width, height } = drag;
    drag = null;
    editor.dispatch({ kind: 'setCanvasSize', width, height });
  }

  /** Arrow keys nudge by one grid step, shift-arrows by ten. */
  function onKeyDown(ev: KeyboardEvent): void {
    const el = ev.currentTarget as HTMLElement;
    const mode = el.dataset['mode'] as Mode;
    const grid = TOKENS.canvas.grid;
    const step = grid * (ev.shiftKey ? 10 : 1);
    const doc = editor.getState().doc;
    let { width, height } = doc;
    if (ev.key === 'ArrowRight' && mode !== 's') width += step;
    else if (ev.key === 'ArrowLeft' && mode !== 's') width -= step;
    else if (ev.key === 'ArrowDown' && mode !== 'e') height += step;
    else if (ev.key === 'ArrowUp' && mode !== 'e') height -= step;
    else return;
    ev.preventDefault();
    editor.dispatch({ kind: 'setCanvasSize', width, height });
  }

  for (const el of handles) {
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('keydown', onKeyDown);
  }
  window.addEventListener('resize', position);
  const unsubscribe = editor.subscribe(position);
  // The SVG also changes size for reasons that are neither a state change
  // nor a window resize — most obviously a sidebar drag reflowing the grid
  // under it. Observing the element itself covers every case.
  const observer = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => { if (!drag) position(); })
    : null;
  observer?.observe(svg);
  position();

  return () => {
    unsubscribe();
    observer?.disconnect();
    window.removeEventListener('resize', position);
    for (const el of handles) {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('keydown', onKeyDown);
      el.remove();
    }
  };
}
