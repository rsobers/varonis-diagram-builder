/**
 * Image-to-diagram client half. The server-side proxy in `api/generate.ts`
 * holds the Anthropic key. This module is responsible for:
 *
 *  - Preprocessing the upload (downscale + re-encode → drops EXIF, controls
 *    token cost, enforces a size ceiling).
 *  - Firing the request and parsing the returned JSON.
 *  - **Hard-validating** the response against our model: illegal colors under
 *    the chosen encoding are dropped, unknown icons are removed, coordinates
 *    are clamped to the canvas, counts are capped, connector endpoints are
 *    resolved.
 *
 * Rendering the resulting doc goes through the same validate.ts pipeline as
 * a hand-built diagram, so anything the model produces still surfaces in the
 * standing style-check panel if it violates §6.3.
 */
import { ICON_KIT, namedIcon, type IconRef } from './icons';
import { allowedElementColors } from './validate';
import type {
  DiagramDoc, Item, Encoding, Boundary, Element, Actor, InlineControl,
  Grouped, Connector, Legend,
} from './model';
import type { ColorName, SizeName } from './tokens';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DIMENSION = 1600;
export const CANVAS_W = 1200;
export const CANVAS_H = 800;

export type PreprocessResult = {
  media: 'image/jpeg';
  base64: string;
  width: number;
  height: number;
  bytes: number;
};

/**
 * Downscale + re-encode via Canvas. Re-encoding to JPEG discards the
 * original file's EXIF (Canvas has no way to preserve it), which is the
 * point — we don't want to forward metadata like GPS coordinates.
 */
export async function preprocessImage(file: File): Promise<PreprocessResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB; max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    throw new Error('Use a PNG, JPG, or WebP.');
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.85);
    });
    const base64 = await blobToBase64(blob);
    return { media: 'image/jpeg', base64, width: w, height: h, bytes: blob.size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image.'));
    img.src = url;
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

// ---- API call -----------------------------------------------------------

export type GenerateRequest = {
  image: PreprocessResult;
  encoding?: Encoding;
  hint?: string;
};

export type GenerateResponse = {
  raw: unknown;    // parsed JSON as returned
};

export async function callGenerateApi(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      image: { media: req.image.media, data: req.image.base64 },
      encoding: req.encoding ?? null,
      hint: req.hint ?? '',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Generate API failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const body = await res.json();
  return { raw: body?.doc ?? body };
}

// ---- Validation ---------------------------------------------------------

export const MAX_ELEMENTS = 18;      // §9 density cap
export const MAX_BOUNDARIES = 4;
export const MAX_CONNECTORS = 20;

export type ValidatedGeneration = {
  doc: DiagramDoc;
  warnings: string[];
};

/**
 * Convert the raw model response into a valid DiagramDoc. Drops or clamps
 * anything that would violate the guide. Everything the caller receives is
 * safe to render; residual style violations still surface through the
 * standing validation panel exactly as they would for hand-built items.
 */
export function validateGeneration(raw: unknown, encoding?: Encoding): ValidatedGeneration {
  const warnings: string[] = [];
  const rawObj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};

  // Encoding — prefer what the caller passed; else what the model chose (if valid).
  let enc: Encoding | undefined = encoding;
  if (enc === undefined && typeof rawObj['encoding'] === 'string') {
    const e = rawObj['encoding'] as string;
    if (e === 'ownership' || e === 'emphasis' || e === 'state') enc = e;
  }
  const allowedColors = allowedElementColors(enc);

  const items: Item[] = [];
  const idMap = new Map<string, string>();
  const seenIds = new Set<string>();
  let nextIdSeq = 0;
  const genId = (): string => {
    let id = `g${nextIdSeq++}`;
    while (seenIds.has(id)) id = `g${nextIdSeq++}`;
    seenIds.add(id);
    return id;
  };
  const rememberId = (origId: unknown): string => {
    const key = typeof origId === 'string' && origId ? origId : `_${nextIdSeq}`;
    const existing = idMap.get(key);
    if (existing) return existing;
    const fresh = genId();
    idMap.set(key, fresh);
    return fresh;
  };

  const clampNum = (v: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    return Math.max(min, Math.min(max, n));
  };

  const asString = (v: unknown, fallback: string): string =>
    typeof v === 'string' ? v.slice(0, 200) : fallback;

  const asIcon = (v: unknown): IconRef | undefined => {
    if (typeof v !== 'string') return undefined;
    if (!(v in ICON_KIT)) {
      warnings.push(`Dropped unknown icon "${v}".`);
      return undefined;
    }
    return namedIcon(v);
  };

  const asColor = (v: unknown, kind: string, label: string): ColorName => {
    if (typeof v !== 'string' || !isColorName(v)) return 'white';
    if (!allowedColors.has(v)) {
      warnings.push(`Recoloured ${kind} "${label}" to white (${v} not allowed under ${enc ?? 'grayscale'}).`);
      return 'white';
    }
    return v;
  };

  const asSize = (v: unknown): SizeName => {
    if (v === 'sm' || v === 'md' || v === 'lg') return v;
    return 'md';
  };

  const arr = Array.isArray(rawObj['items']) ? rawObj['items'] as unknown[] : [];
  let boundaryCount = 0;
  let elementCount = 0;
  let connectorCount = 0;

  // First pass: register ids and materialize non-connector items so
  // connectors can resolve endpoints in the second pass.
  const pendingConnectors: Array<Record<string, unknown>> = [];

  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    const kind = it['kind'];

    switch (kind) {
      case 'boundary': {
        if (boundaryCount >= MAX_BOUNDARIES) {
          warnings.push(`Dropped extra boundary (cap ${MAX_BOUNDARIES}).`);
          continue;
        }
        boundaryCount++;
        const id = rememberId(it['id']);
        const label = asString(it['label'], 'Boundary');
        const tint = it['tint'];
        const boundary: Boundary = {
          id, kind: 'boundary', label,
          x: clampNum(it['x'], 0, 0, CANVAS_W - 60),
          y: clampNum(it['y'], 0, 0, CANVAS_H - 40),
          w: clampNum(it['w'], 320, 60, CANVAS_W),
          h: clampNum(it['h'], 200, 40, CANVAS_H),
        };
        if (it['filled'] === true) boundary.filled = true;
        if (typeof tint === 'string' && isColorName(tint) && enc === 'state') {
          boundary.tint = tint;
        }
        items.push(boundary);
        break;
      }
      case 'element': {
        if (elementCount >= MAX_ELEMENTS) {
          warnings.push(`Dropped extra element (cap ${MAX_ELEMENTS}).`);
          continue;
        }
        elementCount++;
        const id = rememberId(it['id']);
        const label = asString(it['label'], 'Element');
        const el: Element = {
          id, kind: 'element', label,
          x: clampNum(it['x'], 0, 0, CANVAS_W - 60),
          y: clampNum(it['y'], 0, 0, CANVAS_H - 34),
          size: asSize(it['size']),
          color: asColor(it['color'], 'element', label),
        };
        const icon = asIcon(it['icon']);
        if (icon) el.icon = icon;
        if (typeof it['sub'] === 'string') el.sub = asString(it['sub'], '');
        items.push(el);
        break;
      }
      case 'grouped': {
        if (elementCount >= MAX_ELEMENTS) {
          warnings.push(`Dropped extra grouped (cap ${MAX_ELEMENTS}).`);
          continue;
        }
        elementCount++;
        const id = rememberId(it['id']);
        const label = asString(it['label'], 'Group');
        const rawChildren = Array.isArray(it['children']) ? it['children'] as unknown[] : [];
        const children: Grouped['children'] = [];
        for (const rc of rawChildren.slice(0, 6)) {
          if (!rc || typeof rc !== 'object') continue;
          const c = rc as Record<string, unknown>;
          const clabel = asString(c['label'], 'Row');
          const cicon = asIcon(c['icon']);
          children.push(cicon ? { label: clabel, icon: cicon } : { label: clabel });
        }
        const g: Grouped = {
          id, kind: 'grouped', label,
          x: clampNum(it['x'], 0, 0, CANVAS_W - 60),
          y: clampNum(it['y'], 0, 0, CANVAS_H - 40),
          color: asColor(it['color'], 'grouped', label),
          children,
        };
        items.push(g);
        break;
      }
      case 'actor': {
        if (elementCount >= MAX_ELEMENTS) {
          warnings.push(`Dropped extra actor (cap ${MAX_ELEMENTS}).`);
          continue;
        }
        elementCount++;
        const id = rememberId(it['id']);
        const label = asString(it['label'], 'User');
        const a: Actor = {
          id, kind: 'actor', label,
          cx: clampNum(it['cx'], 0, 16, CANVAS_W - 16),
          y: clampNum(it['y'], 0, 0, CANVAS_H - 60),
        };
        const icon = asIcon(it['icon']) ?? namedIcon('person');
        a.icon = icon;
        items.push(a);
        break;
      }
      case 'inlineControl': {
        if (elementCount >= MAX_ELEMENTS) {
          warnings.push(`Dropped extra inlineControl (cap ${MAX_ELEMENTS}).`);
          continue;
        }
        elementCount++;
        const id = rememberId(it['id']);
        const label = asString(it['label'], 'Control');
        const c: InlineControl = {
          id, kind: 'inlineControl', label,
          x: clampNum(it['x'], 0, 0, CANVAS_W - 90),
          y: clampNum(it['y'], 0, 0, CANVAS_H - 36),
        };
        const icon = asIcon(it['icon']);
        if (icon) c.icon = icon;
        items.push(c);
        break;
      }
      case 'legend': {
        const id = rememberId(it['id']);
        const legend: Legend = {
          id, kind: 'legend',
          x: clampNum(it['x'], 40, 0, CANVAS_W - 150),
          y: clampNum(it['y'], 40, 0, CANVAS_H - 60),
          encoding: asString(it['encoding'], 'Encoding'),
          rows: [],
        };
        const rawRows = Array.isArray(it['rows']) ? it['rows'] as unknown[] : [];
        for (const rr of rawRows.slice(0, 6)) {
          if (Array.isArray(rr) && rr.length === 2 && typeof rr[0] === 'string' && typeof rr[1] === 'string' && isColorName(rr[0])) {
            legend.rows.push([rr[0] as ColorName, rr[1]]);
          }
        }
        items.push(legend);
        break;
      }
      case 'connector':
        pendingConnectors.push(it);
        break;
      default:
        warnings.push(`Dropped item of unknown kind "${String(kind)}".`);
    }
  }

  // Second pass: connectors — validate endpoint ids exist.
  for (const it of pendingConnectors) {
    if (connectorCount >= MAX_CONNECTORS) {
      warnings.push(`Dropped extra connector (cap ${MAX_CONNECTORS}).`);
      continue;
    }
    const fromKey = it['from'];
    const toKey = it['to'];
    const fromId = typeof fromKey === 'string' ? idMap.get(fromKey) : undefined;
    const toId = typeof toKey === 'string' ? idMap.get(toKey) : undefined;
    if (!fromId || !toId || fromId === toId) {
      warnings.push(`Dropped connector with unresolved endpoint(s).`);
      continue;
    }
    connectorCount++;
    const id = rememberId(it['id']);
    const c: Connector = {
      id, kind: 'connector', from: fromId, to: toId,
    };
    if (it['routing'] === 'elbow' || it['routing'] === 'straight') c.routing = it['routing'];
    if (it['dashed'] === true) c.dashed = true;
    if (typeof it['label'] === 'string') c.label = asString(it['label'], '').slice(0, 60);
    if (typeof it['optional'] === 'string') c.optional = asString(it['optional'], '').slice(0, 40);
    if (typeof it['num'] === 'string') c.num = asString(it['num'], '').slice(0, 4);
    items.push(c);
  }

  const doc: DiagramDoc = {
    version: 1,
    width: CANVAS_W,
    height: CANVAS_H,
    items,
  };
  if (enc) doc.encoding = enc;
  return { doc, warnings };
}

function isColorName(s: string): s is ColorName {
  return s === 'white' || s === 'gray' || s === 'blue' || s === 'red' || s === 'amber' || s === 'green';
}
