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

  let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;

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
    el.remove();
    if (!commitValue) return;
    if (el.dataset.target === 'docTitle') {
      commitDocTitle(el.value);
      return;
    }
    const id = el.dataset.itemId!;
    const field = el.dataset.field!;
    commit(id, field, el.value);
  }

  function commitDocTitle(value: string): void {
    // Two lines separated by newline. First empty line clears everything;
    // trailing empty second line just becomes an empty subtitle string.
    const [head = '', sub = ''] = value.split('\n');
    if (head.trim() === '' && sub.trim() === '') {
      editor.dispatch({ kind: 'setDocTitle', title: null });
    } else {
      editor.dispatch({ kind: 'setDocTitle', title: [head, sub] });
    }
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

  function openDocTitle(): void {
    const doc = editor.getState().doc;
    const [head = '', sub = ''] = doc.title ?? ['', ''];

    // The strip sits at (40, 42) baseline and (40, 62) baseline; give the
    // editor a wide rect over that area so a two-line textarea fits.
    const screen = svgRectToScreen(40, 28, Math.max(400, doc.width - 80), 46);
    const containerRect = container.getBoundingClientRect();

    const ta = document.createElement('textarea');
    ta.value = doc.title ? `${head}\n${sub}` : '';
    ta.placeholder = 'Title\nSubtitle (leave blank to hide)';
    ta.dataset.target = 'docTitle';
    ta.className = 'inline-edit inline-edit-title';
    ta.style.left = `${screen.left - containerRect.left + container.scrollLeft}px`;
    ta.style.top = `${screen.top - containerRect.top + container.scrollTop}px`;
    ta.style.width = `${screen.width}px`;
    ta.style.height = `${screen.height}px`;
    ta.rows = 2;

    ta.addEventListener('keydown', (e) => {
      // Enter commits (Shift+Enter for real newline shouldn't be needed —
      // the title is two lines by design), Escape cancels.
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeInput(true); }
      else if (e.key === 'Escape') { e.preventDefault(); closeInput(false); }
    });
    ta.addEventListener('blur', () => closeInput(true));
    ta.addEventListener('mousedown', (e) => e.stopPropagation());
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());

    if (activeInput) closeInput(true);
    activeInput = ta;
    container.appendChild(ta);
    ta.focus();
    ta.select();
  }

  function onDblClick(e: MouseEvent): void {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('[data-doc-title]')) {
      e.preventDefault();
      openDocTitle();
      return;
    }
    const target = e.target.closest('[data-item-id]');
    if (!target) return;
    const id = target.getAttribute('data-item-id');
    if (!id) return;
    e.preventDefault();
    openInput(id);
  }

  // Capture-phase so it beats any bubbling stopPropagation calls.
  svg.addEventListener('dblclick', onDblClick, true);
  // Doc title opens via a custom event dispatched from interactions.ts on
  // single-click. Kept out of the dblclick path because SVG dblclick is
  // unreliable when the group's clickable region is a stack of shapes.
  const onOpenDocTitle = (): void => openDocTitle();
  window.addEventListener('vdb:open-doc-title', onOpenDocTitle);
  return () => {
    svg.removeEventListener('dblclick', onDblClick, true);
    window.removeEventListener('vdb:open-doc-title', onOpenDocTitle);
    if (activeInput) closeInput(false);
  };
}
