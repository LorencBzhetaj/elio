import type { APIRoute } from 'astro';
import { serverEnv, getDb, getJobHandlers, getProvider, isLiveMode } from '../../../features/services';
import { runOutboxOnce } from '../../../features/jobs/outbox';
import { reconcileAttempts } from '../../../features/payments/reconcile';
import { safeEqual } from '../../../lib/crypto';

export const prerender = false;

/**
 * Scheduled maintenance for serverless hosting (no long-running worker): email retries and payment
 * reconciliation. Vercel Cron calls it with `Authorization: Bearer <CRON_SECRET>`; any external
 * scheduler can do the same. Disabled unless CRON_SECRET is set.
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response('Unauthorized', { status: 401 });

  const db = await getDb();
  const outbox = await runOutboxOnce(db, await getJobHandlers(), new Date(), 50);
  let reconcile: unknown = 'skipped';
  try {
    const provider = await getProvider(db);
    reconcile = await reconcileAttempts(db, provider, { expectLivemode: isLiveMode(), olderThanMs: 2 * 60_000 });
    // Once a day is enough for the refund pass; run it when called in the early-morning slot.
    if (new Date().getUTCHours() === 6) await reconcileAttempts(db, provider, { expectLivemode: isLiveMode(), includePaid: true, olderThanMs: 60 * 60_000, limit: 1000 });
  } catch (err) {
    reconcile = `error: ${(err as Error).message}`;
  }
  return Response.json({ outbox, reconcile }, { headers: { 'Cache-Control': 'no-store' } });
};
