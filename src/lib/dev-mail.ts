import { serverEnv } from '../config/env';

/**
 * Local development only: process queued emails immediately, so sign-in and access links work without
 * running `npm run worker` (with the embedded PGlite database only one process can open it).
 * Staging/production always use the worker.
 */
export async function deliverQueuedEmailsInDev(): Promise<void> {
  const env = serverEnv();
  if (env.APP_ENV !== 'development' || env.EMAIL_TRANSPORT !== 'console') return;
  try {
    const [{ getDb }, { getJobHandlers }, { runOutboxOnce }] = await Promise.all([
      import('../db/client'),
      import('../features/services'),
      import('../features/jobs/outbox'),
    ]);
    await runOutboxOnce(await getDb(), await getJobHandlers());
  } catch (err) {
    console.warn('[dev-mail] could not deliver queued emails', (err as Error).message);
  }
}
