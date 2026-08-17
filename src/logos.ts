/**
 * Vendor mark registry. Manifest is `assets/logos/logos.json`; each entry
 * references a bundled asset file. Marks are IDs in the document (not raw
 * markup) so that if a vendor rebrands and we replace the file in the
 * registry, existing diagrams stay current — the opposite of the icon
 * picker, which stores the SVG path because icons come from Google's full
 * remote library.
 *
 * On export the exporter is responsible for inlining the resolved URL as
 * a data URL so exported SVGs remain self-contained.
 */
import manifest from '../assets/logos/logos.json';

// Vite bundles every file in the folder; small files inline as data URLs,
// larger files get a hashed asset URL.
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

export const LOGOS: readonly LogoEntry[] = manifest;

/**
 * URL for a logo's file — bundled asset URL. For small files Vite inlines
 * as a data URL, which is exactly what we want for self-contained exports.
 */
export function logoUrl(id: string): string | null {
  const entry = LOGOS.find((l) => l.id === id);
  if (!entry) return null;
  return (bundled[`../assets/logos/${entry.file}`] as string | undefined) ?? null;
}

export function findLogo(id: string): LogoEntry | undefined {
  return LOGOS.find((l) => l.id === id);
}

/** Case-insensitive search over id, name, and aliases. */
export function searchLogos(query: string): LogoEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...LOGOS];
  return LOGOS.filter((l) =>
    l.id.toLowerCase().includes(q)
    || l.name.toLowerCase().includes(q)
    || l.aliases.some((a) => a.toLowerCase().includes(q))
  );
}
