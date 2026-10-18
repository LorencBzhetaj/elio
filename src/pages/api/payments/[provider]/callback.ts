import type { APIRoute } from 'astro';
import { getDb, getProvider, isLiveMode } from '../../../../features/services';
import { handleCallback } from '../../../../features/payments/reconcile';
import { deliverQueuedEmailsInDev } from '../../../../lib/dev-mail';

export const prerender = false;

const MAX_BODY = 64 * 1024;

/**
 * Provider webhook. Only the configured provider is accepted. The raw body is passed unchanged to the
 * adapter's documented verifier; unverifiable input is recorded and changes nothing.
 */
export const POST: APIRoute = async ({ params, request, url }) => {
  const db = await getDb();
  let provider;
  try {
    provider = await getProvider(db);
  } catch {
    return new Response('provider disabled', { status: 503 });
  }
  if (params.provider !== provider.id) return new Response('unknown provider', { status: 404 });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY) return new Response('too large', { status: 413 });

  try {
    const result = await handleCallback(db, provider, { rawBody, headers: request.headers, query: url.searchParams }, isLiveMode());
    await deliverQueuedEmailsInDev();
    return new Response(result.accepted ? 'ok' : 'rejected', { status: result.accepted ? 200 : 400 });
  } catch (err) {
    // Non-2xx lets the provider retry; reconciliation also covers lost callbacks.
    console.error('[callback] processing failed', (err as Error).message);
    return new Response('error', { status: 500 });
  }
};
