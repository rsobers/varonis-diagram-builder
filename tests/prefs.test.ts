import { describe, it, expect } from 'vitest';
import {
  readPrefs, writePrefs, clampSidebar, maxSidebarWidth,
  DEFAULT_PREFS, PREFS_KEY, SIDEBAR_MIN, SIDEBAR_MAX, CENTER_MIN,
  type PrefsStorage,
} from '../src/prefs';

function fakeStorage(seed?: Record<string, string>): PrefsStorage & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}

describe('clampSidebar', () => {
  it('holds the panel between its bounds', () => {
    expect(clampSidebar(10)).toBe(SIDEBAR_MIN);
    expect(clampSidebar(9999)).toBe(SIDEBAR_MAX);
    expect(clampSidebar(300)).toBe(300);
  });

  it('rounds to whole pixels', () => {
    expect(clampSidebar(300.6)).toBe(301);
  });

  it('treats garbage as the minimum', () => {
    expect(clampSidebar(Number.NaN)).toBe(SIDEBAR_MIN);
  });
});

describe('maxSidebarWidth', () => {
  it('leaves the canvas at least CENTER_MIN on a narrow viewport', () => {
    const other = 240;
    const max = maxSidebarWidth(1000, other);
    expect(max).toBe(1000 - other - CENTER_MIN);
    expect(other + max + CENTER_MIN).toBeLessThanOrEqual(1000);
  });

  it('is capped by the fixed maximum on a wide viewport', () => {
    expect(maxSidebarWidth(4000, 240)).toBe(SIDEBAR_MAX);
  });

  it('never returns less than the minimum, however cramped', () => {
    expect(maxSidebarWidth(400, 300)).toBe(SIDEBAR_MIN);
  });
});

describe('readPrefs / writePrefs', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readPrefs(fakeStorage())).toEqual(DEFAULT_PREFS);
  });

  it('round-trips a written value', () => {
    const s = fakeStorage();
    writePrefs(s, { leftWidth: 320, rightWidth: 420 });
    expect(readPrefs(s)).toEqual({ leftWidth: 320, rightWidth: 420 });
  });

  it('clamps on write so nothing out of range is ever stored', () => {
    const s = fakeStorage();
    writePrefs(s, { leftWidth: 9999, rightWidth: 1 });
    expect(readPrefs(s)).toEqual({ leftWidth: SIDEBAR_MAX, rightWidth: SIDEBAR_MIN });
  });

  it('repairs corrupt JSON instead of throwing', () => {
    expect(readPrefs(fakeStorage({ [PREFS_KEY]: 'not json{' }))).toEqual(DEFAULT_PREFS);
  });

  it('repairs a non-object payload', () => {
    expect(readPrefs(fakeStorage({ [PREFS_KEY]: '42' }))).toEqual(DEFAULT_PREFS);
    expect(readPrefs(fakeStorage({ [PREFS_KEY]: 'null' }))).toEqual(DEFAULT_PREFS);
  });

  it('falls back per-field when only one width is present', () => {
    const stored = JSON.stringify({ leftWidth: 400 });
    expect(readPrefs(fakeStorage({ [PREFS_KEY]: stored }))).toEqual({
      leftWidth: 400,
      rightWidth: DEFAULT_PREFS.rightWidth,
    });
  });

  it('clamps an out-of-range stored value on read', () => {
    const stored = JSON.stringify({ leftWidth: 9999, rightWidth: -5 });
    expect(readPrefs(fakeStorage({ [PREFS_KEY]: stored }))).toEqual({
      leftWidth: SIDEBAR_MAX,
      rightWidth: SIDEBAR_MIN,
    });
  });

  it('survives a storage that throws (private mode, quota)', () => {
    const hostile: PrefsStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(readPrefs(hostile)).toEqual(DEFAULT_PREFS);
    expect(() => writePrefs(hostile, DEFAULT_PREFS)).not.toThrow();
  });
});
