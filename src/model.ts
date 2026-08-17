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
  version: 1;
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
  | Caption;

type WithId = { id: string };

export type Boundary = WithId & {
  kind: 'boundary';
  x: number; y: number; w: number; h: number;
  label: string;
  filled?: boolean;
  labelSide?: 'left' | 'right';
  tint?: ColorName;
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
 * Distributive Omit: applies Omit<_, K> to each variant of a discriminated
 * union rather than to the union as a whole. Without this, `Omit<Item, 'id'>`
 * collapses the discrimination and object literals stop typechecking.
 */
export type ItemDraft = Item extends infer T
  ? T extends { kind: string } ? Omit<T, 'id'> : never
  : never;

/**
 * Assigns deterministic sequential IDs (i0..iN) to a list of unidentified
 * items. Keeps fixtures readable while satisfying the required-id contract.
 * Runtime code (editor) uses crypto.randomUUID slices; fixtures use this.
 */
export function withIds<T extends { kind: string }>(items: T[]): Array<T & { id: string }> {
  return items.map((item, i) => ({ ...item, id: `i${i}` }));
}
