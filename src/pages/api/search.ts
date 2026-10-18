import type { APIRoute } from 'astro';
import { loadContent } from '../../features/content/queries';
import { buildSearchIndex, search, searchRegions, suggestions, SEARCH_TYPES, type SearchTypeFilter } from '../../features/content/search';
import { regions } from '../../features/content/schemas';

export const prerender = false;

/** loadContent() caches the bundle for 60 s; rebuild the index only when that bundle changes. */
const indexes = new WeakMap<object, ReturnType<typeof buildSearchIndex>>();
async function getIndex() {
  const content = await loadContent();
  let index = indexes.get(content);
  if (!index) indexes.set(content, (index = buildSearchIndex(content)));
  return { index, content };
}

/** GET /api/search?q=&type=&region=&limit= — public content only, cacheable. */
export const GET: APIRoute = async ({ url }) => {
  try {
    const { index, content } = await getIndex();
    const q = (url.searchParams.get('q') ?? '').slice(0, 100);
    const typeParam = url.searchParams.get('type');
    const type = SEARCH_TYPES.find((t) => t.id === typeParam)?.id as SearchTypeFilter | undefined;
    const region = regions.find((r) => r === url.searchParams.get('region'));
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 50);
    const body = q.trim()
      ? { query: q, ...search(index, { q, type, region }, limit), regions: searchRegions(index) }
      : { query: '', total: 0, results: [], regions: searchRegions(index), suggestions: suggestions(content, index) };
    return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch (err) {
    console.error('[search] failed', (err as Error).message);
    return Response.json({ error: 'search_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
