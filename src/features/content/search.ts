import type { ContentBundle, ImageRef } from './schemas';
import { normalize, tokens } from '../search/normalize';

/**
 * Public search over PUBLISHED editorial content only. The index is built from the CMS bundle; it never
 * touches the commerce database, so premium coordinates, private files and prices cannot appear.
 */
export type SearchKind = 'destination' | 'guide' | 'place' | 'article' | 'essential' | 'event';
/** Values of the "Content type" control. Articles include practical "essentials" pages. */
export type SearchTypeFilter = 'destination' | 'guide' | 'place' | 'article' | 'event';
export const SEARCH_TYPES: { id: SearchTypeFilter; label: string }[] = [
  { id: 'destination', label: 'Destinations' },
  { id: 'guide', label: 'Guides' },
  { id: 'place', label: 'Photo spots' },
  { id: 'article', label: 'Articles' },
  { id: 'event', label: 'Events' },
];
const CATEGORY: Record<SearchKind, string> = {
  destination: 'Destination',
  guide: 'Guide',
  place: 'Photo spot',
  article: 'Journal',
  essential: 'Essentials',
  event: 'Event',
};
const KIND_ORDER: SearchKind[] = ['destination', 'place', 'guide', 'article', 'essential', 'event'];

/** The ONLY fields a search result exposes (whitelisted, tested). */
export interface SearchResult {
  id: string;
  type: SearchKind;
  category: string;
  title: string;
  url: string;
  summary: string;
  image: { src?: string; alt: string; scene: ImageRef['scene'] };
  destination?: { slug: string; title: string };
}

export interface IndexEntry {
  result: SearchResult;
  names: string[]; // normalized title + aliases
  haystack: string; // normalized title, aliases, summary and descriptive fields
  regions: string[];
}

export function buildSearchIndex(c: ContentBundle): IndexEntry[] {
  const destBySlug = new Map(c.destinations.map((d) => [d.slug, d]));
  const destRef = (slug?: string) => {
    const d = slug ? destBySlug.get(slug) : undefined;
    return d ? { slug: d.slug, title: d.title } : undefined;
  };
  const regionsOf = (slugs: (string | undefined)[]) => [...new Set(slugs.map((s) => (s ? destBySlug.get(s)?.region : undefined)).filter(Boolean) as string[])];
  const img = (i: ImageRef) => ({ ...(i.src ? { src: i.src } : {}), alt: i.alt, scene: i.scene });

  const entry = (
    type: SearchKind,
    slugId: string,
    url: string,
    title: string,
    summary: string,
    image: ImageRef,
    extra: { aliases?: string[]; text?: string[]; destination?: SearchResult['destination']; regions?: string[] } = {},
  ): IndexEntry => ({
    result: { id: `${type}:${slugId}`, type, category: CATEGORY[type], title, url, summary, image: img(image), ...(extra.destination ? { destination: extra.destination } : {}) },
    names: [normalize(title), ...(extra.aliases ?? []).map(normalize)],
    haystack: normalize([title, ...(extra.aliases ?? []), summary, ...(extra.text ?? [])].join(' ')),
    regions: extra.regions ?? [],
  });

  return [
    ...c.destinations.map((d) =>
      entry('destination', d.slug, `/destinations/${d.slug}`, d.title, d.summary, d.cover, {
        aliases: d.aliases,
        text: [d.kicker, d.region, ...d.types, ...d.interests, ...d.highlights],
        regions: [d.region],
      }),
    ),
    ...c.places.map((p) =>
      entry('place', p.slug, `/photo-spots/${p.slug}`, p.title, p.summary, p.cover, {
        aliases: p.aliases,
        text: [p.kind.replace('-', ' ')],
        destination: destRef(p.destinationSlug),
        regions: regionsOf([p.destinationSlug]),
      }),
    ),
    ...c.guides.map((g) =>
      entry('guide', g.slug, `/guides/${g.slug}`, g.title, g.summary, g.cover, {
        text: [g.subtitle, ...g.contents.map((x) => x.title)],
        destination: g.destinationSlugs.length === 1 ? destRef(g.destinationSlugs[0]) : undefined,
        regions: regionsOf(g.destinationSlugs),
      }),
    ),
    ...c.articles.map((a) =>
      entry('article', a.slug, `/journal/${a.slug}`, a.title, a.summary, a.cover, {
        text: [a.category],
        destination: a.destinationSlugs.length === 1 ? destRef(a.destinationSlugs[0]) : undefined,
        regions: regionsOf(a.destinationSlugs),
      }),
    ),
    ...c.essentials.map((e) => entry('essential', e.slug, `/essentials/${e.slug}`, e.title, e.summary, { alt: e.title, scene: 'city', rights: 'placeholder' })),
    ...c.events.map((e) =>
      entry('event', e.slug, `/events#${e.slug}`, e.title, e.summary, destBySlug.get(e.destinationSlug ?? '')?.cover ?? { alt: e.title, scene: 'city', rights: 'placeholder' }, {
        text: [e.venue ?? ''],
        destination: destRef(e.destinationSlug),
        regions: regionsOf([e.destinationSlug]),
      }),
    ),
  ];
}

export interface SearchQuery {
  q: string;
  type?: SearchTypeFilter;
  region?: string;
}

/**
 * Tiered ranking:
 *   0 exact name (or alias) → 1 name starts with the query → 2 every term in the title/aliases
 *   → 3 every term somewhere in the content. Ties: destinations first, then alphabetical.
 */
export function rank(entry: IndexEntry, q: string, terms: string[]): number | null {
  if (entry.names.some((n) => n === q)) return 0;
  if (entry.names.some((n) => n.startsWith(q))) return 1;
  if (entry.names.some((n) => terms.every((t) => n.includes(t)))) return 2;
  if (terms.every((t) => entry.haystack.includes(t))) return 3;
  return null;
}

export const MIN_QUERY_LENGTH = 2;

export function search(index: IndexEntry[], query: SearchQuery, limit = 50): { total: number; results: SearchResult[] } {
  const q = normalize(query.q);
  if (q.replace(/\s/g, '').length < MIN_QUERY_LENGTH) return { total: 0, results: [] };
  const terms = tokens(query.q).slice(0, 8);
  const scored: { e: IndexEntry; tier: number }[] = [];
  for (const e of index) {
    if (query.type && !(e.result.type === query.type || (query.type === 'article' && e.result.type === 'essential'))) continue;
    if (query.region && !e.regions.includes(query.region)) continue;
    const tier = rank(e, q, terms);
    if (tier !== null) scored.push({ e, tier });
  }
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      KIND_ORDER.indexOf(a.e.result.type) - KIND_ORDER.indexOf(b.e.result.type) ||
      a.e.result.title.localeCompare(b.e.result.title),
  );
  return { total: scored.length, results: scored.slice(0, limit).map((s) => s.e.result) };
}

/** Region values that actually occur in the index (for the Filters panel). */
export function searchRegions(index: IndexEntry[]): string[] {
  return [...new Set(index.flatMap((e) => e.regions))].sort();
}

/** Shown when the field is empty: editor-picked destinations and searches. No usage statistics. */
export function suggestions(c: ContentBundle, index: IndexEntry[]) {
  const featured = new Set(c.destinations.filter((d) => d.featured).map((d) => `destination:${d.slug}`));
  return {
    destinations: index.filter((e) => featured.has(e.result.id)).map((e) => e.result).slice(0, 6),
    searches: c.settings.suggestedSearches.slice(0, 8),
  };
}
