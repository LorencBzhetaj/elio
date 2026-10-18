import { serverEnv } from '../config/env';

/**
 * Processes queued emails right away when no background worker exists:
 *  - local development with the console transport (PGlite allows only one process), and
 *  - Vercel/serverless, where there is no long-running worker (retries run from /api/cron/run).
 * On a server with `npm run worker`, the worker does this instead.
 */
export function shouldFlushInline(): boolean {
  const env = serverEnv();
  return Boolean(process.env.VERCEL) || (env.APP_ENV === 'development' && env.EMAIL_TRANSPORT === 'console');
}

export async function deliverQueuedEmailsInDev(): Promise<void> {
  if (!shouldFlushInline()) return;
  try {
    const [{ getDb }, { getJobHandlers }, { runOutboxOnce }] = await Promise.all([
      import('../db/client'),
      import('../features/services'),
      import('../features/jobs/outbox'),
    ]);
    await runOutboxOnce(await getDb(), await getJobHandlers());
  } catch (err) {
    console.warn('[outbox-inline] could not deliver queued emails', (err as Error).message);
  }
}
