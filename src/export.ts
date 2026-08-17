import { render, type RenderOptions } from './render';
import { layout } from './layout';
import type { DiagramDoc } from './model';
import { TOKENS } from './tokens';

/**
 * Export pipeline. SVG for editing/re-rendering; PNG at 2x for slides and
 * web, both per spec §9. JPG is intentionally unsupported — the spec
 * explicitly bans it.
 *
 * Both formats crop the viewBox to the content bounding box plus a
 * `EXPORT_PADDING`-px margin so no element sits flush against the edge.
 * An empty doc falls back to the doc's declared canvas dimensions.
 */

const DEFAULT_PNG_SCALE = TOKENS.export.png.scale;
const EXPORT_PADDING = 40;

/**
 * Union bbox of every item plus EXPORT_PADDING on every side, clipped to
 * non-negative coordinates. Falls back to (0, 0, doc.width, doc.height)
 * for empty diagrams.
 */
export function contentViewBox(doc: DiagramDoc): { x: number; y: number; w: number; h: number } {
  const bboxes = layout(doc);
  const rects = [...bboxes.values()];
  if (rects.length === 0) return { x: 0, y: 0, w: doc.width, h: doc.height };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of rects) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  const x = Math.max(0, minX - EXPORT_PADDING);
  const y = Math.max(0, minY - EXPORT_PADDING);
  return { x, y, w: (maxX - x) + EXPORT_PADDING, h: (maxY - y) + EXPORT_PADDING };
}

/**
 * Rendered SVG with the standard white background (matches the editor).
 * Interactive wrappers (data-item-id) are OFF so the exported file is clean.
 * ViewBox is cropped to content + EXPORT_PADDING on all sides.
 */
export function exportSvg(doc: DiagramDoc): Blob {
  const opts: RenderOptions = { background: 'white', viewBox: contentViewBox(doc) };
  const { svg } = render(doc, opts);
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

/**
 * Rasterize the diagram to PNG at 2x by default, transparent background
 * per §9. Rasterization goes SVG → data URL → Image → Canvas → Blob;
 * this is browser-only.
 */
export async function exportPng(doc: DiagramDoc, opts: { scale?: number } = {}): Promise<Blob> {
  const scale = opts.scale ?? DEFAULT_PNG_SCALE;
  const vb = contentViewBox(doc);
  const { svg } = render(doc, { background: 'none', viewBox: vb });
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vb.w * scale);
  canvas.height = Math.round(vb.h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
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
