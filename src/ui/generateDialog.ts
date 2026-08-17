import type { Editor } from '../editorState';
import {
  preprocessImage, callGenerateApi, validateGeneration,
  MAX_UPLOAD_BYTES, type PreprocessResult, type ValidatedGeneration,
} from '../ai';
import { render } from '../render';

/**
 * Image-to-diagram flow. Never touches the current canvas until the user
 * clicks Accept — and only after confirming if the current doc has items.
 * The preview is rendered by the same `render()` the editor uses.
 */
export function createGenerateDialog(container: HTMLElement, editor: Editor): {
  open: () => void;
  close: () => void;
  detach: () => void;
} {
  const dlg = document.createElement('dialog');
  dlg.className = 'generate-dialog';
  container.appendChild(dlg);

  // Local flow state — kept in closure, reset each time the dialog opens.
  let file: File | null = null;
  let processed: PreprocessResult | null = null;
  let result: ValidatedGeneration | null = null;
  let loading = false;
  let error: string | null = null;

  function reset(): void {
    file = null;
    processed = null;
    result = null;
    loading = false;
    error = null;
  }

  async function pickFile(f: File): Promise<void> {
    try {
      file = f;
      processed = null;
      result = null;
      error = null;
      render_();
      processed = await preprocessImage(f);
      render_();
    } catch (err) {
      error = (err as Error).message;
      file = null;
      processed = null;
      render_();
    }
  }

  async function generate(): Promise<void> {
    if (!processed) return;
    // Capture the hint BEFORE re-rendering the dialog — render_() rebuilds
    // innerHTML and destroys the textarea.
    const dialogHint = dlg.querySelector<HTMLTextAreaElement>('.gd-hint');
    const hint = dialogHint?.value.trim();

    loading = true;
    error = null;
    result = null;
    render_();
    try {
      const state = editor.getState();
      const req: Parameters<typeof callGenerateApi>[0] = { image: processed };
      if (state.doc.encoding) req.encoding = state.doc.encoding;
      if (hint) req.hint = hint;
      const raw = await callGenerateApi(req);
      result = validateGeneration(raw.raw, state.doc.encoding);
      if (result.doc.items.length === 0) {
        error = 'The model returned no usable items. Try a different image or add a hint.';
      }
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
      render_();
    }
  }

  function accept(): void {
    if (!result) return;
    const state = editor.getState();
    if (state.doc.items.length > 0) {
      if (!confirm('Replace the current diagram with the generated one? This cannot be undone.')) {
        return;
      }
    }
    editor.dispatch({ kind: 'load', doc: result.doc });
    close();
  }

  function open(): void {
    reset();
    render_();
    if (!dlg.open) dlg.showModal();
  }

  function close(): void {
    if (dlg.open) dlg.close();
  }

  // ---- Render -----------------------------------------------------------
  function render_(): void {
    dlg.innerHTML = `
      <form method="dialog" class="gd-form">
        <header class="gd-head">
          <h3>Generate diagram from image</h3>
          <button type="button" class="gd-close" aria-label="Close">×</button>
        </header>
        <div class="gd-body">
          ${renderBody()}
        </div>
        <footer class="gd-foot">${renderFoot()}</footer>
      </form>
    `;

    dlg.querySelector<HTMLButtonElement>('.gd-close')?.addEventListener('click', close);

    // File picker area.
    const drop = dlg.querySelector<HTMLDivElement>('.gd-drop');
    const fileInput = dlg.querySelector<HTMLInputElement>('.gd-file');
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const f = fileInput.files?.[0];
        if (f) void pickFile(f);
      });
    }
    if (drop) {
      drop.addEventListener('click', () => fileInput?.click());
      drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('hot'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('hot'));
      drop.addEventListener('drop', (ev) => {
        ev.preventDefault();
        drop.classList.remove('hot');
        const f = ev.dataTransfer?.files?.[0];
        if (f) void pickFile(f);
      });
    }

    dlg.querySelector<HTMLButtonElement>('.gd-generate')?.addEventListener('click', (ev) => {
      ev.preventDefault(); void generate();
    });
    dlg.querySelector<HTMLButtonElement>('.gd-accept')?.addEventListener('click', (ev) => {
      ev.preventDefault(); accept();
    });
    dlg.querySelector<HTMLButtonElement>('.gd-discard')?.addEventListener('click', (ev) => {
      ev.preventDefault(); reset(); render_();
    });
    dlg.querySelector<HTMLButtonElement>('.gd-cancel')?.addEventListener('click', (ev) => {
      ev.preventDefault(); close();
    });

    // Inject the preview SVG (kept out of the html string so we don't
    // double-escape user-influenced content).
    if (result) {
      const previewSlot = dlg.querySelector<HTMLDivElement>('.gd-preview');
      if (previewSlot) {
        const { svg } = render(result.doc);
        previewSlot.innerHTML = svg;
      }
    }
  }

  function renderBody(): string {
    if (result) {
      const warnBlock = result.warnings.length > 0
        ? `<details class="gd-warnings" open><summary>${result.warnings.length} validation adjustment${result.warnings.length === 1 ? '' : 's'}</summary><ul>${result.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>`
        : `<p class="gd-clean muted">No validation adjustments — the response fit the model as-is.</p>`;
      return `
        <p class="muted">Preview of the generated diagram. Nothing is written to your canvas until you click Accept.</p>
        <div class="gd-preview" aria-label="Generated diagram preview"></div>
        ${warnBlock}
      `;
    }

    const filePart = file
      ? `<p class="muted">${esc(file.name)} · ${(file.size / 1024).toFixed(0)} KB${processed ? ` · reduced to ${processed.width}×${processed.height} @ ${(processed.bytes / 1024).toFixed(0)} KB before upload` : ''}</p>`
      : '';

    const errPart = error ? `<p class="gd-error">${esc(error)}</p>` : '';

    const dropClass = 'gd-drop' + (file ? ' has-file' : '');
    return `
      <div class="${dropClass}" role="button" tabindex="0" aria-label="Drop or click to choose an image">
        ${file
          ? `<p><b>Ready.</b> Click Generate below, or drop another file to replace.</p>`
          : `<p><b>Drop a screenshot here</b>, or click to choose a file.</p>
             <p class="muted">PNG, JPG, or WebP. Up to ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB. Image is downscaled and EXIF stripped before upload.</p>`
        }
      </div>
      <input type="file" class="gd-file" accept="image/png,image/jpeg,image/webp" hidden>
      ${filePart}
      ${errPart}
      <label class="field gd-hint-field">
        <span>Notes for the redraw (optional)</span>
        <textarea class="gd-hint" rows="2" placeholder="e.g. highlight the control plane in blue"></textarea>
      </label>
      <p class="muted gd-notice">Elements are rebuilt from scratch in toolkit styles. Logos, wordmarks, and artwork in the source are not reproduced.</p>
    `;
  }

  function renderFoot(): string {
    if (result) {
      return `
        <button type="button" class="tb-btn gd-discard">Discard</button>
        <button type="button" class="tb-btn primary gd-accept">Accept</button>
      `;
    }
    return `
      <button type="button" class="tb-btn gd-cancel">Cancel</button>
      <button type="button" class="tb-btn primary gd-generate" ${loading || !processed ? 'disabled' : ''}>
        ${loading ? '<span class="spinner"></span>Reading…' : 'Generate'}
      </button>
    `;
  }

  const detach = (): void => { dlg.remove(); };
  return { open, close, detach };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]!));
}
