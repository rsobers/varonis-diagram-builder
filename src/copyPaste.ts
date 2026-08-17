import type { DiagramDoc, Item, Connector } from './model';

/**
 * Copy/paste helpers. Kept as pure functions so the reducer stays
 * side-effect free; the editor keeps the actual clipboard as a runtime
 * variable in interactions.ts (no OS clipboard, no cross-tab).
 *
 * Connector policy per the hardening ask: a connector goes into the copy
 * only when BOTH endpoints are in the selection. Half-selected connectors
 * drop out — a dangling reference to an unselected item would break
 * routing.
 */

export function buildCopy(doc: DiagramDoc, selection: ReadonlySet<string>): Item[] {
  const out: Item[] = [];
  for (const it of doc.items) {
    if (!selection.has(it.id)) continue;
    if (it.kind === 'connector') {
      if (selection.has(it.from) && selection.has(it.to)) out.push(it);
      continue;
    }
    out.push(it);
  }
  return out;
}

export type PasteResult = { items: Item[]; ids: string[] };

/**
 * Produces cloned items with fresh IDs, translated by (dx, dy). Connector
 * endpoints are remapped to the new IDs so the copy stays wired to itself
 * rather than pointing back at the originals.
 */
export function buildPaste(
  items: readonly Item[],
  dx: number, dy: number,
  newId: () => string,
): PasteResult {
  const idMap = new Map<string, string>();
  for (const it of items) idMap.set(it.id, newId());
  const out: Item[] = [];
  const ids: string[] = [];
  for (const it of items) {
    const nid = idMap.get(it.id)!;
    ids.push(nid);
    if (it.kind === 'connector') {
      const clone: Connector = {
        ...it,
        id: nid,
        from: idMap.get(it.from) ?? it.from,
        to: idMap.get(it.to) ?? it.to,
      };
      out.push(clone);
    } else {
      out.push(translate({ ...it, id: nid }, dx, dy));
    }
  }
  return { items: out, ids };
}

function translate(item: Exclude<Item, Connector>, dx: number, dy: number): Item {
  switch (item.kind) {
    case 'boundary':
    case 'element':
    case 'grouped':
    case 'inlineControl':
    case 'legend':
    case 'caption':
    case 'title':
      return { ...item, x: item.x + dx, y: item.y + dy };
    case 'zoneDivider':
      return { ...item, x: item.x + dx, y1: item.y1 + dy, y2: item.y2 + dy };
    case 'actor':
      return { ...item, cx: item.cx + dx, y: item.y + dy };
    case 'connectorLabel':
      return { ...item, cx: item.cx + dx, cy: item.cy + dy };
    case 'edge':
      return { ...item, points: item.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  }
}
