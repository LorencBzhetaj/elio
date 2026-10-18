import type { APIRoute } from 'astro';
import { isValidSignature, SIGNATURE_HEADER_NAME } from '@sanity/webhook';
import { serverEnv } from '../../../config/env';

export const prerender = false;

let lastTrigger = 0;
const DEBOUNCE_MS = 60_000;

/**
 * Sanity "on publish" webhook → triggers a rebuild through the hosting platform's deploy hook.
 * Signature verified with Sanity's official library. Rebuilds are debounced per instance; the host's
 * build pipeline keeps the previous deployment live if a build fails (see docs/deployment.md).
 */
export const POST: APIRoute = async ({ request }) => {
  const env = serverEnv();
  if (!env.SANITY_WEBHOOK_SECRET || !env.BUILD_HOOK_URL) return new Response('not configured', { status: 503 });
  const body = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER_NAME) ?? '';
  if (!signature || !(await isValidSignature(body, signature, env.SANITY_WEBHOOK_SECRET))) {
    return new Response('invalid signature', { status: 401 });
  }
  const now = Date.now();
  if (now - lastTrigger < DEBOUNCE_MS) return new Response('debounced', { status: 202 });
  lastTrigger = now;
  const res = await fetch(env.BUILD_HOOK_URL, { method: 'POST' });
  if (!res.ok) {
    console.error('[cms-hook] build hook failed', res.status);
    return new Response('build hook failed', { status: 502 });
  }
  return new Response('rebuild triggered', { status: 202 });
};
