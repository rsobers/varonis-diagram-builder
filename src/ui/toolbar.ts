import type { Editor, EditorState, EditorMode } from '../editorState';
import type { Encoding } from '../model';

/**
 * Top toolbar: mode toggle (Select/Connect), encoding selector, snap toggle,
 * and clear-canvas button. Mode indication is persistent so the user always
 * knows which mode they're in — not a toast that fades.
 */
export function createToolbar(container: HTMLElement, editor: Editor): () => void {
  container.classList.add('toolbar');
  container.innerHTML = `
    <div class="toolbar-group" role="group" aria-label="Mode">
      <button type="button" class="tb-btn" data-mode="select">Select</button>
      <button type="button" class="tb-btn" data-mode="connect">Connect</button>
    </div>
    <div class="toolbar-sep" aria-hidden="true"></div>
    <label class="toolbar-field">
      <span>Encoding</span>
      <select class="tb-encoding">
        <option value="">None (grayscale)</option>
        <option value="ownership">Ownership</option>
        <option value="emphasis">Emphasis</option>
        <option value="state">State</option>
      </select>
    </label>
    <label class="toolbar-check">
      <input type="checkbox" class="tb-snap"> Snap to grid
    </label>
    <span class="toolbar-grow"></span>
    <button type="button" class="tb-btn tb-new">New</button>
  `;

  const modeBtns = container.querySelectorAll<HTMLButtonElement>('[data-mode]');
  const encSel = container.querySelector<HTMLSelectElement>('.tb-encoding')!;
  const snapCk = container.querySelector<HTMLInputElement>('.tb-snap')!;
  const newBtn = container.querySelector<HTMLButtonElement>('.tb-new')!;

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as EditorMode;
      editor.dispatch({ kind: 'setMode', mode });
    });
  });
  encSel.addEventListener('change', () => {
    const v = encSel.value as Encoding | '';
    editor.dispatch({ kind: 'setEncoding', encoding: v === '' ? undefined : v });
  });
  snapCk.addEventListener('change', () => {
    editor.dispatch({ kind: 'setSnap', on: snapCk.checked });
  });
  newBtn.addEventListener('click', () => {
    if (!confirm('Clear the canvas? This cannot be undone.')) return;
    editor.dispatch({
      kind: 'load',
      doc: { version: 1, width: editor.getState().doc.width, height: editor.getState().doc.height, items: [] },
    });
  });

  function refresh(state: EditorState): void {
    modeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
      btn.setAttribute('aria-pressed', btn.dataset.mode === state.mode ? 'true' : 'false');
    });
    encSel.value = state.doc.encoding ?? '';
    snapCk.checked = state.snap;
  }

  refresh(editor.getState());
  return editor.subscribe(refresh);
}
