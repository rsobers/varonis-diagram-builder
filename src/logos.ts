/**
 * Vendor mark registry. Two tiers:
 *
 *  1. **Shipped**: `assets/logos/logos.json` + bundled asset files. These
 *     travel with the app and are always available.
 *  2. **Runtime**: marks fetched from logo.dev during the session, cached
 *     in memory as data URLs. They survive re-renders but not reloads;
 *     anything meant to ship is committed to `assets/logos/` with its
 *     source URL (per §8.5 and CLAUDE.md).
 *
 * The document stores logo IDs, not markup. Exports resolve IDs to URLs at
 * emission time (bundled data-URL for shipped marks, cached data-URL for
 * runtime marks), so exported SVGs stay self-contained regardless of tier.
 */
import manifest from '../assets/logos/logos.json';

const bundled = import.meta.glob('../assets/logos/*.{svg,webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export type LogoEntry = {
  id: string;
  name: string;
  file: string;
  aliases: string[];
  source: string;
  retrieved: string;
};

/** Shipped-tier registry (immutable at runtime). */
const SHIPPED: readonly LogoEntry[] = manifest;

/** Runtime-tier registry (mutable, session-scoped). */
type RuntimeEntry = LogoEntry & { dataUrl: string };
const runtime = new Map<string, RuntimeEntry>();
const listeners = new Set<() => void>();

function notify(): void { for (const fn of listeners) fn(); }
export function onLogosChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const LOGOS = new Proxy([] as readonly LogoEntry[], {
  // Snapshot both tiers on every access — small lists, cheap.
  get(_target, prop) {
    const all = [...SHIPPED, ...runtime.values()];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (all as any)[prop];
  },
});

export function findLogo(id: string): LogoEntry | undefined {
  return SHIPPED.find((l) => l.id === id) ?? runtime.get(id);
}

export function logoUrl(id: string): string | null {
  const rt = runtime.get(id);
  if (rt) return rt.dataUrl;
  const shipped = SHIPPED.find((l) => l.id === id);
  if (!shipped) return null;
  return (bundled[`../assets/logos/${shipped.file}`] as string | undefined) ?? null;
}

/** Case-insensitive search across shipped + runtime. */
export function searchLogos(query: string): LogoEntry[] {
  const q = query.trim().toLowerCase();
  const all: LogoEntry[] = [...SHIPPED, ...runtime.values()];
  if (!q) return all;
  return all.filter((l) =>
    l.id.toLowerCase().includes(q)
    || l.name.toLowerCase().includes(q)
    || l.aliases.some((a) => a.toLowerCase().includes(q))
  );
}

// ---- logo.dev integration ----------------------------------------------

/**
 * Fetch a vendor mark from logo.dev, cache it in the runtime registry,
 * return its entry. Idempotent per domain.
 *
 * logo.dev's publishable tokens are safe to embed in client URLs — the
 * token distinguishes your app for usage tracking. If VITE_LOGODEV_TOKEN
 * isn't set, this throws with a clear error.
 */
export async function fetchLogoFromDomain(rawDomain: string): Promise<LogoEntry> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error('Enter a vendor domain (e.g. aws.amazon.com).');
  const id = idFromDomain(domain);
  // Check by exact id (both tiers), then by alias — so a typed
  // "azure.com" resolves to the shipped "azure" entry instead of
  // fetching a duplicate.
  const stem = domain.split('.')[0] ?? domain;
  const existing =
    runtime.get(id) ??
    SHIPPED.find((l) => l.id === id) ??
    SHIPPED.find((l) => l.aliases.some((a) => a.toLowerCase() === domain || a.toLowerCase() === stem));
  if (existing) return existing;

  const token = import.meta.env['VITE_LOGODEV_TOKEN'] as string | undefined;
  if (!token) {
    throw new Error('VITE_LOGODEV_TOKEN not set. Add it to .env.local and restart the dev server.');
  }

  const url = `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(token)}&size=200&format=png`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`logo.dev returned ${resp.status} for ${domain}`);
  }
  const blob = await resp.blob();
  const dataUrl = await blobToDataUrl(blob);

  const entry: RuntimeEntry = {
    id, name: prettyName(domain), file: `${id}.png`,
    aliases: [domain, domain.split('.')[0] ?? domain],
    source: `https://img.logo.dev/${domain}`,
    retrieved: new Date().toISOString().slice(0, 10),
    dataUrl,
  };
  runtime.set(id, entry);
  notify();
  return entry;
}

function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}
function idFromDomain(domain: string): string {
  return domain.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function prettyName(domain: string): string {
  const stem = domain.split('.')[0] ?? domain;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Failed to read blob'));
    r.readAsDataURL(blob);
  });
}
