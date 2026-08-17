import { createEditor, initialState } from '../editorState';
import type { DiagramDoc } from '../model';
import { createCanvas } from './canvas';
import { createPalette } from './palette';
import { createInspector } from './inspector';
import { createToolbar } from './toolbar';
import { createToast } from './toast';
import { createViolationsPanel } from './violations';
import { createGenerateDialog } from './generateDialog';

const EMPTY_DOC: DiagramDoc = {
  version: 1,
  width: 1200,
  height: 800,
  items: [],
};

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
  const editor = createEditor(initialState(EMPTY_DOC));
  const toast = createToast(root.querySelector<HTMLElement>('#toast-slot')!);
  createToolbar(root.querySelector<HTMLElement>('#toolbar-slot')!, editor);
  createPalette(root.querySelector<HTMLElement>('#palette-slot')!, editor);
  createCanvas(root.querySelector<HTMLElement>('#canvas-slot')!, editor, toast);
  createInspector(root.querySelector<HTMLElement>('#inspector-slot')!, editor);
  createViolationsPanel(root.querySelector<HTMLElement>('#violations-slot')!, editor);

  const generate = createGenerateDialog(root, editor);
  root.querySelector<HTMLButtonElement>('.tb-generate')?.addEventListener('click', () => generate.open());
}
