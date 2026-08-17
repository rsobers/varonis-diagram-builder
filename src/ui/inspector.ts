import type { Editor, EditorState } from '../editorState';
import type { Item, Element, Grouped, InlineControl, Boundary, ZoneDivider, Actor, Connector, Legend, Caption } from '../model';
import { ICON_KIT, ICON_NAMES, namedIcon, type IconRef } from '../icons';
import { LOGOS, logoUrl, findLogo } from '../logos';
import { PALETTE, type ColorName } from '../tokens';
import { allowedElementColors } from '../validate';

/**
 * Per-kind edit form for the currently selected item. Rebuilds on selection
 * change; input widgets commit on `change` (blur/Enter) rather than every
 * keypress so focus survives the surrounding state churn.
 *
 * Icon picker is a grid of all icons per §7 — matches the prototype.
 */
export function createInspector(container: HTMLElement, editor: Editor): () => void {
  container.classList.add('inspector');

  function refresh(state: EditorState): void {
    container.innerHTML = '';

    const first = [...state.selection][0];
    if (!first) {
      heading(container, 'Inspector');
      muted(container, 'Select an item to edit, or drag a shape from the palette to place one.');
      return;
    }
    const item = state.doc.items.find((i) => i.id === first);
    if (!item) {
      heading(container, 'Inspector');
      muted(container, '(Selected item was removed.)');
      return;
    }
    heading(container, kindLabel(item));

    const form = document.createElement('form');
    form.className = 'inspector-form';
    form.addEventListener('submit', (e) => e.preventDefault());
    container.appendChild(form);

    renderKind(form, item, state, editor);

    // Multi-select notice.
    if (state.selection.size > 1) {
      muted(container, `+${state.selection.size - 1} more selected — showing the first.`);
    }

    // Delete button (except for M0/M1 fixture-only kinds where deletion via
    // keyboard is fine but we still expose it here for consistency).
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'inspector-delete';
    del.textContent = `Delete ${kindLabel(item).toLowerCase()}`;
    del.addEventListener('click', () => {
      editor.dispatch({ kind: 'delete', ids: [item.id] });
    });
    container.appendChild(del);
  }

  refresh(editor.getState());
  return editor.subscribe(refresh);
}

// ---- per-kind rendering -------------------------------------------------

function renderKind(form: HTMLFormElement, item: Item, state: EditorState, editor: Editor): void {
  const id = item.id;
  const ed = editor;

  switch (item.kind) {
    case 'element':        return renderElement(form, item, state, ed);
    case 'grouped':        return renderGrouped(form, item, state, ed);
    case 'inlineControl':  return renderInlineControl(form, item, ed);
    case 'boundary':       return renderBoundary(form, item, state, ed);
    case 'zoneDivider':    return renderZoneDivider(form, item, ed);
    case 'actor':          return renderActor(form, item, ed);
    case 'connector':      return renderConnector(form, item, ed);
    case 'legend':         return renderLegend(form, item, ed);
    case 'caption':        return renderCaption(form, item, ed);
    case 'edge':
    case 'connectorLabel':
      muted(form, `'${item.kind}' items are edited via connect mode; select the connector instead.`);
      return;
    default: {
      const _exhaustive: never = item;
      void _exhaustive; void id;
      return;
    }
  }
}

function renderElement(form: HTMLFormElement, item: Element, state: EditorState, ed: Editor): void {
  textArea(form, 'Label', item.label, (v) => update(ed, item.id, { label: v }));
  text(form, 'Second line', item.sub ?? '', (v) => update(ed, item.id, { sub: v === '' ? undefined : v }));
  select(form, 'Size', item.size ?? 'sm', ['sm', 'md', 'lg'], (v) => update(ed, item.id, { size: v as 'sm' | 'md' | 'lg' }));
  colorPicker(form, 'Fill', item.color ?? 'white', state.doc.encoding, (c) => update(ed, item.id, { color: c }));
  // §8.2 — Icon or Mark are mutually exclusive; the reducer enforces that
  // picking one clears the other. Marks are only valid on white/gray fills.
  iconGrid(form, item.icon, (icon) => update(ed, item.id, { icon }));
  markPicker(form, item.markId, item.color ?? 'white', (id) => update(ed, item.id, { markId: id }));
  if (item.markId) {
    // Style toggle only makes sense while a mark is set.
    select(form, 'Mark style', item.markStyle ?? 'inline', ['inline', 'badge'],
      (v) => update(ed, item.id, { markStyle: v as 'inline' | 'badge' }));
  }
  numberPair(form, 'x', 'y', item.x, item.y,
    (x) => update(ed, item.id, { x }),
    (y) => update(ed, item.id, { y }));
}

function renderGrouped(form: HTMLFormElement, item: Grouped, state: EditorState, ed: Editor): void {
  textArea(form, 'Label', item.label, (v) => update(ed, item.id, { label: v }));
  colorPicker(form, 'Fill', item.color ?? 'white', state.doc.encoding, (c) => update(ed, item.id, { color: c }));
  numberPair(form, 'x', 'y', item.x, item.y,
    (x) => update(ed, item.id, { x }),
    (y) => update(ed, item.id, { y }));

  // Children rows.
  const section = document.createElement('div');
  section.className = 'inspector-section';
  const h = document.createElement('h4');
  h.textContent = 'Rows';
  section.appendChild(h);

  item.children.forEach((child, index) => {
    const row = document.createElement('div');
    row.className = 'grouped-row';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = child.label;
    labelInput.addEventListener('change', () => {
      ed.dispatch({ kind: 'updateGroupChild', id: item.id, index, patch: { label: labelInput.value } });
    });
    const iconSel = document.createElement('select');
    iconSel.className = 'grouped-row-icon';
    const currentName = child.icon?.name;
    iconSel.append(makeOption('', currentName ? '(named)' : '(no icon)', !currentName));
    for (const name of ICON_NAMES) {
      iconSel.append(makeOption(name, name, currentName === name));
    }
    iconSel.addEventListener('change', () => {
      const v = iconSel.value;
      ed.dispatch({
        kind: 'updateGroupChild', id: item.id, index,
        patch: { icon: v === '' ? undefined : namedIcon(v) },
      });
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'grouped-row-del';
    del.textContent = '−';
    del.title = 'Remove row';
    del.addEventListener('click', () => {
      ed.dispatch({ kind: 'removeGroupChild', id: item.id, index });
    });
    row.append(labelInput, iconSel, del);
    section.appendChild(row);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'grouped-add';
  add.textContent = '+ Add row';
  add.addEventListener('click', () => {
    ed.dispatch({ kind: 'addGroupChild', id: item.id, child: { label: 'Row' } });
  });
  section.appendChild(add);
  form.appendChild(section);

  void state; // encoding used only for colorPicker above
}

function renderInlineControl(form: HTMLFormElement, item: InlineControl, ed: Editor): void {
  text(form, 'Label', item.label, (v) => update(ed, item.id, { label: v }));
  iconGrid(form, item.icon, (icon) => update(ed, item.id, { icon }));
  numberPair(form, 'x', 'y', item.x, item.y,
    (x) => update(ed, item.id, { x }),
    (y) => update(ed, item.id, { y }));
}

function renderBoundary(form: HTMLFormElement, item: Boundary, state: EditorState, ed: Editor): void {
  text(form, 'Label', item.label, (v) => update(ed, item.id, { label: v }));
  // v2.3: fill is derived from nesting depth per §3.4 — no user toggle.
  select(form, 'Label side', item.labelSide ?? 'left', ['left', 'right'], (v) => update(ed, item.id, { labelSide: v as 'left' | 'right' }));

  // Tint is only valid under State encoding per §3.4.
  if (state.doc.encoding === 'state') {
    select(form, 'Tint (State encoding)', item.tint ?? '',
      ['', 'red', 'amber', 'green'],
      (v) => update(ed, item.id, { tint: v === '' ? undefined : (v as ColorName) })
    );
  }
  // §8.3 — Boundaries can carry a vendor mark badge (top-right corner).
  markPicker(form, item.markId, 'white', (id) => update(ed, item.id, { markId: id }));
  numberPair(form, 'x', 'y', item.x, item.y,
    (x) => update(ed, item.id, { x }),
    (y) => update(ed, item.id, { y }));
  numberPair(form, 'width', 'height', item.w, item.h,
    (w) => update(ed, item.id, { w: Math.max(60, w) }),
    (h) => update(ed, item.id, { h: Math.max(40, h) }));
}

function renderZoneDivider(form: HTMLFormElement, item: ZoneDivider, ed: Editor): void {
  text(form, 'Label', item.label, (v) => update(ed, item.id, { label: v }));
  numberField(form, 'x', item.x, (v) => update(ed, item.id, { x: v }));
  numberPair(form, 'y1', 'y2', item.y1, item.y2,
    (y1) => update(ed, item.id, { y1 }),
    (y2) => update(ed, item.id, { y2 }));
}

function renderActor(form: HTMLFormElement, item: Actor, ed: Editor): void {
  text(form, 'Label', item.label, (v) => update(ed, item.id, { label: v }));
  iconGrid(form, item.icon, (icon) => update(ed, item.id, { icon }));
  numberPair(form, 'cx', 'y', item.cx, item.y,
    (cx) => update(ed, item.id, { cx }),
    (y) => update(ed, item.id, { y }));
}

function renderConnector(form: HTMLFormElement, item: Connector, ed: Editor): void {
  textArea(form, 'Label (UPPERCASE)', item.label ?? '', (v) => update(ed, item.id, { label: v === '' ? undefined : v }));
  text(form, 'Optional text', item.optional ?? '', (v) => update(ed, item.id, { optional: v === '' ? undefined : v }));
  text(form, 'Number badge', item.num ?? '', (v) => update(ed, item.id, { num: v === '' ? undefined : v }));
  select(form, 'Routing', item.routing ?? 'straight', ['straight', 'elbow'],
    (v) => update(ed, item.id, { routing: v as 'straight' | 'elbow' }));
  select(form, 'Arrows', item.arrows ?? 'target', ['target', 'none', 'source', 'both'],
    (v) => update(ed, item.id, { arrows: v as 'none' | 'target' | 'source' | 'both' }));
  checkbox(form, 'Dashed (special use case)', !!item.dashed, (v) => update(ed, item.id, { dashed: v }));

  const reverse = document.createElement('button');
  reverse.type = 'button';
  reverse.className = 'inspector-secondary';
  reverse.textContent = 'Reverse direction';
  reverse.addEventListener('click', () => {
    ed.dispatch({ kind: 'reverseConnector', id: item.id });
  });
  form.appendChild(reverse);
}

function renderLegend(form: HTMLFormElement, item: Legend, ed: Editor): void {
  text(form, 'Encoding label', item.encoding, (v) => update(ed, item.id, { encoding: v }));
  numberPair(form, 'x', 'y', item.x, item.y,
    (x) => update(ed, item.id, { x }),
    (y) => update(ed, item.id, { y }));

  const section = document.createElement('div');
  section.className = 'inspector-section';
  const h = document.createElement('h4');
  h.textContent = 'Rows';
  section.appendChild(h);

  item.rows.forEach(([color, label], index) => {
    const row = document.createElement('div');
    row.className = 'grouped-row';
    const colorSel = document.createElement('select');
    for (const key of Object.keys(PALETTE) as ColorName[]) {
      colorSel.append(makeOption(key, key, color === key));
    }
    colorSel.addEventListener('change', () => {
      const rows: Legend['rows'] = item.rows.map((r, i) =>
        i === index ? [colorSel.value as ColorName, r[1]] : r
      );
      update(ed, item.id, { rows });
    });
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = label;
    labelInput.addEventListener('change', () => {
      const rows: Legend['rows'] = item.rows.map((r, i) =>
        i === index ? [r[0], labelInput.value] : r
      );
      update(ed, item.id, { rows });
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'grouped-row-del';
    del.textContent = '−';
    del.title = 'Remove row';
    del.addEventListener('click', () => {
      const rows = item.rows.filter((_, i) => i !== index);
      update(ed, item.id, { rows });
    });
    row.append(colorSel, labelInput, del);
    section.appendChild(row);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'grouped-add';
  add.textContent = '+ Add row';
  add.addEventListener('click', () => {
    update(ed, item.id, { rows: [...item.rows, ['white' as ColorName, 'New row']] });
  });
  section.appendChild(add);
  form.appendChild(section);
}

function renderCaption(form: HTMLFormElement, item: Caption, ed: Editor): void {
  text(form, 'Text', item.text, (v) => update(ed, item.id, { text: v }));
  numberPair(form, 'x', 'y', item.x, item.y,
    (x) => update(ed, item.id, { x }),
    (y) => update(ed, item.id, { y }));
}

// ---- widgets ------------------------------------------------------------

function heading(parent: HTMLElement, text: string): void {
  const h = document.createElement('h3');
  h.textContent = text;
  parent.appendChild(h);
}
function muted(parent: HTMLElement, text: string): void {
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = text;
  parent.appendChild(p);
}
function labelWrap(parent: HTMLElement, label: string, control: HTMLElement): void {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(span, control);
  parent.appendChild(wrap);
}
function text(parent: HTMLElement, label: string, value: string, on: (v: string) => void): void {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => on(input.value));
  labelWrap(parent, label, input);
}
function textArea(parent: HTMLElement, label: string, value: string, on: (v: string) => void): void {
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.rows = 2;
  ta.addEventListener('change', () => on(ta.value));
  labelWrap(parent, label, ta);
}
function numberField(parent: HTMLElement, label: string, value: number, on: (v: number) => void): void {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.step = '1';
  input.addEventListener('change', () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) on(n);
  });
  labelWrap(parent, label, input);
}
function numberPair(parent: HTMLElement, l1: string, l2: string, v1: number, v2: number, on1: (v: number) => void, on2: (v: number) => void): void {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = `${l1} / ${l2}`;
  const pair = document.createElement('div');
  pair.className = 'field-pair';
  const a = document.createElement('input');
  a.type = 'number'; a.value = String(v1); a.step = '1';
  a.addEventListener('change', () => { const n = Number(a.value); if (Number.isFinite(n)) on1(n); });
  const b = document.createElement('input');
  b.type = 'number'; b.value = String(v2); b.step = '1';
  b.addEventListener('change', () => { const n = Number(b.value); if (Number.isFinite(n)) on2(n); });
  pair.append(a, b);
  wrap.append(span, pair);
  parent.appendChild(wrap);
}
function select(parent: HTMLElement, label: string, value: string, options: string[], on: (v: string) => void): void {
  const sel = document.createElement('select');
  for (const opt of options) sel.appendChild(makeOption(opt, opt === '' ? '(none)' : opt, opt === value));
  sel.addEventListener('change', () => on(sel.value));
  labelWrap(parent, label, sel);
}
function checkbox(parent: HTMLElement, label: string, checked: boolean, on: (v: boolean) => void): void {
  const wrap = document.createElement('label');
  wrap.className = 'field-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => on(input.checked));
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(input, span);
  parent.appendChild(wrap);
}
function makeOption(value: string, label: string, selected: boolean): HTMLOptionElement {
  const o = document.createElement('option');
  o.value = value; o.textContent = label;
  if (selected) o.selected = true;
  return o;
}

function colorPicker(parent: HTMLElement, label: string, value: ColorName, encoding: EditorState['doc']['encoding'], on: (c: ColorName) => void): void {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  const row = document.createElement('div');
  row.className = 'swatches';
  const allowed = allowedElementColors(encoding);
  for (const key of Object.keys(PALETTE) as ColorName[]) {
    if (!allowed.has(key)) continue;
    const s = PALETTE[key];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch' + (value === key ? ' active' : '');
    btn.title = key;
    btn.setAttribute('aria-label', key);
    btn.style.background = s.fill;
    btn.style.borderColor = s.stroke;
    btn.addEventListener('click', () => on(key));
    row.appendChild(btn);
  }
  wrap.append(span, row);
  parent.appendChild(wrap);
}

/**
 * Icon picker with search + curated kit + custom-path fallback. Selection
 * dispatches an IconRef ({ path, name? }) so the picked path is baked into
 * the model. Exports stay self-contained: an icon rendered now won't drift
 * later if a name-referenced source is redefined upstream.
 */
function iconGrid(parent: HTMLElement, current: IconRef | undefined, on: (icon: IconRef | undefined) => void): void {
  const wrap = document.createElement('div');
  wrap.className = 'field icon-picker';

  const header = document.createElement('div');
  header.className = 'icon-picker-head';
  const span = document.createElement('span');
  span.textContent = 'Icon';
  const status = document.createElement('span');
  status.className = 'icon-picker-current muted';
  status.textContent = current
    ? current.name ? `Current: ${current.name}` : 'Current: (custom)'
    : 'Current: none';
  header.append(span, status);
  wrap.appendChild(header);

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search the kit…';
  search.className = 'icon-picker-search';
  wrap.appendChild(search);

  const grid = document.createElement('div');
  grid.className = 'icon-grid';
  wrap.appendChild(grid);

  function paint(filter: string): void {
    grid.innerHTML = '';
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'icon-cell' + (current ? '' : ' active');
    none.title = 'No icon';
    none.setAttribute('aria-label', 'No icon');
    none.innerHTML = `<svg width="16" height="16" aria-hidden="true"><path d="M3 3 L13 13 M13 3 L3 13" stroke="#8c98a6" fill="none"/></svg>`;
    none.addEventListener('click', () => on(undefined));
    grid.appendChild(none);

    const q = filter.trim().toLowerCase();
    for (const name of ICON_NAMES) {
      if (q && !name.toLowerCase().includes(q)) continue;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'icon-cell' + (current?.name === name ? ' active' : '');
      cell.title = name;
      cell.setAttribute('aria-label', name);
      cell.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_KIT[name]}" fill="#263238"/></svg>`;
      cell.addEventListener('click', () => on(namedIcon(name)));
      grid.appendChild(cell);
    }
  }
  search.addEventListener('input', () => paint(search.value));
  paint('');

  // Custom SVG path — for anything outside the curated kit. The picker
  // stores the raw path so exports remain self-contained even for
  // one-off icons.
  const customLabel = document.createElement('label');
  customLabel.className = 'field icon-picker-custom';
  const cSpan = document.createElement('span');
  cSpan.textContent = 'Custom SVG path (Material Symbols variant Wt200/Gr200/Op24 recommended per §7.3)';
  const cInput = document.createElement('input');
  cInput.type = 'text';
  cInput.placeholder = 'e.g. M12 1L3 5v6…';
  cInput.addEventListener('change', () => {
    const v = cInput.value.trim();
    if (!v) return;
    on({ path: v });
    cInput.value = '';
  });
  customLabel.append(cSpan, cInput);
  wrap.appendChild(customLabel);

  parent.appendChild(wrap);
}

function update(editor: Editor, id: string, patch: Record<string, unknown>): void {
  editor.dispatch({ kind: 'update', id, patch });
}

/**
 * Vendor-mark picker. Grid of registered marks + a "None" option. Blocked
 * with an explanation when the item's color is not white/gray (§8.2).
 */
function markPicker(parent: HTMLElement, current: string | undefined, color: string, on: (id: string | undefined) => void): void {
  const wrap = document.createElement('div');
  wrap.className = 'field mark-picker';

  const header = document.createElement('div');
  header.className = 'mark-picker-head';
  const span = document.createElement('span');
  span.textContent = 'Vendor mark';
  const status = document.createElement('span');
  status.className = 'mark-picker-current muted';
  status.textContent = current
    ? `Current: ${findLogo(current)?.name ?? current}`
    : 'Current: none';
  header.append(span, status);
  wrap.appendChild(header);

  const allowedFill = color === 'white' || color === 'gray';
  if (!allowedFill) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.style.fontSize = '11px';
    note.textContent = `Marks only sit on white or gray fills (§8.2). Change the fill to add a mark.`;
    wrap.appendChild(note);
    parent.appendChild(wrap);
    return;
  }

  if (LOGOS.length === 0) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.style.fontSize = '11px';
    note.textContent = 'No vendor marks in the registry — see assets/logos/README.md.';
    wrap.appendChild(note);
    parent.appendChild(wrap);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'icon-grid';

  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'icon-cell' + (current ? '' : ' active');
  none.title = 'No mark';
  none.setAttribute('aria-label', 'No mark');
  none.innerHTML = `<svg width="16" height="16" aria-hidden="true"><path d="M3 3 L13 13 M13 3 L3 13" stroke="#8c98a6" fill="none"/></svg>`;
  none.addEventListener('click', () => on(undefined));
  grid.appendChild(none);

  for (const l of LOGOS) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'icon-cell' + (current === l.id ? ' active' : '');
    cell.title = l.name;
    cell.setAttribute('aria-label', l.name);
    const url = logoUrl(l.id) ?? '';
    cell.innerHTML = `<img alt="" src="${url}" width="16" height="16" style="display:block">`;
    cell.addEventListener('click', () => on(l.id));
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  parent.appendChild(wrap);
}

function kindLabel(item: Item): string {
  switch (item.kind) {
    case 'element':        return 'Element';
    case 'grouped':        return 'Grouped element';
    case 'inlineControl':  return 'Inline control';
    case 'boundary':       return 'Boundary';
    case 'zoneDivider':    return 'Zone divider';
    case 'actor':          return 'Actor';
    case 'connector':      return 'Connector';
    case 'legend':         return 'Legend';
    case 'caption':        return 'Caption';
    case 'edge':           return 'Edge';
    case 'connectorLabel': return 'Connector label';
  }
}
