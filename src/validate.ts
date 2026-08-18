import type { DiagramDoc, Item, Encoding, Element, Boundary } from './model';
import type { EditorAction } from './editorState';
import { layout, containmentDepth } from './layout';
import { TOKENS } from './tokens';

const MAX_BOUNDARY_DEPTH = 2;

/**
 * Runtime-checked style-guide rules. Renders the violations that would
 * otherwise only be caught at review. Each violation names the specific
 * items involved and can carry an optional Fix — the editor dispatches the
 * fix action only on explicit user click, never automatically.
 *
 * This is the on-canvas counterpart to render()'s build-time fit warnings.
 */

export type Violation = {
  /** Stable identity so the panel can dedupe across renders. */
  id: string;
  severity: 'error' | 'warn';
  message: string;
  ruleRef: string;   // e.g. "§6.3.9"
  itemIds: string[]; // click a violation to select these
  fix?: { label: string; action: EditorAction };
};

const HUE_COLORS = new Set(['blue', 'red', 'amber', 'green']);

const ALLOWED_ELEMENT_COLORS: Record<'undefined' | Encoding, ReadonlySet<string>> = {
  undefined: new Set(['white', 'gray']),
  ownership: new Set(['white', 'gray', 'blue']),
  emphasis: new Set(['white', 'gray', 'blue']),
  state: new Set(['white', 'gray', 'red', 'amber', 'green']),
};

export function allowedElementColors(encoding: Encoding | undefined): ReadonlySet<string> {
  return ALLOWED_ELEMENT_COLORS[encoding ?? 'undefined'];
}

export function validate(doc: DiagramDoc): Violation[] {
  const violations: Violation[] = [];
  const enc = doc.encoding;
  const allowedColors = allowedElementColors(enc);

  const elements = doc.items.filter((i): i is Element => i.kind === 'element');
  const grouped = doc.items.filter((i) => i.kind === 'grouped');
  const boundaries = doc.items.filter((i): i is Boundary => i.kind === 'boundary');
  const legends = doc.items.filter((i) => i.kind === 'legend');

  // §6.3.9 — Legend required for State encoding.
  if (enc === 'state' && legends.length === 0) {
    violations.push({
      id: 'state-needs-legend',
      severity: 'error',
      ruleRef: '§6.3.9',
      message: 'State encoding requires a legend explaining what each colour means.',
      itemIds: [],
      fix: {
        label: 'Add legend',
        action: {
          kind: 'add',
          // Editor's newId() runs at dispatch time via dedicated action; we
          // use a fixed sentinel here and let the panel replace it with a
          // fresh id when it dispatches. See ui/violations.ts.
          id: '__PENDING__',
          item: {
            kind: 'legend',
            x: 40, y: 40,
            encoding: 'State',
            rows: [
              ['red', 'At risk'],
              ['amber', 'Degraded'],
              ['green', 'Protected'],
            ],
          },
        },
      },
    });
  }

  // §6.3.1 / §6.3.3 — Colors must be valid for the declared encoding.
  for (const el of elements) {
    const color = el.color ?? 'white';
    if (!allowedColors.has(color)) {
      violations.push({
        id: `bad-color:${el.id}:${color}`,
        severity: 'error',
        ruleRef: '§6.3',
        message: `"${el.label}" is ${color}, which isn't allowed under ${enc ?? 'grayscale'} encoding.`,
        itemIds: [el.id],
        fix: {
          label: 'Change to white',
          action: { kind: 'update', id: el.id, patch: { color: 'white' } },
        },
      });
    }
  }
  for (const g of grouped) {
    const color = ('color' in g && g.color) ? g.color : 'white';
    if (!allowedColors.has(color)) {
      violations.push({
        id: `bad-color:${g.id}:${color}`,
        severity: 'error',
        ruleRef: '§6.3',
        message: `Grouped "${g.label}" is ${color}, which isn't allowed under ${enc ?? 'grayscale'} encoding.`,
        itemIds: [g.id],
        fix: {
          label: 'Change to white',
          action: { kind: 'update', id: g.id, patch: { color: 'white' } },
        },
      });
    }
  }

  // §3.4 v2.3 — Max two levels of boundary nesting.
  for (const b of boundaries) {
    const depth = containmentDepth(b.id, doc);
    if (depth > MAX_BOUNDARY_DEPTH) {
      violations.push({
        id: `deep-nesting:${b.id}`,
        severity: 'error',
        ruleRef: '§3.4',
        message: `Boundary "${b.label}" is nested ${depth} levels deep. Cap is ${MAX_BOUNDARY_DEPTH} — flatten or split the diagram.`,
        itemIds: [b.id],
      });
    }
  }

  // §3.4 / §6.3.7 — Tinted boundary only under State encoding.
  for (const b of boundaries) {
    if (b.tint && enc !== 'state') {
      violations.push({
        id: `bad-tint:${b.id}`,
        severity: 'error',
        ruleRef: '§3.4',
        message: `Boundary "${b.label}" is tinted, but tint is only allowed under State encoding.`,
        itemIds: [b.id],
        fix: {
          label: 'Remove tint',
          action: { kind: 'update', id: b.id, patch: { tint: undefined } },
        },
      });
    }
  }

  // §6.3.4 — Max two hues per diagram (excluding grayscale).
  const hues = new Set<string>();
  for (const el of elements) {
    const c = el.color ?? 'white';
    if (HUE_COLORS.has(c)) hues.add(c);
  }
  for (const g of grouped as Array<{ id: string; color?: string }>) {
    const c = g.color ?? 'white';
    if (HUE_COLORS.has(c)) hues.add(c);
  }
  for (const b of boundaries) {
    if (b.tint && HUE_COLORS.has(b.tint)) hues.add(b.tint);
  }
  if (hues.size > 2) {
    violations.push({
      id: 'too-many-hues',
      severity: 'warn',
      ruleRef: '§6.3.4',
      message: `${hues.size} hues in use (${[...hues].join(', ')}). Maximum is 2 — the diagram is doing too much.`,
      itemIds: [],
    });
  }

  // §6.3.2 — Blue caps at one third under Emphasis.
  if (enc === 'emphasis' && elements.length > 0) {
    const blueEls = elements.filter((e) => (e.color ?? 'white') === 'blue');
    const share = blueEls.length / elements.length;
    if (share > 1 / 3) {
      violations.push({
        id: 'blue-over-cap',
        severity: 'warn',
        ruleRef: '§6.3.2',
        message: `${blueEls.length}/${elements.length} elements are blue (${Math.round(share * 100)}%). Under Emphasis, blue caps at one third.`,
        itemIds: blueEls.map((e) => e.id),
      });
    }
  }

  // §9 — Density cap of 18 "elements" (element + grouped + actor + inlineControl).
  const density = doc.items.filter((i) =>
    i.kind === 'element' || i.kind === 'grouped' || i.kind === 'actor' || i.kind === 'inlineControl'
  );
  if (density.length > TOKENS.canvas.maxElements) {
    violations.push({
      id: 'over-density',
      severity: 'warn',
      ruleRef: '§9',
      message: `${density.length} elements (cap is ${TOKENS.canvas.maxElements}). Split the diagram or abstract a cluster into a Grouped element.`,
      itemIds: density.map((i) => i.id),
    });
  }

  // §8.2 — Vendor mark on a colored fill.
  for (const el of elements) {
    if (!el.markId) continue;
    const color = el.color ?? 'white';
    if (color !== 'white' && color !== 'gray') {
      violations.push({
        id: `mark-on-color:${el.id}`,
        severity: 'error',
        ruleRef: '§8.2',
        message: `"${el.label}" carries a vendor mark on a ${color} fill. Marks only sit on white or gray.`,
        itemIds: [el.id],
        fix: {
          label: 'Change fill to white',
          action: { kind: 'update', id: el.id, patch: { color: 'white' } },
        },
      });
    }
  }

  // §8.4 — Varonis mark appears at most once per diagram.
  const varonisCount = doc.items.filter(
    (i) => (i.kind === 'element' || i.kind === 'boundary') && i.markId === 'varonis',
  ).length;
  if (varonisCount > 1) {
    violations.push({
      id: 'varonis-mark-repeated',
      severity: 'warn',
      ruleRef: '§8.4',
      message: `The Varonis mark appears ${varonisCount} times. §8.4 caps it at 1 per diagram — use the blue Ownership fill instead.`,
      itemIds: doc.items
        .filter((i) => (i.kind === 'element' || i.kind === 'boundary') && i.markId === 'varonis')
        .map((i) => i.id),
    });
  }

  // §7.2 / §8.1 — Mixed marks and icons in a peer group. Scoped to elements
  // sharing a boundary. Root-level elements are not treated as an implied
  // peer group: the spec's other peer-group case ("a row of elements serving
  // the same role") is a design intent we cannot infer from geometry, and
  // the historical root-level heuristic produced far more false positives
  // than real catches.
  const groups2 = elementsByBoundary(doc);
  for (const [container, els] of groups2) {
    if (container === null) continue;
    if (els.length < 2) continue;
    const withMark = els.filter((e) => !!e.markId);
    const withIcon = els.filter((e) => !!e.icon);
    const withoutAny = els.filter((e) => !e.markId && !e.icon);
    const distinctCategories = [withMark.length > 0, withIcon.length > 0, withoutAny.length > 0].filter(Boolean).length;
    if (distinctCategories > 1) {
      violations.push({
        id: `mixed-marks-icons:${container}`,
        severity: 'warn',
        ruleRef: '§8.1',
        message: `Elements inside "${container}" mix vendor marks and icons — peer groups should be all-or-nothing (§7.2, §8.1).`,
        itemIds: els.map((e) => e.id),
      });
    }
  }

  // §7.2 — Mixed icons within a peer group. Same scoping rule as above.
  const peerGroups = elementsByBoundary(doc);
  for (const [container, els] of peerGroups) {
    if (container === null) continue;
    if (els.length < 2) continue;
    const withIcon = els.filter((e) => e.icon);
    const withoutIcon = els.filter((e) => !e.icon);
    if (withIcon.length > 0 && withoutIcon.length > 0) {
      violations.push({
        id: `mixed-icons:${container}`,
        severity: 'warn',
        ruleRef: '§7.2',
        message: `Elements inside "${container}" have mixed icons — a peer group should be all-or-nothing.`,
        itemIds: withIcon.length < withoutIcon.length
          ? withIcon.map((e) => e.id)
          : withoutIcon.map((e) => e.id),
      });
    }
  }

  return violations;
}

/**
 * Groups Elements by the deepest containing Boundary. Returns a Map keyed by
 * the boundary's label (or null for root). Uses geometric containment via
 * layout()'s bboxes so any Element whose bbox fits inside a Boundary counts
 * as its child, matching the spec's "sibling inside the same boundary"
 * definition of a peer group.
 */
function elementsByBoundary(doc: DiagramDoc): Map<string | null, Element[]> {
  const bboxes = layout(doc);
  const elements = doc.items.filter((i): i is Element => i.kind === 'element');
  const boundaries = doc.items.filter((i): i is Boundary => i.kind === 'boundary');

  const groups = new Map<string | null, Element[]>();
  for (const el of elements) {
    const eb = bboxes.get(el.id);
    if (!eb) continue;

    // Deepest containing boundary = smallest area that fully encloses the
    // element. Root if none.
    let best: Boundary | null = null;
    let bestArea = Infinity;
    for (const b of boundaries) {
      const bb = bboxes.get(b.id);
      if (!bb) continue;
      const encloses =
        eb.x >= bb.x && eb.y >= bb.y &&
        eb.x + eb.w <= bb.x + bb.w &&
        eb.y + eb.h <= bb.y + bb.h;
      if (encloses) {
        const area = bb.w * bb.h;
        if (area < bestArea) { bestArea = area; best = b; }
      }
    }
    const key = best ? best.label : null;
    const list = groups.get(key) ?? [];
    list.push(el);
    groups.set(key, list);
  }
  return groups;
}
