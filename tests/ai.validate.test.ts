import { describe, it, expect } from 'vitest';
import {
  validateGeneration, CANVAS_W, CANVAS_H,
  MAX_ELEMENTS, MAX_BOUNDARIES, MAX_CONNECTORS,
} from '../src/ai';
import type { Connector, Element } from '../src/model';

describe('validateGeneration — basics', () => {
  it('returns an empty doc for empty input', () => {
    const { doc, warnings } = validateGeneration({ items: [] });
    expect(doc.items).toEqual([]);
    expect(doc.width).toBe(CANVAS_W);
    expect(doc.height).toBe(CANVAS_H);
    expect(warnings).toEqual([]);
  });

  it('preserves the caller-supplied encoding over the model output', () => {
    const { doc } = validateGeneration({ encoding: 'ownership', items: [] }, 'state');
    expect(doc.encoding).toBe('state');
  });

  it('accepts the model-supplied encoding when the caller omits one', () => {
    const { doc } = validateGeneration({ encoding: 'emphasis', items: [] });
    expect(doc.encoding).toBe('emphasis');
  });
});

describe('validateGeneration — coordinate clamping', () => {
  it('clamps element x/y to canvas bounds', () => {
    const { doc } = validateGeneration({
      items: [
        { id: 'n1', kind: 'element', label: 'A', x: -50, y: -50 },
        { id: 'n2', kind: 'element', label: 'B', x: 99999, y: 99999 },
      ],
    });
    const [a, b] = doc.items as Element[];
    expect(a!.x).toBe(0);
    expect(a!.y).toBe(0);
    expect(b!.x).toBeLessThanOrEqual(CANVAS_W - 60);
    expect(b!.y).toBeLessThanOrEqual(CANVAS_H - 34);
  });
});

describe('validateGeneration — color gating by encoding', () => {
  it('recolors blue elements under State to white and warns', () => {
    const { doc, warnings } = validateGeneration({
      items: [{ id: 'n1', kind: 'element', label: 'X', color: 'blue' }],
    }, 'state');
    const el = doc.items[0] as Element;
    expect(el.color).toBe('white');
    expect(warnings.some((w) => /Recoloured/.test(w))).toBe(true);
  });

  it('recolors red under grayscale to white', () => {
    const { doc } = validateGeneration({
      items: [{ id: 'n1', kind: 'element', label: 'X', color: 'red' }],
    });
    expect((doc.items[0] as Element).color).toBe('white');
  });

  it('drops boundary tint when encoding is not state', () => {
    const { doc } = validateGeneration({
      items: [{ id: 'b1', kind: 'boundary', label: 'Z', x: 0, y: 0, w: 200, h: 200, tint: 'amber' }],
    }, 'ownership');
    const b = doc.items[0] as { tint?: string };
    expect(b.tint).toBeUndefined();
  });

  it('keeps boundary tint under state', () => {
    const { doc } = validateGeneration({
      items: [{ id: 'b1', kind: 'boundary', label: 'Z', x: 0, y: 0, w: 200, h: 200, tint: 'amber' }],
    }, 'state');
    const b = doc.items[0] as { tint?: string };
    expect(b.tint).toBe('amber');
  });
});

describe('validateGeneration — icons', () => {
  it('resolves a known icon name to a ref with a path', () => {
    const { doc } = validateGeneration({
      items: [{ id: 'n1', kind: 'element', label: 'X', icon: 'shield' }],
    });
    const el = doc.items[0] as Element;
    expect(el.icon?.name).toBe('shield');
    expect(el.icon?.path).toBeTruthy();
  });

  it('drops unknown icons and warns', () => {
    const { doc, warnings } = validateGeneration({
      items: [{ id: 'n1', kind: 'element', label: 'X', icon: 'not-a-real-icon' }],
    });
    expect((doc.items[0] as Element).icon).toBeUndefined();
    expect(warnings.some((w) => /Dropped unknown icon/.test(w))).toBe(true);
  });
});

describe('validateGeneration — count caps', () => {
  it(`caps at ${MAX_ELEMENTS} elements (§9)`, () => {
    const items = Array.from({ length: MAX_ELEMENTS + 5 }, (_, i) => ({
      id: `n${i}`, kind: 'element', label: `E${i}`,
    }));
    const { doc, warnings } = validateGeneration({ items });
    const elements = doc.items.filter((i) => i.kind === 'element');
    expect(elements).toHaveLength(MAX_ELEMENTS);
    expect(warnings.some((w) => /Dropped extra element/.test(w))).toBe(true);
  });

  it(`caps at ${MAX_BOUNDARIES} boundaries`, () => {
    const items = Array.from({ length: MAX_BOUNDARIES + 2 }, (_, i) => ({
      id: `b${i}`, kind: 'boundary', label: `B${i}`, x: 0, y: 0, w: 200, h: 200,
    }));
    const { doc } = validateGeneration({ items });
    expect(doc.items.filter((i) => i.kind === 'boundary')).toHaveLength(MAX_BOUNDARIES);
  });

  it(`caps at ${MAX_CONNECTORS} connectors`, () => {
    const items: Array<Record<string, unknown>> = [
      { id: 'n0', kind: 'element', label: 'A' },
      { id: 'n1', kind: 'element', label: 'B' },
    ];
    for (let i = 0; i < MAX_CONNECTORS + 3; i++) {
      items.push({ id: `c${i}`, kind: 'connector', from: 'n0', to: 'n1' });
    }
    const { doc } = validateGeneration({ items });
    expect(doc.items.filter((i) => i.kind === 'connector')).toHaveLength(MAX_CONNECTORS);
  });
});

describe('validateGeneration — connector endpoint resolution', () => {
  it('drops connectors whose endpoints do not resolve, and warns', () => {
    const { doc, warnings } = validateGeneration({
      items: [
        { id: 'n1', kind: 'element', label: 'A' },
        { id: 'c1', kind: 'connector', from: 'n1', to: 'missing' },
      ],
    });
    expect(doc.items.filter((i) => i.kind === 'connector')).toHaveLength(0);
    expect(warnings.some((w) => /unresolved endpoint/.test(w))).toBe(true);
  });

  it('drops self-loops', () => {
    const { doc } = validateGeneration({
      items: [
        { id: 'n1', kind: 'element', label: 'A' },
        { id: 'c1', kind: 'connector', from: 'n1', to: 'n1' },
      ],
    });
    expect(doc.items.filter((i) => i.kind === 'connector')).toHaveLength(0);
  });

  it('remaps connector endpoints through the id map', () => {
    // Model uses "n1"/"n2" ids; validator renames to g0/g1/... Connector
    // should still hook up correctly to the renamed elements.
    const { doc } = validateGeneration({
      items: [
        { id: 'n1', kind: 'element', label: 'A' },
        { id: 'n2', kind: 'element', label: 'B' },
        { id: 'c1', kind: 'connector', from: 'n1', to: 'n2', label: 'LINK' },
      ],
    });
    const els = doc.items.filter((i) => i.kind === 'element');
    const conn = doc.items.find((i) => i.kind === 'connector') as Connector;
    expect(conn).toBeDefined();
    expect(conn.from).toBe(els[0]!.id);
    expect(conn.to).toBe(els[1]!.id);
    expect(conn.label).toBe('LINK');
  });
});

describe('validateGeneration — actor defaults', () => {
  it('defaults actor icon to person when missing', () => {
    const { doc } = validateGeneration({
      items: [{ id: 'a1', kind: 'actor', label: 'User', cx: 100, y: 60 }],
    });
    const actor = doc.items[0] as { icon?: { name?: string } };
    expect(actor.icon?.name).toBe('person');
  });
});

describe('validateGeneration — unknown kinds', () => {
  it('drops unknown item kinds with a warning', () => {
    const { doc, warnings } = validateGeneration({
      items: [{ id: 'x1', kind: 'nonesuch', label: '?' }],
    });
    expect(doc.items).toHaveLength(0);
    expect(warnings.some((w) => /unknown kind/.test(w))).toBe(true);
  });
});
