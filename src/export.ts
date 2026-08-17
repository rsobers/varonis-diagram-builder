import { render } from './render';
import type { DiagramDoc } from './model';
import { TOKENS } from './tokens';

/**
 * Export pipeline. SVG for editing/re-rendering; PNG at 2x for slides and
 * web, both per spec §9. JPG is intentionally unsupported — the spec
 * explicitly bans it.
 */

const DEFAULT_PNG_SCALE = TOKENS.export.png.scale;

/**
 * Rendered SVG with the standard white background (matches the editor).
 * Interactive wrappers (data-item-id) are OFF so the exported file is clean.
 */
export function exportSvg(doc: DiagramDoc): Blob {
  const { svg } = render(doc, { background: 'white' });
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

/**
 * Rasterize the diagram to PNG at 2x by default, with a transparent
 * background per §9's export rules. Rasterization goes SVG → data URL →
 * Image → Canvas → Blob; this is browser-only.
 */
export async function exportPng(doc: DiagramDoc, opts: { scale?: number } = {}): Promise<Blob> {
  const scale = opts.scale ?? DEFAULT_PNG_SCALE;
  // Transparent background — the guide wants PNGs to composite cleanly on
  // slides. `background: 'none'` omits the white bg rect in the SVG.
  const { svg } = render(doc, { background: 'none' });
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(doc.width * scale);
  canvas.height = Math.round(doc.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  // No fillRect — leaves the canvas transparent.
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.drawImage(img, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
}

/** Trigger a browser file download for a Blob under the given name. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Sanitize a diagram title into a filename stem. */
export function suggestedFilename(doc: DiagramDoc, ext: 'svg' | 'png'): string {
  const title = doc.title?.[0] ?? 'diagram';
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'diagram';
  return `${stem}.${ext}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not rasterize SVG.'));
    img.src = url;
  });
}
