import type { ContentBundle } from './schemas';

export type SearchType = 'destination' | 'essential' | 'article' | 'place' | 'event' | 'guide';

/** The ONLY fields a search result may expose. Built from public content; never from the commerce DB. */
export interface SearchResult {
  type: SearchType;
  title: string;
  summary: string;
  url: string;
}

interface IndexEntry extends SearchResult {
  haystack: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // "Gjirokastër" matches "gjirokaster"
    .replace(/\s+/g, ' ')
    .trim();

export function buildSearchIndex(c: ContentBundle): IndexEntry[] {
  const entry = (type: SearchType, url: string, title: string, summary: string, extra: string[] = []): IndexEntry => ({
    type, url, title, summary, haystack: norm([title, summary, ...extra].join(' ')),
  });
  return [
    ...c.destinations.map((d) => entry('destination', `/destinations/${d.slug}`, d.title, d.summary, [d.kicker, d.region, ...d.types, ...d.interests, ...d.highlights])),
    ...c.essentials.map((e) => entry('essential', `/essentials/${e.slug}`, e.title, e.summary)),
    ...c.articles.map((a) => entry('article', `/journal/${a.slug}`, a.title, a.summary, [a.category])),
    ...c.places.map((p) => entry('place', `/photo-spots/${p.slug}`, p.title, p.summary, [p.kind])),
    ...c.events.map((e) => entry('event', `/events#${e.slug}`, e.title, e.summary, [e.venue ?? ''])),
    ...c.guides.map((g) => entry('guide', `/guides/${g.slug}`, g.title, g.summary, [g.subtitle])),
  ];
}

export function search(index: IndexEntry[], query: string, type?: SearchType, limit = 30): SearchResult[] {
  const terms = norm(query).split(' ').filter((t) => t.length > 0).slice(0, 8);
  if (terms.length === 0) return [];
  return index
    .filter((e) => (!type || e.type === type) && terms.every((t) => e.haystack.includes(t)))
    .map((e) => ({ e, score: terms.reduce((s, t) => s + (norm(e.title).includes(t) ? 3 : 1), 0) }))
    .sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title))
    .slice(0, limit)
    .map(({ e }) => ({ type: e.type, title: e.title, summary: e.summary, url: e.url }));
}
