import type { APIRoute } from 'astro';
import { loadContent } from '../features/content/queries';

export const prerender = false;

/** Guide pages render on demand (live prices), so they are listed here instead of the build-time sitemap. */
export const GET: APIRoute = async ({ site }) => {
  const { guides } = await loadContent();
  const base = site ?? new URL('http://localhost:4321');
  const urls = guides.map((g) => `<url><loc>${new URL(`/guides/${g.slug}`, base).href}</loc><lastmod>${g.updatedAt.slice(0, 10)}</lastmod></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
