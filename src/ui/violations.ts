import type { Editor, EditorState, EditorAction } from '../editorState';
import { validate, type Violation } from '../validate';

/**
 * Standing panel of §6.3 / §7.2 / §9 rule violations. This is the runtime
 * counterpart to render()'s build-time fit warnings — with one hard rule:
 * nothing mutates without an explicit user click.
 *
 * Each row shows the rule, the message, and (where available) an actionable
 * fix. Clicking the row's item names selects them so the user can see what
 * the panel is talking about on the canvas.
 */
export function createViolationsPanel(container: HTMLElement, editor: Editor): () => void {
  container.classList.add('violations');

  function render(state: EditorState): void {
    const violations = validate(state.doc);
    container.innerHTML = '';

    const header = document.createElement('h3');
    header.textContent = violations.length === 0
      ? 'Style checks — clean'
      : `Style checks — ${violations.length}`;
    container.appendChild(header);

    if (violations.length === 0) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'No violations of the checked rules.';
      container.appendChild(p);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'violations-list';
    for (const v of violations) list.appendChild(renderRow(v, editor));
    container.appendChild(list);
  }

  render(editor.getState());
  return editor.subscribe(render);
}

function renderRow(v: Violation, editor: Editor): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `violation ${v.severity}`;
  li.dataset.violationId = v.id;

  const head = document.createElement('div');
  head.className = 'violation-head';
  const sev = document.createElement('span');
  sev.className = 'violation-severity';
  sev.textContent = v.severity === 'error' ? 'error' : 'warn';
  const ref = document.createElement('span');
  ref.className = 'violation-ref';
  ref.textContent = v.ruleRef;
  head.append(sev, ref);
  li.appendChild(head);

  const msg = document.createElement('p');
  msg.className = 'violation-message';
  msg.textContent = v.message;
  li.appendChild(msg);

  if (v.itemIds.length > 0) {
    const focus = document.createElement('button');
    focus.type = 'button';
    focus.className = 'violation-focus';
    focus.textContent = v.itemIds.length === 1 ? 'Show item' : `Show ${v.itemIds.length} items`;
    focus.addEventListener('click', () => {
      editor.dispatch({ kind: 'select', ids: v.itemIds, mode: 'replace' });
    });
    li.appendChild(focus);
  }

  if (v.fix) {
    const fix = document.createElement('button');
    fix.type = 'button';
    fix.className = 'violation-fix';
    fix.textContent = v.fix.label;
    fix.addEventListener('click', () => {
      editor.dispatch(materializeFix(v.fix!.action, editor));
    });
    li.appendChild(fix);
  }

  return li;
}

/**
 * Some fix actions (notably "add legend") carry the sentinel '__PENDING__'
 * as an id because validate.ts doesn't have access to the editor's newId().
 * Swap it here at dispatch time.
 */
function materializeFix(action: EditorAction, editor: Editor): EditorAction {
  if (action.kind === 'add' && action.id === '__PENDING__') {
    return { ...action, id: editor.newId() };
  }
  return action;
}
