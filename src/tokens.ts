/**
 * Tokens mirrored from section 11 of docs/varonis-diagram-style-guide.md.
 * The guide is authoritative — if this file and the guide disagree, the guide wins.
 * tests/tokens.test.ts asserts this object still matches section 11's JSON.
 */
export const TOKENS = {
  version: '2.3.0',
  canvas: { grid: 10, minElementGap: 60, minUnconnectedGap: 40, boundaryPadding: 20, maxElements: 18 },
  palette: {
    white: { fill: '#ffffff', stroke: '#d3d9e0', role: 'default' },
    gray:  { fill: '#f4f6f8', stroke: '#d3d9e0', role: 'default' },
    blue:  { fill: '#e8f1fc', stroke: '#a3c2ea', role: 'accent' },
    red:   { fill: '#fdeaea', stroke: '#eda9a9', role: 'state' },
    amber: { fill: '#fdf6e0', stroke: '#e8d38a', role: 'state' },
    green: { fill: '#eef8e4', stroke: '#b9dd9a', role: 'state' },
  },
  ink: {
    primary: '#1f2933', secondary: '#5a6570', icon: '#263238',
    connector: '#3f4a56', connectorDashed: '#9aa4b0',
    labelStroke: '#cdd4dc', boundaryStroke: '#a9b2bd', optionalText: '#7a8794',
  },
  elements: {
    element: {
      radius: 0, stroke: 1,
      sizes: { sm: [150, 34], md: [180, 64], lg: [180, 92] },
      padding: { side: 15, iconLeft: 10, iconToLabel: 5 },
      iconPlacement: { sm: 'inline-left', md: 'centred-above', lg: 'centred-above' },
      iconDefault: 'none',
      iconPeerGroupConsistency: true,
      iconPlusTwoLinesRequires: 'lg',
    },
    grouped: {
      radius: 0, stroke: 1, width: 190, maxChildren: 6,
      padding: { side: 10, top: 15, headerToRow: 15, rowGap: 5, bottom: 10 },
      rowHeight: 30,
    },
    inlineControl: {
      shape: 'stadium', minWidth: 90, height: 36, stroke: 1.5, fill: '#ffffff', iconSize: 16,
    },
    boundary: {
      radius: 0, stroke: 1.2, dash: '6 4', strokeColor: '#a9b2bd',
      fillByDepth: { '0': 'none', '1+': '#f8f9fa' }, maxNestingDepth: 2,
      innerPadding: 20, labelSide: ['left', 'right'], labelAboveConnectors: true,
      colorable: 'stateEncodingZoneClaimOnly',
    },
    zoneDivider: {
      stroke: 1, dash: '6 4', strokeColor: '#a9b2bd', colorable: false, labelPosition: 'start',
    },
    actor: { iconSize: 32, box: false, labelBelow: true },
  },
  connectors: {
    primary: { stroke: 1.3, color: '#3f4a56', arrow: true },
    dashed:  { stroke: 1.3, color: '#9aa4b0', dash: '5 4', arrow: true },
    routing: ['straight', 'orthogonal-elbow'],
    termination: 'edge-midpoint',
    sharedEdgeConnectors: 'evenly-spaced-centred-on-midpoint',
    colorable: 'stateEncodingOnly',
  },
  connectorLabel: {
    height: 18, heightTwoLine: 32, radius: 9,
    font: { family: 'monospace', size: 8, weight: 700, transform: 'uppercase' },
    optionalText: { weight: 400, color: '#7a8794' },
    numberBadge: { radius: 7.5, implies: 'sequence' },
    maxChars: 30,
  },
  typography: {
    elementLabel:    { size: 12.5, case: 'sentence', maxLines: 3 },
    elementSubLabel: { size: 11.5, case: 'sentence' },
    smallLabel:      { size: 12,   case: 'sentence' },
    boundaryLabel:   { size: 12,   case: 'sentence', color: '#5a6570', inset: 15 },
    rotation: 'forbidden',
  },
  icons: {
    library: 'material-symbols',
    renderSizeSvg: 16,
    settings: { weight: 200, grade: 200, opticalSize: 24 },
    size: 24, maxSize: 29, align: 'cap-height', color: '#263238', perElement: 1,
  },
  colorRules: {
    encodings: ['ownership', 'emphasis', 'state'],
    encodingsPerDiagram: 1,
    maxHues: 2,
    blueMaxShareOfElements: 0.33,
    blueCapAppliesTo: 'emphasis',
    zoneTintAllowedUnder: 'state',
    tintedZoneContentsUncoloured: true,
    stateColorsEncodeType: false,
    colorAloneCarriesMeaning: false,
    legendRequiredAbove: 6,
    legendRequiredForState: true,
  },
  vendorMarks: {
    size: 24, replacesIcon: true, allowedFills: ['white', 'gray'],
    boundaryBadgePosition: 'top-right', peerGroupConsistency: true,
    varonisMarkMaxPerDiagram: 1,
  },
  export: { png: { scale: 2, background: 'transparent' }, svg: true, jpg: false },
} as const;

// ---- Derived, renderer-facing constants ---------------------------------

export type ColorName = keyof typeof TOKENS.palette;
export type SizeName = 'sm' | 'md' | 'lg';

export const PALETTE = TOKENS.palette;
export const SIZES: Record<SizeName, readonly [number, number]> = {
  sm: TOKENS.elements.element.sizes.sm,
  md: TOKENS.elements.element.sizes.md,
  lg: TOKENS.elements.element.sizes.lg,
};

export const INK = TOKENS.ink.primary;
export const SUB = TOKENS.ink.secondary;
export const ICON_COLOR = TOKENS.ink.icon;
export const CONN = TOKENS.ink.connector;
export const CONN_DASHED = TOKENS.ink.connectorDashed;
export const LABEL_STROKE = TOKENS.ink.labelStroke;
export const BOUNDARY_STROKE = TOKENS.ink.boundaryStroke;
export const OPTIONAL_TEXT = TOKENS.ink.optionalText;

// Font stacks are not in the guide; adopted from reference/v2.py so the port
// produces visually equivalent output.
export const MONO_FAMILY = 'ui-monospace,Menlo,Consolas,monospace';
export const UI_FAMILY = "'Segoe UI', system-ui, -apple-system, sans-serif";
