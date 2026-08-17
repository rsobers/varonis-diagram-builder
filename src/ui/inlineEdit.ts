import type { Editor } from '../editorState';
import { layout } from '../layout';
import type { Item } from '../model';

/**
 * Inline label editing. Double-click an editable item; an absolutely
 * positioned HTML `<input>` overlays the item's bbox in screen coordinates.
 * Enter commits, Escape cancels, blur commits. Commits dispatch the same
 * `update` action the inspector uses — no separate code path.
 *
 * HTML overlay (not <foreignObject>) so the input inherits the app's fonts
 * and focus styles.
 */
export function attachInlineEdit(svg: SVGSVGElement, container: HTMLElement, editor: Editor): () => void {
  container.style.position = container.style.position || 'relative';

  let activeInput: HTMLInputElement | null = null;

  function itemById(id: string): Item | undefined {
    return editor.getState().doc.items.find((i) => i.id === id);
  }

  function labelFieldOf(item: Item): { field: 'label' | 'text' | null; value: string } {
    switch (item.kind) {
      case 'element':
      case 'grouped':
      case 'inlineControl':
      case 'boundary':
      case 'actor':
      case 'zoneDivider':
        return { field: 'label', value: item.label };
      case 'connector':
        return { field: 'label', value: item.label ?? '' };
      case 'caption':
      case 'title':
        return { field: 'text', value: item.text };
      case 'legend':
        return { field: 'text', value: item.encoding };
      case 'edge':
      case 'connectorLabel':
        return { field: null, value: '' };
    }
  }

  function svgRectToScreen(x: number, y: number, w: number, h: number): DOMRect {
    // Corner transform via CTM. Assumes the SVG has no nested transforms
    // between the root and the item (true for our render output).
    const ctm = svg.getScreenCTM();
    if (!ctm) return new DOMRect(x, y, w, h);
    const tl = svg.createSVGPoint(); tl.x = x; tl.y = y;
    const br = svg.createSVGPoint(); br.x = x + w; br.y = y + h;
    const p1 = tl.matrixTransform(ctm);
    const p2 = br.matrixTransform(ctm);
    return new DOMRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
  }

  function commit(id: string, field: string, value: string): void {
    editor.dispatch({ kind: 'update', id, patch: { [field]: value } });
  }

  function closeInput(commitValue: boolean): void {
    if (!activeInput) return;
    const el = activeInput;
    activeInput = null;
    const id = el.dataset.itemId!;
    const field = el.dataset.field!;
    const value = el.value;
    el.remove();
    if (commitValue) commit(id, field, value);
  }

  function openInput(id: string): void {
    const item = itemById(id);
    if (!item) return;
    const { field, value } = labelFieldOf(item);
    if (!field) return;

    const bboxes = layout(editor.getState().doc);
    const b = bboxes.get(id);
    if (!b) return;

    const screen = svgRectToScreen(b.x, b.y, b.w, b.h);
    const containerRect = container.getBoundingClientRect();

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.dataset.itemId = id;
    input.dataset.field = field;
    input.className = 'inline-edit';
    input.style.left = `${screen.left - containerRect.left + container.scrollLeft}px`;
    input.style.top = `${screen.top - containerRect.top + container.scrollTop}px`;
    input.style.width = `${screen.width}px`;
    input.style.height = `${Math.max(24, Math.min(screen.height, 44))}px`;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); closeInput(true); }
      else if (e.key === 'Escape') { e.preventDefault(); closeInput(false); }
    });
    // Blur commits — this handles click-away, tab-away, etc.
    input.addEventListener('blur', () => closeInput(true));

    // Prevent the double-click's mousedown from bubbling back into the canvas
    // and re-triggering selection when the user clicks inside the input.
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());

    if (activeInput) closeInput(true);
    activeInput = input;
    container.appendChild(input);
    input.focus();
    input.select();
  }

  function onDblClick(e: MouseEvent): void {
    const target = e.target instanceof Element ? e.target.closest('[data-item-id]') : null;
    if (!target) return;
    const id = target.getAttribute('data-item-id');
    if (!id) return;
    e.preventDefault();
    openInput(id);
  }

  // Capture-phase so it beats any bubbling stopPropagation calls.
  svg.addEventListener('dblclick', onDblClick, true);
  return () => {
    svg.removeEventListener('dblclick', onDblClick, true);
    if (activeInput) closeInput(false);
  };
}
