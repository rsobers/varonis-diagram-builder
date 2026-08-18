/**
 * Editor UI preferences — panel widths today, whatever else is chrome
 * rather than diagram tomorrow.
 *
 * Deliberately *not* part of DiagramDoc: how wide someone likes their
 * inspector is a property of the person, not of the diagram, and it must
 * not travel with an exported or shared doc.
 *
 * Storage sits behind a tiny interface so tests can pass a fake and so a
 * real backend can replace localStorage later without touching callers.
 */

export type PrefsStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const PREFS_KEY = 'vdb.prefs.v1';

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 560;

export type Prefs = {
  leftWidth: number;
  rightWidth: number;
};

/** Matches the hand-tuned defaults the grid shipped with. */
export const DEFAULT_PREFS: Prefs = { leftWidth: 240, rightWidth: 300 };

/** Narrowest the canvas column may become before a panel stops growing. */
export const CENTER_MIN = 320;

export function clampSidebar(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_MIN;
  return Math.min(Math.max(Math.round(width), SIDEBAR_MIN), SIDEBAR_MAX);
}

/**
 * Largest this panel may grow to, given the opposite panel and the width
 * actually available. Without this a stored width from a wide monitor
 * could squeeze the canvas to nothing on a laptop. SIDEBAR_MIN always
 * wins over the viewport so the result stays a usable panel rather than
 * collapsing to a sliver on a very narrow window.
 */
export function maxSidebarWidth(viewportWidth: number, otherWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return SIDEBAR_MAX;
  const available = viewportWidth - clampSidebar(otherWidth) - CENTER_MIN;
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, available));
}

/**
 * Read prefs, falling back to defaults per-field. Anything unparseable or
 * out of range is repaired rather than thrown: a corrupt pref should never
 * be able to stop the editor from mounting.
 */
export function readPrefs(storage: PrefsStorage): Prefs {
  let raw: string | null = null;
  try { raw = storage.getItem(PREFS_KEY); } catch { return { ...DEFAULT_PREFS }; }
  if (!raw) return { ...DEFAULT_PREFS };

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ...DEFAULT_PREFS }; }
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFS };

  const obj = parsed as Record<string, unknown>;
  return {
    leftWidth: typeof obj['leftWidth'] === 'number'
      ? clampSidebar(obj['leftWidth']) : DEFAULT_PREFS.leftWidth,
    rightWidth: typeof obj['rightWidth'] === 'number'
      ? clampSidebar(obj['rightWidth']) : DEFAULT_PREFS.rightWidth,
  };
}

/** Persist prefs. A full storage quota is not worth breaking a drag over. */
export function writePrefs(storage: PrefsStorage, prefs: Prefs): void {
  const safe: Prefs = {
    leftWidth: clampSidebar(prefs.leftWidth),
    rightWidth: clampSidebar(prefs.rightWidth),
  };
  try { storage.setItem(PREFS_KEY, JSON.stringify(safe)); } catch { /* non-fatal */ }
}

/** localStorage, or an in-memory stand-in where it isn't available. */
export function defaultStorage(): PrefsStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* blocked by privacy settings — fall through */ }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => { mem.set(k, v); },
  };
}
