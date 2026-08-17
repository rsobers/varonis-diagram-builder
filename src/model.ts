import type { ColorName, SizeName } from './tokens';
import type { IconName } from './icons';

/**
 * Serialized diagram format. `version` is bumped whenever the on-disk shape
 * changes so saved diagrams from earlier builds can be migrated forward.
 */
export type DiagramDoc = {
  version: 1;
  width: number;
  height: number;
  title?: [string, string];
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
  | Legend
  | Caption;

export type Boundary = {
  kind: 'boundary';
  x: number; y: number; w: number; h: number;
  label: string;
  filled?: boolean;
  labelSide?: 'left' | 'right';
  tint?: ColorName;
};

export type ZoneDivider = {
  kind: 'zoneDivider';
  x: number; y1: number; y2: number;
  label: string;
};

export type Element = {
  kind: 'element';
  x: number; y: number;
  label: string;
  size?: SizeName;
  color?: ColorName;
  icon?: IconName;
  sub?: string;
};

export type Grouped = {
  kind: 'grouped';
  x: number; y: number;
  label: string;
  children: Array<{ label: string; icon?: IconName }>;
  color?: ColorName;
};

export type InlineControl = {
  kind: 'inlineControl';
  x: number; y: number;
  label: string;
  icon?: IconName;
};

export type Actor = {
  kind: 'actor';
  cx: number; y: number;
  label: string;
  icon?: IconName;
};

export type Edge = {
  kind: 'edge';
  points: Array<[number, number]>;
  dashed?: boolean;
  arrow?: boolean;
};

export type ConnectorLabel = {
  kind: 'connectorLabel';
  cx: number; cy: number;
  text: string;
  optional?: string;
  num?: string;
};

export type Legend = {
  kind: 'legend';
  x: number; y: number;
  encoding: string;
  rows: Array<[ColorName, string]>;
};

export type Caption = {
  kind: 'caption';
  x: number; y: number;
  text: string;
};
