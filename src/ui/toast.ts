/**
 * Live-region toast. Mount once in the app shell; every `toast(msg)` call
 * updates the same aria-live region so assistive tech announces the message
 * politely, and the same DOM element handles visual fade.
 *
 * Persistent-UI cues (mode indicators, pending-item rings) live elsewhere —
 * toasts are for transient feedback that the user can miss without harm.
 */
export type ToastFn = (msg: string) => void;

export function createToast(container: HTMLElement): ToastFn {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  container.appendChild(el);

  let hideT: ReturnType<typeof setTimeout> | null = null;
  return function toast(msg: string): void {
    el.textContent = msg;
    el.classList.add('show');
    if (hideT) clearTimeout(hideT);
    hideT = setTimeout(() => el.classList.remove('show'), 2600);
  };
}
