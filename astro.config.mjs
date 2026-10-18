// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';

const site = process.env.SITE_URL || 'http://localhost:4321';

// Private, transactional and preview routes never go in the sitemap.
const PRIVATE_PREFIXES = [
  '/preview', '/checkout', '/order', '/access', '/my-guides', '/admin', '/mock-pay', '/api', '/search', '/my-trip',
];

export default defineConfig({
  site,
  adapter: node({ mode: 'standalone' }),
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
    server: {
      // The dev server would otherwise serve any project file by path. Private guides and the
      // embedded dev database must never be reachable that way.
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/storage/**', '**/.data/**'] },
      // Local DB and dev emails change at runtime; they must not trigger reloads.
      watch: { ignored: ['**/.data/**', '**/storage/**'] },
    },
  },
});
