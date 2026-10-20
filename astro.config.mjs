// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

/** On Vercel (VERCEL=1 during builds) use the Vercel adapter; everywhere else the standalone Node server. */
const onVercel = Boolean(process.env.VERCEL);
const vercelUrl =
  process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_URL;
const site = process.env.SITE_URL || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:4321');

// Private, transactional and preview routes never go in the sitemap.
const PRIVATE_PREFIXES = [
  '/preview', '/checkout', '/order', '/access', '/my-guides', '/admin', '/mock-pay', '/api', '/search', '/my-trip',
];

export default defineConfig({
  site,
  adapter: onVercel ? vercel() : node({ mode: 'standalone' }),
  // Public content pages are prerendered by default; commerce/private pages opt out with `prerender = false`.
  output: 'static',
  trailingSlash: 'never',
  security: { checkOrigin: true },
  // Keep client previews clean (the dev toolbar would overlay the page).
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      filter: (page) => !PRIVATE_PREFIXES.some((p) => new URL(page).pathname.startsWith(p)),
    }),
  ],
  image: { responsiveStyles: true },
  vite: {
    // MapLibre is imported lazily; pre-bundle it at dev-server start so Vite never re-optimises it
    // mid-session ("Outdated Optimize Dep" errors). Production builds are unaffected.
    optimizeDeps: { include: ['maplibre-gl'] },
    server: {
      // The dev server would otherwise serve any project file by path. Private guides and the
      // embedded dev database must never be reachable that way.
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/storage/**', '**/.data/**'] },
      // Local DB and dev emails change at runtime; they must not trigger reloads.
      watch: { ignored: ['**/.data/**', '**/storage/**', '**/.vercel/**', '**/dist/**'] },
    },
  },
});
