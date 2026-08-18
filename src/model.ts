import type { ColorName, SizeName } from './tokens';
import type { IconRef } from './icons';

/**
 * Serialized diagram format. `version` is bumped whenever the on-disk shape
 * changes so saved diagrams from earlier builds can be migrated forward.
 *
 * `encoding` names the color encoding in use per spec §6.2. Absent means
 * "grayscale only" — the palette will not offer accent colors.
 */
export type Encoding = 'ownership' | 'emphasis' | 'state';

export type DiagramDoc = {
  version: 2;
  width: number;
  height: number;
  title?: [string, string];
  encoding?: Encoding;
  items: Item[];
};

export type Item =
  | Boundary
  | ZoneDivider
  | Element
  | Grouped
  | InlineControl
  | Actor
  | Edge
  | ConnectorLabel
  | Connector
  | Legend
  | Caption
  | Title;

type WithId = { id: string };

export type Boundary = WithId & {
  kind: 'boundary';
  x: number; y: number; w: number; h: number;
  label: string;
  labelSide?: 'left' | 'right';
  tint?: ColorName;
  /** Vendor mark id from `assets/logos/logos.json`; rendered as a top-right badge (§8.3). */
  markId?: string;
};

export type ZoneDivider = WithId & {
  kind: 'zoneDivider';
  x: number; y1: number; y2: number;
  label: string;
};

export type Element = WithId & {
  kind: 'element';
  x: number; y: number;
  label: string;
  size?: SizeName;
  color?: ColorName;
  icon?: IconRef;
  /**
   * Vendor mark id from `assets/logos/logos.json`. Mutually exclusive with
   * `icon` (§8.2 — a mark replaces the icon). Only allowed on white/gray
   * fills (§8.2).
   */
  markId?: string;
  /**
   * How the mark is presented:
   *  - 'inline' (default): mark sits in the icon slot alongside the label
   *  - 'badge': element renders as a fixed 90×90 square with the mark
   *    centred and the text label suppressed (used for identifying a
   *    named platform, region, or account — AWS, Azure, etc.)
   * Only meaningful when `markId` is set.
   */
  markStyle?: 'inline' | 'badge';
  sub?: string;
};

export type Grouped = WithId & {
  kind: 'grouped';
  x: number; y: number;
  label: string;
  children: Array<{ label: string; icon?: IconRef }>;
  color?: ColorName;
};

export type InlineControl = WithId & {
  kind: 'inlineControl';
  x: number; y: number;
  label: string;
  icon?: IconRef;
};

export type Actor = WithId & {
  kind: 'actor';
  cx: number; y: number;
  label: string;
  icon?: IconRef;
};

export type Edge = WithId & {
  kind: 'edge';
  points: Array<[number, number]>;
  dashed?: boolean;
  arrow?: boolean;
};

export type ConnectorLabel = WithId & {
  kind: 'connectorLabel';
  cx: number; cy: number;
  text: string;
  optional?: string;
  num?: string;
};

/**
 * Auto-routed connector between two items by id. Fixtures use raw-points
 * `Edge`; the editor uses `Connector` so moving an item re-routes without
 * bookkeeping. Optional label lives on the connector itself — matches the
 * prototype's shape and keeps the editor state flat.
 */
export type ArrowMode = 'none' | 'target' | 'source' | 'both';

export type Connector = WithId & {
  kind: 'connector';
  from: string;
  to: string;
  routing?: 'straight' | 'elbow';
  dashed?: boolean;
  /**
   * Arrow ends. Default 'target' (arrow only at destination, matching the
   * spec's "every connector is directional" default). Use 'both' when a
   * relationship really is bidirectional — the guide's §4 rules out
   * double-headed arrows for one connector, but two parallel connectors
   * with 'target' each is the preferred idiom for bidirectional flows.
   */
  arrows?: ArrowMode;
  label?: string;
  optional?: string;
  num?: string;
};

export type Legend = WithId & {
  kind: 'legend';
  x: number; y: number;
  encoding: string;
  rows: Array<[ColorName, string]>;
};

export type Caption = WithId & {
  kind: 'caption';
  x: number; y: number;
  text: string;
};

/**
 * Diagram title. Bold, larger than a Caption — the visible heading a
 * reader sees first (e.g. "Intercom AI Engine Diagram"). Distinct from
 * `DiagramDoc.title` which is the fixed doc-metadata pair rendered in the
 * top-left; a Title item is placeable anywhere on the canvas.
 */
export type Title = WithId & {
  kind: 'title';
  x: number; y: number;
  text: string;
};

/**
 * Distributive Omit: applies Omit<_, K> to each variant of a discriminated
 * union rather than to the union as a whole. Without this, `Omit<Item, 'id'>`
 * collapses the discrimination and object literals stop typechecking.
 */
export type ItemDraft = Item extends infer T
  ? T extends { kind: string } ? Omit<T, 'id'> : never
  : never;

/**
 * Assigns deterministic sequential IDs (i0..iN) to items that don't already
 * carry one. Items may pre-set `id` (as symbolic slugs like `saas-backend`)
 * so connectors can reference them by a stable, readable name; anything
 * unnamed falls back to `iN`.
 */
export function withIds<T extends { kind: string; id?: string }>(items: T[]): Array<T & { id: string }> {
  return items.map((item, i) => ({ ...item, id: item.id ?? `i${i}` }));
}

/**
 * Upgrade any older document version to the current format. Applied on
 * every load — the editor never touches v1 shapes internally, only their
 * migrated equivalents.
 *
 * Migrations:
 *  - v1 → v2 (boundary fill from nesting depth, §3.4 rewrite):
 *      Drop the `filled` field from every boundary item. Fill is now
 *      derived from containment depth at render time.
 */
export function migrateDoc(raw: unknown): DiagramDoc {
  if (!raw || typeof raw !== 'object') {
    throw new Error('migrateDoc: expected a document object');
  }
  const doc = raw as Record<string, unknown>;
  const version = typeof doc['version'] === 'number' ? doc['version'] : 1;
  const items = Array.isArray(doc['items']) ? doc['items'] as Array<Record<string, unknown>> : [];

  let migrated = items;
  if (version < 2) {
    migrated = migrated.map((it) => {
      if (it['kind'] === 'boundary' && 'filled' in it) {
        const clone = { ...it };
        delete clone['filled'];
        return clone;
      }
      return it;
    });
  }

  const out: DiagramDoc = {
    version: 2,
    width: typeof doc['width'] === 'number' ? doc['width'] : 1200,
    height: typeof doc['height'] === 'number' ? doc['height'] : 800,
    items: migrated as unknown as Item[],
  };
  if (Array.isArray(doc['title']) && doc['title'].length === 2) {
    out.title = doc['title'] as [string, string];
  }
  const enc = doc['encoding'];
  if (enc === 'ownership' || enc === 'emphasis' || enc === 'state') {
    out.encoding = enc;
  }
  return out;
}
