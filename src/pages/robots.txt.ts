import type { APIRoute } from 'astro';

const DISALLOW = ['/preview', '/checkout', '/order', '/access', '/my-guides', '/admin', '/mock-pay', '/api', '/search', '/my-trip'];

export const GET: APIRoute = ({ site }) => {
  const lines = ['User-agent: *', ...DISALLOW.map((p) => `Disallow: ${p}`)];
  if (site) lines.push('', `Sitemap: ${new URL('/sitemap-index.xml', site).href}`, `Sitemap: ${new URL('/sitemap-guides.xml', site).href}`);
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
