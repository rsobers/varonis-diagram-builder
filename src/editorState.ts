import { TOKENS } from './tokens';
import { migrateDoc, type DiagramDoc, type Item, type ItemDraft, type Encoding, type Grouped } from './model';
import type { IconRef } from './icons';
import { clampToCanvas } from './layout';

/**
 * Editor state layer. The reducer is pure so it can be unit-tested without
 * DOM; createEditor() wraps it with a subscribe/dispatch pub/sub so UI code
 * can react without pulling in a framework.
 *
 * Selection, snap, and "currently placing" are runtime concerns and never
 * enter DiagramDoc — the doc is the persistable format.
 */

export type PlacingIntent = {
  label: string;
  factory: (x: number, y: number) => ItemDraft;
};

export type EditorMode = 'select' | 'connect';

export type EditorState = {
  doc: DiagramDoc;
  selection: ReadonlySet<string>;
  gridSize: number;
  snap: boolean;
  placing: PlacingIntent | null;
  mode: EditorMode;
  /** In connect mode, the id of the first-clicked item awaiting a target. */
  pending: string | null;
};

export type EditorAction =
  | { kind: 'add'; item: ItemDraft; id: string }
  /** Bulk insert used by paste/duplicate. Each item must carry a fresh id. */
  | { kind: 'addMany'; items: Item[] }
  /**
   * Patch is loose (Record<string, unknown>) so the inspector can send
   * `{ icon: undefined }` to unset an optional field — the reducer strips
   * undefined values so the resulting item drops the key entirely, keeping
   * exactOptionalPropertyTypes happy.
   */
  | { kind: 'update'; id: string; patch: Record<string, unknown> }
  | { kind: 'delete'; ids: string[] }
  | { kind: 'move'; ids: string[]; dx: number; dy: number }
  | { kind: 'select'; ids: string[]; mode: 'replace' | 'add' | 'toggle' }
  | { kind: 'setPlacing'; intent: PlacingIntent | null }
  | { kind: 'setSnap'; on: boolean }
  | { kind: 'setMode'; mode: EditorMode }
  | { kind: 'setEncoding'; encoding: Encoding | undefined }
  | { kind: 'startConnect'; id: string }
  | { kind: 'finishConnect'; targetId: string; connectorId: string }
  | { kind: 'cancelConnect' }
  | { kind: 'addGroupChild'; id: string; child: { label: string; icon?: IconRef } }
  | { kind: 'removeGroupChild'; id: string; index: number }
  | { kind: 'updateGroupChild'; id: string; index: number; patch: { label?: string; icon?: IconRef | undefined } }
  | { kind: 'reverseConnector'; id: string }
  | { kind: 'setDocTitle'; title: [string, string] | null }
  | { kind: 'load'; doc: DiagramDoc };

export function initialState(doc: DiagramDoc): EditorState {
  return {
    doc,
    selection: new Set(),
    gridSize: TOKENS.canvas.grid,
    snap: true,
    placing: null,
    mode: 'select',
    pending: null,
  };
}

export function reduce(state: EditorState, action: EditorAction): EditorState {
  switch (action.kind) {
    case 'add': {
      let item = { ...action.item, id: action.id } as Item;
      if (item.kind !== 'connector') {
        item = clampToCanvas(item, state.doc.width, state.doc.height);
      }
      return {
        ...state,
        doc: { ...state.doc, items: [...state.doc.items, item] },
        selection: new Set([action.id]),
        placing: null,
      };
    }
    case 'addMany': {
      if (action.items.length === 0) return state;
      const clamped = action.items.map((it) =>
        it.kind === 'connector' ? it : clampToCanvas(it, state.doc.width, state.doc.height)
      );
      return {
        ...state,
        doc: { ...state.doc, items: [...state.doc.items, ...clamped] },
      };
    }
    case 'update': {
      const items = state.doc.items.map((it) => {
        if (it.id !== action.id) return it;
        const next: Record<string, unknown> = { ...it };
        for (const [k, v] of Object.entries(action.patch)) {
          if (v === undefined) delete next[k];
          else next[k] = v;
        }
        // §8.2 invariants — mark and icon are mutually exclusive on elements,
        // and marks are only valid on white/gray fills.
        if (next['kind'] === 'element') {
          const settingMark = 'markId' in action.patch && action.patch['markId'] !== undefined;
          const settingIcon = 'icon' in action.patch && action.patch['icon'] !== undefined;
          if (settingMark) {
            delete next['icon'];
            // Fill guard: block markId on non-white/gray fills.
            const color = (next['color'] as string | undefined) ?? 'white';
            if (color !== 'white' && color !== 'gray') {
              delete next['markId'];
            }
          }
          if (settingIcon) delete next['markId'];
          // Changing color to something non-white/non-gray clears markId.
          if ('color' in action.patch) {
            const color = (next['color'] as string | undefined) ?? 'white';
            if (color !== 'white' && color !== 'gray' && 'markId' in next) {
              delete next['markId'];
            }
          }
        }
        return next as Item;
      });
      return { ...state, doc: { ...state.doc, items } };
    }
    case 'delete': {
      const remove = new Set(action.ids);
      const items = state.doc.items.filter((it) => !remove.has(it.id));
      const selection = new Set([...state.selection].filter((id) => !remove.has(id)));
      return { ...state, doc: { ...state.doc, items }, selection };
    }
    case 'move': {
      if (action.dx === 0 && action.dy === 0) return state;
      const move = new Set(action.ids);
      const items = state.doc.items.map((it) =>
        move.has(it.id) ? translate(it, action.dx, action.dy) : it
      );
      return { ...state, doc: { ...state.doc, items } };
    }
    case 'select': {
      let next: Set<string>;
      if (action.mode === 'replace') next = new Set(action.ids);
      else if (action.mode === 'add') next = new Set([...state.selection, ...action.ids]);
      else {
        next = new Set(state.selection);
        for (const id of action.ids) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
      }
      return { ...state, selection: next };
    }
    case 'setPlacing': return { ...state, placing: action.intent };
    case 'setSnap':    return { ...state, snap: action.on };
    case 'setMode': {
      // Switching mode also clears pending and placing so state stays coherent.
      return { ...state, mode: action.mode, pending: null, placing: null };
    }
    case 'setEncoding': {
      const doc = { ...state.doc };
      if (action.encoding === undefined) delete doc.encoding;
      else doc.encoding = action.encoding;
      return { ...state, doc };
    }
    case 'startConnect': return { ...state, pending: action.id };
    case 'finishConnect': {
      if (!state.pending || state.pending === action.targetId) {
        return { ...state, pending: null };
      }
      const connector: Item = {
        id: action.connectorId,
        kind: 'connector',
        from: state.pending,
        to: action.targetId,
      };
      return {
        ...state,
        doc: { ...state.doc, items: [...state.doc.items, connector] },
        selection: new Set([action.connectorId]),
        pending: null,
      };
    }
    case 'cancelConnect': return { ...state, pending: null };
    case 'addGroupChild': {
      const items = state.doc.items.map((it) => {
        if (it.id !== action.id || it.kind !== 'grouped') return it;
        const next: Grouped = { ...it, children: [...it.children, action.child] };
        return next;
      });
      return { ...state, doc: { ...state.doc, items } };
    }
    case 'removeGroupChild': {
      const items = state.doc.items.map((it) => {
        if (it.id !== action.id || it.kind !== 'grouped') return it;
        const children = it.children.filter((_, i) => i !== action.index);
        return { ...it, children };
      });
      return { ...state, doc: { ...state.doc, items } };
    }
    case 'updateGroupChild': {
      const items = state.doc.items.map((it) => {
        if (it.id !== action.id || it.kind !== 'grouped') return it;
        const children = it.children.map((c, i) => {
          if (i !== action.index) return c;
          const next: { label: string; icon?: IconRef } = { label: c.label };
          if (c.icon !== undefined) next.icon = c.icon;
          if (action.patch.label !== undefined) next.label = action.patch.label;
          if ('icon' in action.patch) {
            if (action.patch.icon === undefined) delete next.icon;
            else next.icon = action.patch.icon;
          }
          return next;
        });
        return { ...it, children };
      });
      return { ...state, doc: { ...state.doc, items } };
    }
    case 'reverseConnector': {
      const items = state.doc.items.map((it) => {
        if (it.id !== action.id || it.kind !== 'connector') return it;
        return { ...it, from: it.to, to: it.from };
      });
      return { ...state, doc: { ...state.doc, items } };
    }
    case 'setDocTitle': {
      // Setting to null (or a fully empty tuple) clears the field entirely
      // so the renderer skips the title strip.
      if (action.title === null || (action.title[0] === '' && action.title[1] === '')) {
        const { title: _, ...rest } = state.doc;
        void _;
        return { ...state, doc: rest };
      }
      return { ...state, doc: { ...state.doc, title: action.title } };
    }
    case 'load': return {
      ...initialState(migrateDoc(action.doc)),
      snap: state.snap,
      gridSize: state.gridSize,
    };
  }
}

/**
 * Snap value v to the nearest multiple of gridSize. Applied to the resulting
 * position of the drag primary (not to the delta), so items end on-grid
 * regardless of where they started.
 */
export function snapTo(v: number, gridSize: number): number {
  // + 0 coerces -0 → 0 so snapped coordinates never serialize as "-0".
  return Math.round(v / gridSize) * gridSize + 0;
}

// ---- pub/sub wrapper ----------------------------------------------------

export type Subscriber = (state: EditorState) => void;

export type Editor = {
  getState: () => EditorState;
  dispatch: (action: EditorAction) => void;
  subscribe: (fn: Subscriber) => () => void;
  newId: () => string;
};

export function createEditor(initial: EditorState): Editor {
  let state = initial;
  const subs = new Set<Subscriber>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = reduce(state, action);
      if (next === state) return;
      state = next;
      for (const fn of subs) fn(state);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    newId() {
      // Short random id; collision risk is trivial at editor scale.
      return Math.random().toString(36).slice(2, 10);
    },
  };
}

// ---- helpers ------------------------------------------------------------

function translate(item: Item, dx: number, dy: number): Item {
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
    case 'connector':
      // Connectors follow their endpoints. Nothing to translate directly.
      return item;
  }
}
