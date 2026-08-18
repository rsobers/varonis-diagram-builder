import type { Editor, EditorState, EditorMode } from '../editorState';
import type { DiagramDoc, Encoding } from '../model';
import { example1 } from '../fixtures/example1';
import { example2 } from '../fixtures/example2';
import { example3 } from '../fixtures/example3';
import { TOKENS } from '../tokens';
import {
  CANVAS_MIN_W, CANVAS_MIN_H, CANVAS_MAX_W, CANVAS_MAX_H, contentExtent,
} from '../canvasSize';

const REPO_BASE = 'https://github.com/rsobers/varonis-diagram-builder/blob/main';
const STYLE_GUIDE_URL = `${REPO_BASE}/docs/varonis-diagram-style-guide.md`;

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
    <div class="toolbar-sep" aria-hidden="true"></div>
    <div class="toolbar-field" role="group" aria-label="Canvas size">
      <span>Canvas</span>
      <input type="number" class="tb-canvas-w" aria-label="Canvas width" step="${TOKENS.canvas.grid}"
             min="${CANVAS_MIN_W}" max="${CANVAS_MAX_W}" title="Canvas width in px">
      <span aria-hidden="true">×</span>
      <input type="number" class="tb-canvas-h" aria-label="Canvas height" step="${TOKENS.canvas.grid}"
             min="${CANVAS_MIN_H}" max="${CANVAS_MAX_H}" title="Canvas height in px">
      <button type="button" class="tb-btn tb-canvas-fit" title="Shrink the canvas to fit the diagram">Fit</button>
    </div>
    <span class="toolbar-grow"></span>
    <div class="toolbar-group" role="group" aria-label="Load example">
      <span class="toolbar-hint">Examples</span>
      <button type="button" class="tb-btn tb-example" data-example="1">1</button>
      <button type="button" class="tb-btn tb-example" data-example="2">2</button>
      <button type="button" class="tb-btn tb-example" data-example="3">3</button>
    </div>
    <a class="tb-link" href="${STYLE_GUIDE_URL}" target="_blank" rel="noopener noreferrer" title="Open the Varonis diagram style guide (source of truth)">Style guide ↗</a>
    <div class="toolbar-sep" aria-hidden="true"></div>
    <button type="button" class="tb-btn tb-export-svg" title="Download as SVG">Export SVG</button>
    <button type="button" class="tb-btn tb-export-png" title="Download as 2× transparent PNG">Export PNG</button>
    <button type="button" class="tb-btn primary tb-generate">Generate from image</button>
    <button type="button" class="tb-btn tb-new">New</button>
  `;

  const modeBtns = container.querySelectorAll<HTMLButtonElement>('[data-mode]');
  const encSel = container.querySelector<HTMLSelectElement>('.tb-encoding')!;
  const snapCk = container.querySelector<HTMLInputElement>('.tb-snap')!;
  const newBtn = container.querySelector<HTMLButtonElement>('.tb-new')!;
  const canvasW = container.querySelector<HTMLInputElement>('.tb-canvas-w')!;
  const canvasH = container.querySelector<HTMLInputElement>('.tb-canvas-h')!;
  const canvasFit = container.querySelector<HTMLButtonElement>('.tb-canvas-fit')!;

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
  // Commit on change (blur / Enter / stepper), not on every keystroke —
  // typing "1" on the way to "1200" should not resize to the minimum.
  //
  // The accepted values are written back here rather than left to
  // refresh(): refresh deliberately skips a focused field so a background
  // update can't yank the caret, and on commit the field is focused and is
  // precisely what needs correcting. A rejected entry also produces no
  // state change at all (the reducer no-ops), so there'd be nothing to
  // subscribe to.
  function commitCanvasSize(): void {
    editor.dispatch({
      kind: 'setCanvasSize',
      width: Number(canvasW.value),
      height: Number(canvasH.value),
    });
    const doc = editor.getState().doc;
    canvasW.value = String(doc.width);
    canvasH.value = String(doc.height);
  }
  canvasW.addEventListener('change', commitCanvasSize);
  canvasH.addEventListener('change', commitCanvasSize);
  for (const input of [canvasW, canvasH]) {
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commitCanvasSize(); }
    });
  }
  canvasFit.addEventListener('click', () => {
    // 0×0 is below every floor, so the reducer's clamp resolves it to
    // exactly the content extent — "shrink-wrap to the diagram".
    editor.dispatch({ kind: 'setCanvasSize', width: 0, height: 0 });
  });

  newBtn.addEventListener('click', () => {
    if (!confirm('Clear the canvas? This cannot be undone.')) return;
    editor.dispatch({
      kind: 'load',
      doc: { version: 2, width: editor.getState().doc.width, height: editor.getState().doc.height, items: [] },
    });
  });

  const exampleBtns = container.querySelectorAll<HTMLButtonElement>('.tb-example');
  const examples: Record<string, DiagramDoc> = { '1': example1, '2': example2, '3': example3 };
  exampleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.example!;
      const doc = examples[which];
      if (!doc) return;
      if (editor.getState().doc.items.length > 0 && !confirm(`Load example ${which}? Current canvas will be replaced.`)) return;
      editor.dispatch({ kind: 'load', doc });
    });
  });

  function refresh(state: EditorState): void {
    modeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
      btn.setAttribute('aria-pressed', btn.dataset.mode === state.mode ? 'true' : 'false');
    });
    encSel.value = state.doc.encoding ?? '';
    snapCk.checked = state.snap;
    // Don't fight the user's cursor while they're typing in the field.
    if (document.activeElement !== canvasW) canvasW.value = String(state.doc.width);
    if (document.activeElement !== canvasH) canvasH.value = String(state.doc.height);
    const content = contentExtent(state.doc.items);
    const alreadyFit = state.doc.width <= content.w && state.doc.height <= content.h;
    canvasFit.disabled = state.doc.items.length === 0 || alreadyFit;
  }

  refresh(editor.getState());
  return editor.subscribe(refresh);
}
