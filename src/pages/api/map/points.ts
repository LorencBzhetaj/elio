import type { APIRoute } from 'astro';
import { loadContent } from '../../../features/content/queries';
import { buildMapItems } from '../../../features/map/data';

export const prerender = false;

/** Public map points (published content only). Same data as /map renders. */
export const GET: APIRoute = async () => {
  try {
    const items = buildMapItems(await loadContent());
    return Response.json({ items }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch (err) {
    console.error('[map] points failed', (err as Error).message);
    return Response.json({ error: 'map_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
