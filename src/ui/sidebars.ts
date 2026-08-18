import {
  clampSidebar, maxSidebarWidth, readPrefs, writePrefs, defaultStorage,
  type Prefs, type PrefsStorage,
} from '../prefs';

/**
 * Draggable gutters between the side panels and the canvas.
 *
 * The grid columns are driven by two CSS custom properties on #app; the
 * gutters are absolutely positioned strips sitting over the panel borders,
 * so no grid track has to be added and every existing grid-column
 * assignment keeps working.
 *
 * Widths persist through prefs (localStorage), not through DiagramDoc —
 * panel width is a property of the person, not of the diagram.
 */

type Side = 'left' | 'right';

export function attachSidebarResize(
  app: HTMLElement,
  storage: PrefsStorage = defaultStorage(),
): () => void {
  const prefs: Prefs = readPrefs(storage);

  const gutters: Record<Side, HTMLElement> = {
    left: makeGutter('left'),
    right: makeGutter('right'),
  };
  app.appendChild(gutters.left);
  app.appendChild(gutters.right);

  function widthOf(side: Side): number {
    return side === 'left' ? prefs.leftWidth : prefs.rightWidth;
  }

  /**
   * Apply a width to one side. Clamped against both the fixed bounds and
   * the room the opposite panel leaves; `persist` is false mid-drag so a
   * single drag writes storage once, on release.
   */
  function setWidth(side: Side, width: number, persist: boolean): void {
    const other = side === 'left' ? prefs.rightWidth : prefs.leftWidth;
    const max = maxSidebarWidth(window.innerWidth, other);
    const next = Math.min(clampSidebar(width), max);
    if (side === 'left') prefs.leftWidth = next;
    else prefs.rightWidth = next;
    paint();
    if (persist) writePrefs(storage, prefs);
  }

  function paint(): void {
    app.style.setProperty('--side-left', `${prefs.leftWidth}px`);
    app.style.setProperty('--side-right', `${prefs.rightWidth}px`);
    for (const side of ['left', 'right'] as const) {
      const g = gutters[side];
      g.setAttribute('aria-valuenow', String(widthOf(side)));
      g.setAttribute('aria-valuemax', String(maxSidebarWidth(window.innerWidth, side === 'left' ? prefs.rightWidth : prefs.leftWidth)));
    }
  }

  // Re-clamp on viewport change so a width stored on a wide monitor can't
  // strand the canvas on a narrow one.
  function onWindowResize(): void {
    setWidth('left', prefs.leftWidth, false);
    setWidth('right', prefs.rightWidth, false);
  }

  let drag: { side: Side; pointerId: number; startX: number; startWidth: number } | null = null;

  function onPointerDown(ev: PointerEvent): void {
    const target = ev.currentTarget as HTMLElement;
    const side = target.dataset['side'] as Side;
    drag = { side, pointerId: ev.pointerId, startX: ev.clientX, startWidth: widthOf(side) };
    target.setPointerCapture(ev.pointerId);
    target.classList.add('dragging');
    document.body.classList.add('resizing-col');
    ev.preventDefault();
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const delta = ev.clientX - drag.startX;
    // The right panel grows leftward, so its delta is inverted.
    setWidth(drag.side, drag.startWidth + (drag.side === 'left' ? delta : -delta), false);
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const target = ev.currentTarget as HTMLElement;
    try { target.releasePointerCapture(ev.pointerId); } catch { /* already released */ }
    target.classList.remove('dragging');
    document.body.classList.remove('resizing-col');
    drag = null;
    writePrefs(storage, prefs);
  }

  // Keyboard parity: a separator that can only be dragged is unusable
  // without a mouse. Arrows nudge by 10px, shift-arrows by 50px, Home
  // restores the default width.
  function onKeyDown(ev: KeyboardEvent): void {
    const target = ev.currentTarget as HTMLElement;
    const side = target.dataset['side'] as Side;
    const step = ev.shiftKey ? 50 : 10;
    let next: number | null = null;
    if (ev.key === 'ArrowLeft') next = widthOf(side) + (side === 'left' ? -step : step);
    else if (ev.key === 'ArrowRight') next = widthOf(side) + (side === 'left' ? step : -step);
    else if (ev.key === 'Home') next = side === 'left' ? 240 : 300;
    if (next === null) return;
    ev.preventDefault();
    setWidth(side, next, true);
  }

  // Double-click a gutter to snap that panel back to its default width.
  function onDoubleClick(ev: MouseEvent): void {
    const target = ev.currentTarget as HTMLElement;
    const side = target.dataset['side'] as Side;
    setWidth(side, side === 'left' ? 240 : 300, true);
  }

  for (const side of ['left', 'right'] as const) {
    const g = gutters[side];
    g.addEventListener('pointerdown', onPointerDown);
    g.addEventListener('pointermove', onPointerMove);
    g.addEventListener('pointerup', onPointerUp);
    g.addEventListener('pointercancel', onPointerUp);
    g.addEventListener('keydown', onKeyDown);
    g.addEventListener('dblclick', onDoubleClick);
  }
  window.addEventListener('resize', onWindowResize);

  paint();

  return () => {
    window.removeEventListener('resize', onWindowResize);
    for (const side of ['left', 'right'] as const) {
      const g = gutters[side];
      g.removeEventListener('pointerdown', onPointerDown);
      g.removeEventListener('pointermove', onPointerMove);
      g.removeEventListener('pointerup', onPointerUp);
      g.removeEventListener('pointercancel', onPointerUp);
      g.removeEventListener('keydown', onKeyDown);
      g.removeEventListener('dblclick', onDoubleClick);
      g.remove();
    }
  };
}

function makeGutter(side: Side): HTMLElement {
  const g = document.createElement('div');
  g.className = `col-gutter col-gutter-${side}`;
  g.dataset['side'] = side;
  g.tabIndex = 0;
  g.setAttribute('role', 'separator');
  g.setAttribute('aria-orientation', 'vertical');
  g.setAttribute('aria-valuemin', '180');
  g.setAttribute('aria-label', side === 'left' ? 'Resize palette panel' : 'Resize inspector panel');
  g.title = 'Drag to resize · double-click to reset';
  return g;
}
