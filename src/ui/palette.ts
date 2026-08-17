import type { Editor, EditorState, PlacingIntent } from '../editorState';
import type { ItemDraft } from '../model';
import { PALETTE, type ColorName } from '../tokens';
import { allowedElementColors } from '../validate';
import { ICONS, namedIcon } from '../icons';

// 1x1 transparent PNG used to hide the browser's default drag ghost so we
// can render our own real-size preview inside the canvas.
const TRANSPARENT_PIXEL = (() => {
  const img = new Image(1, 1);
  img.src =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  return img;
})();

/**
 * Palette entries. Each entry is a small factory that builds an `ItemDraft`
 * at a given (x, y) using the currently selected fill color. Entries are
 * both click-to-arm-then-place AND HTML5-draggable — the canvas resolves
 * dropped spec-ids via `buildDraftFromSpec` below.
 */

type Entry = {
  id: string;
  section: string;
  label: string;
  usesFill: boolean;
  chip: (color: ColorName) => string;
  make: (color: ColorName, x: number, y: number) => ItemDraft;
};

const CHIP_BOX = (fill: string, stroke: string, height: number): string =>
  `<svg width="30" height="20" aria-hidden="true"><rect x="2" y="${(20 - height) / 2}" width="26" height="${height}" fill="${fill}" stroke="${stroke}"/></svg>`;

const iconPath = (key: string): string => ICONS[key] ?? '';

const ENTRIES: Entry[] = [
  // Elements — three sizes × plain / +icon.
  {
    id: 'element:sm',
    section: 'Elements', label: 'Small', usesFill: true,
    chip: (c) => CHIP_BOX(PALETTE[c].fill, PALETTE[c].stroke, 9),
    make: (color, x, y) => ({ kind: 'element', x, y, label: 'Element', size: 'sm', color }),
  },
  {
    id: 'element:sm+icon',
    section: 'Elements', label: 'Small + icon', usesFill: true,
    chip: (c) => CHIP_BOX(PALETTE[c].fill, PALETTE[c].stroke, 9),
    make: (color, x, y) => ({ kind: 'element', x, y, label: 'Element', size: 'sm', color, icon: namedIcon('shield') }),
  },
  {
    id: 'element:md',
    section: 'Elements', label: 'Medium', usesFill: true,
    chip: (c) => CHIP_BOX(PALETTE[c].fill, PALETTE[c].stroke, 14),
    make: (color, x, y) => ({ kind: 'element', x, y, label: 'Element', size: 'md', color }),
  },
  {
    id: 'element:md+icon',
    section: 'Elements', label: 'Medium + icon', usesFill: true,
    chip: (c) => CHIP_BOX(PALETTE[c].fill, PALETTE[c].stroke, 14),
    make: (color, x, y) => ({ kind: 'element', x, y, label: 'Element', size: 'md', color, icon: namedIcon('shield') }),
  },
  {
    id: 'element:lg',
    section: 'Elements', label: 'Large', usesFill: true,
    chip: (c) => CHIP_BOX(PALETTE[c].fill, PALETTE[c].stroke, 18),
    make: (color, x, y) => ({ kind: 'element', x, y, label: 'Element', size: 'lg', color }),
  },
  {
    id: 'element:lg+icon',
    section: 'Elements', label: 'Large + icon', usesFill: true,
    chip: (c) => CHIP_BOX(PALETTE[c].fill, PALETTE[c].stroke, 18),
    make: (color, x, y) => ({ kind: 'element', x, y, label: 'Element', size: 'lg', color, icon: namedIcon('shield') }),
  },

  // Grouped — list-container with rows.
  {
    id: 'grouped',
    section: 'Grouped', label: 'Grouped list', usesFill: true,
    chip: (c) => `<svg width="30" height="20" aria-hidden="true"><rect x="2" y="1" width="26" height="18" fill="${PALETTE[c].fill}" stroke="${PALETTE[c].stroke}"/><rect x="5" y="7" width="20" height="4" fill="#fff" stroke="#d3d9e0"/><rect x="5" y="13" width="20" height="4" fill="#fff" stroke="#d3d9e0"/></svg>`,
    make: (color, x, y) => ({
      kind: 'grouped', x, y, label: 'Group name', color,
      children: [{ label: 'Row one' }, { label: 'Row two' }, { label: 'Row three' }],
    }),
  },
  {
    id: 'grouped+icons',
    section: 'Grouped', label: 'Grouped + icons', usesFill: true,
    chip: (c) => `<svg width="30" height="20" aria-hidden="true"><rect x="2" y="1" width="26" height="18" fill="${PALETTE[c].fill}" stroke="${PALETTE[c].stroke}"/><rect x="5" y="7" width="20" height="4" fill="#fff" stroke="#d3d9e0"/><rect x="5" y="13" width="20" height="4" fill="#fff" stroke="#d3d9e0"/></svg>`,
    make: (color, x, y) => ({
      kind: 'grouped', x, y, label: 'Group name', color,
      children: [
        { label: 'SaaS applications', icon: namedIcon('cloud') },
        { label: 'IaaS platforms', icon: namedIcon('server') },
        { label: 'Identity providers', icon: namedIcon('key') },
      ],
    }),
  },

  // Inline control — stadium.
  {
    id: 'inlineControl',
    section: 'Inline control', label: 'Inline control', usesFill: false,
    chip: () => `<svg width="30" height="20" aria-hidden="true"><rect x="2" y="4" width="26" height="12" rx="6" fill="#fff" stroke="#cdd4dc" stroke-width="1.2"/></svg>`,
    make: (_c, x, y) => ({ kind: 'inlineControl', x, y, label: 'WAF' }),
  },
  {
    id: 'inlineControl+icon',
    section: 'Inline control', label: 'Inline control + icon', usesFill: false,
    chip: () => `<svg width="30" height="20" aria-hidden="true"><rect x="2" y="4" width="26" height="12" rx="6" fill="#fff" stroke="#cdd4dc" stroke-width="1.2"/></svg>`,
    make: (_c, x, y) => ({ kind: 'inlineControl', x, y, label: 'WAF', icon: namedIcon('shield') }),
  },

  // Boundaries.
  {
    id: 'boundary:plain',
    section: 'Boundaries', label: 'Dashed boundary', usesFill: false,
    chip: () => `<svg width="30" height="20" aria-hidden="true"><rect x="1" y="2" width="28" height="16" fill="none" stroke="#a9b2bd" stroke-dasharray="4 3"/></svg>`,
    make: (_c, x, y) => ({ kind: 'boundary', x, y, w: 300, h: 200, label: 'Boundary name' }),
  },
  {
    id: 'boundary:filled',
    section: 'Boundaries', label: 'Filled region', usesFill: false,
    chip: () => `<svg width="30" height="20" aria-hidden="true"><rect x="1" y="2" width="28" height="16" fill="#f8f9fa" stroke="#a9b2bd" stroke-dasharray="4 3"/></svg>`,
    make: (_c, x, y) => ({ kind: 'boundary', x, y, w: 300, h: 200, label: 'Region name', filled: true }),
  },

  // Zone divider.
  {
    id: 'zoneDivider',
    section: 'Zones', label: 'Zone divider', usesFill: false,
    chip: () => `<svg width="30" height="20" aria-hidden="true"><line x1="15" y1="0" x2="15" y2="20" stroke="#a9b2bd" stroke-dasharray="4 3"/></svg>`,
    make: (_c, x, y) => ({ kind: 'zoneDivider', x, y1: y, y2: y + 300, label: 'Zone name' }),
  },

  // Actors.
  {
    id: 'actor:person',
    section: 'Actors', label: 'Single user', usesFill: false,
    chip: () => `<svg width="30" height="20" aria-hidden="true" viewBox="0 0 30 20"><g transform="translate(9,-1) scale(0.5)"><path d="${iconPath('person')}" fill="#263238"/></g></svg>`,
    make: (_c, x, y) => ({ kind: 'actor', cx: x, y, label: 'User', icon: namedIcon('person') }),
  },
  {
    id: 'actor:people',
    section: 'Actors', label: 'User group', usesFill: false,
    chip: () => `<svg width="30" height="20" aria-hidden="true" viewBox="0 0 30 20"><g transform="translate(9,-1) scale(0.5)"><path d="${iconPath('people')}" fill="#263238"/></g></svg>`,
    make: (_c, x, y) => ({ kind: 'actor', cx: x, y, label: 'Users', icon: namedIcon('people') }),
  },

  // Legend.
  {
    id: 'legend',
    section: 'Legend', label: 'Legend', usesFill: false,
    chip: () => `<svg width="30" height="20" aria-hidden="true"><rect x="2" y="3" width="26" height="14" fill="#fff" stroke="#e4e8ec" rx="3"/><rect x="5" y="7" width="6" height="4" fill="#e8f1fc" stroke="#a3c2ea"/><rect x="5" y="12" width="6" height="4" fill="#f4f6f8" stroke="#d3d9e0"/></svg>`,
    make: (_c, x, y) => ({ kind: 'legend', x, y, encoding: 'Encoding', rows: [['blue', 'Focal'], ['white', 'Default']] }),
  },
];

/** Rebuild an ItemDraft from a drag/drop spec + the current fill color. */
export function buildDraftFromSpec(specId: string, color: ColorName, x: number, y: number): ItemDraft | null {
  const entry = ENTRIES.find((e) => e.id === specId);
  return entry ? entry.make(color, x, y) : null;
}

const SECTIONS = ['Elements', 'Grouped', 'Inline control', 'Boundaries', 'Zones', 'Actors', 'Legend'] as const;

export function createPalette(container: HTMLElement, editor: Editor): () => void {
  container.classList.add('palette');
  let currentFill: ColorName = 'white';

  function render(state: EditorState): void {
    const allowed = allowedElementColors(state.doc.encoding);
    if (!allowed.has(currentFill)) currentFill = 'white';

    const html: string[] = [];

    // Fill picker — contextual to encoding.
    html.push('<h3>Fill for new elements</h3>');
    html.push('<div class="swatches">');
    for (const key of Object.keys(PALETTE) as ColorName[]) {
      if (!allowed.has(key)) continue;
      const s = PALETTE[key];
      const active = key === currentFill ? ' active' : '';
      html.push(
        `<button type="button" class="swatch${active}" data-fill="${key}" ` +
        `title="${key}" aria-label="${key}" ` +
        `style="background:${s.fill};border-color:${s.stroke}"></button>`
      );
    }
    html.push('</div>');
    html.push(`<p class="palette-hint muted">Encoding: <b>${state.doc.encoding ?? 'grayscale'}</b>. Palette is limited to colors valid for this encoding.</p>`);

    // Sections.
    for (const section of SECTIONS) {
      const entries = ENTRIES.filter((e) => e.section === section);
      if (entries.length === 0) continue;
      html.push(`<h3>${section}</h3>`);
      html.push('<div class="palette-list">');
      for (const e of entries) {
        const active = state.placing?.label === e.label ? ' active' : '';
        html.push(
          `<button type="button" class="palette-btn${active}" ` +
          `draggable="true" data-add="${e.id}">` +
          `<span class="palette-chip">${e.chip(currentFill)}</span>` +
          `<span class="palette-label">${e.label}</span>` +
          `</button>`
        );
      }
      html.push('</div>');
    }

    // Connect mode help.
    html.push('<h3>Connectors</h3>');
    html.push('<p class="palette-hint muted">Switch to <b>Connect</b>, click a source element, then a target.</p>');

    container.innerHTML = html.join('');
  }

  // Delegated event handlers survive re-renders.
  container.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const fillBtn = t.closest<HTMLButtonElement>('[data-fill]');
    if (fillBtn) {
      const c = fillBtn.dataset.fill as ColorName;
      const allowed = allowedElementColors(editor.getState().doc.encoding);
      if (!allowed.has(c)) return;
      currentFill = c;
      render(editor.getState());
      return;
    }
    const addBtn = t.closest<HTMLButtonElement>('[data-add]');
    if (addBtn) {
      const spec = addBtn.dataset.add!;
      const entry = ENTRIES.find((e) => e.id === spec);
      if (!entry) return;
      const state = editor.getState();
      const intent: PlacingIntent = {
        label: entry.label,
        factory: (x, y) => entry.make(entry.usesFill ? currentFill : 'white', x, y),
      };
      // Toggle: clicking the active entry again cancels.
      const same = state.placing?.label === entry.label;
      editor.dispatch({ kind: 'setPlacing', intent: same ? null : intent });
    }
  });

  container.addEventListener('dragstart', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-add]');
    if (!btn) return;
    // Transferable payload: spec id + fill color so the drop side can rebuild.
    const spec = btn.dataset.add!;
    const payload = JSON.stringify({ spec, color: currentFill });
    ev.dataTransfer?.setData('application/x-vdb-item', payload);
    ev.dataTransfer?.setData('text/plain', payload);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
    // Suppress the browser's default drag chip; the canvas renders a real
    // ghost on dragover instead.
    if (ev.dataTransfer) ev.dataTransfer.setDragImage(TRANSPARENT_PIXEL, 0, 0);
  });

  render(editor.getState());
  return editor.subscribe(render);
}
