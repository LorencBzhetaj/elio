import type { APIRoute } from 'astro';

const DISALLOW = ['/preview', '/checkout', '/order', '/access', '/my-guides', '/admin', '/mock-pay', '/api', '/search', '/my-trip'];

export const GET: APIRoute = ({ site }) => {
  // Anything that is not production (local, staging, client previews) is closed to crawlers.
  if (process.env.APP_ENV !== 'production') {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const lines = ['User-agent: *', ...DISALLOW.map((p) => `Disallow: ${p}`)];
  if (site) lines.push('', `Sitemap: ${new URL('/sitemap-index.xml', site).href}`, `Sitemap: ${new URL('/sitemap-guides.xml', site).href}`);
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
