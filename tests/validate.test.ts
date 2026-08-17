import { describe, it, expect } from 'vitest';
import { validate, allowedElementColors } from '../src/validate';
import { withIds, type DiagramDoc, type Item, type ItemDraft } from '../src/model';
import { namedIcon } from '../src/icons';

function docWith<T extends ItemDraft>(items: T[], encoding?: DiagramDoc['encoding']): DiagramDoc {
  const doc: DiagramDoc = {
    version: 1,
    width: 800, height: 600,
    items: withIds(items) as unknown as Item[],
  };
  if (encoding) doc.encoding = encoding;
  return doc;
}

describe('allowedElementColors', () => {
  it('gates colors per encoding', () => {
    expect(allowedElementColors(undefined).has('blue')).toBe(false);
    expect(allowedElementColors('ownership').has('blue')).toBe(true);
    expect(allowedElementColors('state').has('blue')).toBe(false);
    expect(allowedElementColors('state').has('red')).toBe(true);
    expect(allowedElementColors('emphasis').has('red')).toBe(false);
  });
});

describe('validate — legend required for State', () => {
  it('fires §6.3.9 when encoding=state and no legend exists', () => {
    const doc = docWith([{ kind: 'element', x: 0, y: 0, label: 'x' }], 'state');
    const v = validate(doc);
    expect(v.some((x) => x.id === 'state-needs-legend')).toBe(true);
  });

  it('does not fire when a legend is present', () => {
    const doc = docWith([
      { kind: 'element', x: 0, y: 0, label: 'x' },
      { kind: 'legend', x: 0, y: 0, encoding: 'State', rows: [['amber', 'Untrusted']] },
    ], 'state');
    const v = validate(doc);
    expect(v.some((x) => x.id === 'state-needs-legend')).toBe(false);
  });

  it('does not fire when encoding is not state', () => {
    const doc = docWith([{ kind: 'element', x: 0, y: 0, label: 'x' }], 'ownership');
    const v = validate(doc);
    expect(v.some((x) => x.id === 'state-needs-legend')).toBe(false);
  });
});

describe('validate — invalid color for encoding', () => {
  it('flags a blue element under grayscale', () => {
    const doc = docWith([{ kind: 'element', x: 0, y: 0, label: 'x', color: 'blue' }]);
    const v = validate(doc);
    const bad = v.find((x) => x.id.startsWith('bad-color:'));
    expect(bad).toBeDefined();
    expect(bad?.itemIds).toEqual(['i0']);
    expect(bad?.fix?.label).toBe('Change to white');
  });

  it('flags a red element under Ownership', () => {
    const doc = docWith([{ kind: 'element', x: 0, y: 0, label: 'x', color: 'red' }], 'ownership');
    expect(validate(doc).some((x) => x.id.startsWith('bad-color:'))).toBe(true);
  });

  it('flags a blue element under State', () => {
    // Include legend so we're isolating the color rule.
    const doc = docWith([
      { kind: 'element', x: 0, y: 0, label: 'x', color: 'blue' },
      { kind: 'legend', x: 0, y: 0, encoding: 'State', rows: [['red', 'At risk']] },
    ], 'state');
    expect(validate(doc).some((x) => x.id.startsWith('bad-color:'))).toBe(true);
  });

  it('allows amber under State', () => {
    const doc = docWith([
      { kind: 'element', x: 0, y: 0, label: 'x', color: 'amber' },
      { kind: 'legend', x: 0, y: 0, encoding: 'State', rows: [['amber', 'x']] },
    ], 'state');
    expect(validate(doc).some((x) => x.id.startsWith('bad-color:'))).toBe(false);
  });
});

describe('validate — tinted boundary', () => {
  it('flags tint under Ownership', () => {
    const doc = docWith([
      { kind: 'boundary', x: 0, y: 0, w: 200, h: 200, label: 'Zone', tint: 'amber' },
    ], 'ownership');
    expect(validate(doc).some((x) => x.id.startsWith('bad-tint:'))).toBe(true);
  });

  it('allows tint under State', () => {
    const doc = docWith([
      { kind: 'boundary', x: 0, y: 0, w: 200, h: 200, label: 'Zone', tint: 'amber' },
      { kind: 'legend', x: 0, y: 0, encoding: 'State', rows: [['amber', 'x']] },
    ], 'state');
    expect(validate(doc).some((x) => x.id.startsWith('bad-tint:'))).toBe(false);
  });
});

describe('validate — hue cap', () => {
  it('fires when three hues appear', () => {
    const doc = docWith([
      { kind: 'element', x: 0, y: 0, label: 'a', color: 'blue' },
      { kind: 'element', x: 0, y: 0, label: 'b', color: 'red' },
      { kind: 'element', x: 0, y: 0, label: 'c', color: 'amber' },
      { kind: 'legend', x: 0, y: 0, encoding: 'State', rows: [['red', 'x']] },
    ], 'state');
    // (Blue also trips bad-color under state; hue count still 3.)
    expect(validate(doc).some((x) => x.id === 'too-many-hues')).toBe(true);
  });
});

describe('validate — blue cap under Emphasis', () => {
  it('warns when blue >33%', () => {
    // 3 blue, 5 total → 60%
    const doc = docWith([
      { kind: 'element', x: 0, y: 0, label: '1', color: 'blue' },
      { kind: 'element', x: 0, y: 0, label: '2', color: 'blue' },
      { kind: 'element', x: 0, y: 0, label: '3', color: 'blue' },
      { kind: 'element', x: 0, y: 0, label: '4', color: 'white' },
      { kind: 'element', x: 0, y: 0, label: '5', color: 'white' },
    ], 'emphasis');
    expect(validate(doc).some((x) => x.id === 'blue-over-cap')).toBe(true);
  });

  it('does not warn at exactly one third', () => {
    // 1 blue, 3 total → 33.3%. Rule: strictly greater than 1/3 fires.
    // JS floating point: 1/3 fires? 1/3 > 1/3 → false. So this shouldn't fire.
    const doc = docWith([
      { kind: 'element', x: 0, y: 0, label: '1', color: 'blue' },
      { kind: 'element', x: 0, y: 0, label: '2', color: 'white' },
      { kind: 'element', x: 0, y: 0, label: '3', color: 'white' },
    ], 'emphasis');
    expect(validate(doc).some((x) => x.id === 'blue-over-cap')).toBe(false);
  });
});

describe('validate — density cap', () => {
  it('warns above 18 elements', () => {
    const items = Array.from({ length: 19 }, (_, i) => ({
      kind: 'element' as const, x: 0, y: 0, label: `e${i}`,
    }));
    const doc = docWith(items);
    expect(validate(doc).some((x) => x.id === 'over-density')).toBe(true);
  });

  it('does not warn at 18', () => {
    const items = Array.from({ length: 18 }, (_, i) => ({
      kind: 'element' as const, x: 0, y: 0, label: `e${i}`,
    }));
    const doc = docWith(items);
    expect(validate(doc).some((x) => x.id === 'over-density')).toBe(false);
  });
});

describe('validate — peer-group icon consistency', () => {
  it('warns when siblings inside a boundary have mixed icons', () => {
    // Boundary 300x300 contains two elements; one has an icon, one doesn't.
    const doc = docWith([
      { kind: 'boundary', x: 0, y: 0, w: 400, h: 400, label: 'B' },
      { kind: 'element', x: 20, y: 20, label: 'a', icon: namedIcon('shield') },
      { kind: 'element', x: 20, y: 100, label: 'b' },
    ]);
    expect(validate(doc).some((x) => x.id.startsWith('mixed-icons:'))).toBe(true);
  });

  it('does not warn when all siblings have icons or none do', () => {
    const doc = docWith([
      { kind: 'boundary', x: 0, y: 0, w: 400, h: 400, label: 'B' },
      { kind: 'element', x: 20, y: 20, label: 'a', icon: namedIcon('shield') },
      { kind: 'element', x: 20, y: 100, label: 'b', icon: namedIcon('lock') },
    ]);
    expect(validate(doc).some((x) => x.id.startsWith('mixed-icons:'))).toBe(false);
  });

  it('does not warn on a lone sibling', () => {
    const doc = docWith([
      { kind: 'boundary', x: 0, y: 0, w: 400, h: 400, label: 'B' },
      { kind: 'element', x: 20, y: 20, label: 'a', icon: namedIcon('shield') },
    ]);
    expect(validate(doc).some((x) => x.id.startsWith('mixed-icons:'))).toBe(false);
  });
});
