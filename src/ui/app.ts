import { createEditor, initialState } from '../editorState';
import { createCanvas } from './canvas';
import { createPalette } from './palette';
import { createInspector } from './inspector';
import { createToolbar } from './toolbar';
import { createToast } from './toast';
import { createViolationsPanel } from './violations';
import { createGenerateDialog } from './generateDialog';
import { attachSidebarResize } from './sidebars';
import { exportSvg, exportPng, downloadBlob, suggestedFilename } from '../export';
import { example1 } from '../fixtures/example1';

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <header id="toolbar-slot" class="toolbar-slot"></header>
    <aside id="palette-slot" class="side"></aside>
    <main id="canvas-slot" class="center"></main>
    <aside id="right-slot" class="side right">
      <section id="inspector-slot"></section>
      <section id="violations-slot"></section>
    </aside>
    <div id="toast-slot"></div>
  `;
  // Preload with a real example so a first-time visitor sees the kit in
  // use instead of a blank canvas. `New` in the toolbar still clears.
  // `?blank=1` skips the preload — used by e2e tests that assume an empty
  // starting canvas.
  const params = new URLSearchParams(window.location.search);
  const blank = params.get('blank') === '1';
  const editor = createEditor(
    initialState(blank ? { version: 2, width: 1200, height: 800, items: [] } : example1)
  );
  const toast = createToast(root.querySelector<HTMLElement>('#toast-slot')!);
  createToolbar(root.querySelector<HTMLElement>('#toolbar-slot')!, editor);
  createPalette(root.querySelector<HTMLElement>('#palette-slot')!, editor);
  createCanvas(root.querySelector<HTMLElement>('#canvas-slot')!, editor, toast);
  createInspector(root.querySelector<HTMLElement>('#inspector-slot')!, editor);
  createViolationsPanel(root.querySelector<HTMLElement>('#violations-slot')!, editor);
  attachSidebarResize(root);

  const generate = createGenerateDialog(root, editor);
  root.querySelector<HTMLButtonElement>('.tb-generate')?.addEventListener('click', () => generate.open());

  root.querySelector<HTMLButtonElement>('.tb-export-svg')?.addEventListener('click', () => {
    const doc = editor.getState().doc;
    downloadBlob(exportSvg(doc), suggestedFilename(doc, 'svg'));
    toast('SVG downloaded.');
  });
  root.querySelector<HTMLButtonElement>('.tb-export-png')?.addEventListener('click', async () => {
    const doc = editor.getState().doc;
    try {
      const blob = await exportPng(doc);
      downloadBlob(blob, suggestedFilename(doc, 'png'));
      toast('PNG downloaded at 2×.');
    } catch (err) {
      toast(`Export failed: ${(err as Error).message}`);
    }
  });
}
