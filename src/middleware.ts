import { defineMiddleware } from 'astro:middleware';
import { createHash, timingSafeEqual } from 'node:crypto';
import { loadDotEnvOnce } from './config/env';

const PRIVATE_PREFIXES = ['/checkout', '/order', '/access', '/my-guides', '/admin', '/mock-pay', '/api', '/preview'];
const NOINDEX_PREFIXES = [...PRIVATE_PREFIXES, '/search'];
const startsWithAny = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(p + '/'));

const digest = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/**
 * Preview routes are staging-only. With PREVIEW_ACCESS_KEY set, open /preview?key=… once to receive an
 * HttpOnly cookie. Without a key they are only reachable when APP_ENV is development or test.
 */
function previewAllowed(url: URL, cookieValue: string | undefined): 'allow' | 'deny' | 'set-cookie' {
  loadDotEnvOnce();
  const key = process.env.PREVIEW_ACCESS_KEY;
  const appEnv = process.env.APP_ENV ?? 'development';
  if (!key) return appEnv === 'development' || appEnv === 'test' ? 'allow' : 'deny';
  const given = url.searchParams.get('key');
  if (given && sameSecret(given, key)) return 'set-cookie';
  if (cookieValue && sameSecret(cookieValue, key)) return 'allow';
  return 'deny';
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  const path = url.pathname;

  if (!context.isPrerendered && startsWithAny(path, ['/preview'])) {
    const decision = previewAllowed(url, context.cookies.get('preview_key')?.value);
    if (decision === 'deny') return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
    if (decision === 'set-cookie') {
      context.cookies.set('preview_key', url.searchParams.get('key')!, {
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'lax',
        path: '/preview',
        maxAge: 60 * 60 * 24 * 14,
      });
      const clean = new URL(url);
      clean.searchParams.delete('key');
      return context.redirect(clean.pathname + clean.search, 303);
    }
  }

  const response = await next();

  // Prerendered pages get these headers from the host config (see docs/deployment.md).
  if (!context.isPrerendered) {
    const h = response.headers;
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    h.set('X-Frame-Options', 'SAMEORIGIN');
    h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (url.protocol === 'https:') h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (startsWithAny(path, PRIVATE_PREFIXES)) {
      h.set('Cache-Control', 'no-store, private');
    }
    if (startsWithAny(path, NOINDEX_PREFIXES)) h.set('X-Robots-Tag', 'noindex, nofollow');
    // Access links must never leak through the Referer header.
    if (path.startsWith('/access')) h.set('Referrer-Policy', 'no-referrer');
  }
  return response;
});
