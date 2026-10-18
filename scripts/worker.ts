/**
 * Background worker: outbox emails (every 15 s), pending-payment reconciliation (every 5 min) and a
 * daily reconciliation of paid attempts to catch late refunds. Run one or more instances:
 *   npm run worker
 */
import { getDb, getJobHandlers, getProvider, isLiveMode } from '../src/features/services';
import { runOutboxOnce } from '../src/features/jobs/outbox';
import { reconcileAttempts } from '../src/features/payments/reconcile';

const db = await getDb();
const handlers = await getJobHandlers();
let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

let lastPending = 0;
let lastDaily = 0;
console.info('[worker] started');
while (!stopping) {
  try {
    const r = await runOutboxOnce(db, handlers);
    if (r.claimed) console.info('[worker] outbox', r);
  } catch (err) {
    console.error('[worker] outbox error', (err as Error).message);
  }
  const now = Date.now();
  if (now - lastPending > 5 * 60_000) {
    lastPending = now;
    try {
      const provider = await getProvider(db);
      const s = await reconcileAttempts(db, provider, { expectLivemode: isLiveMode(), olderThanMs: 2 * 60_000 });
      if (s.checked) console.info('[worker] reconcile pending', s);
    } catch (err) {
      console.error('[worker] reconcile error', (err as Error).message);
    }
  }
  if (now - lastDaily > 24 * 60 * 60_000) {
    lastDaily = now;
    try {
      const provider = await getProvider(db);
      const s = await reconcileAttempts(db, provider, { expectLivemode: isLiveMode(), includePaid: true, olderThanMs: 60 * 60_000, limit: 1000 });
      console.info('[worker] daily reconcile', s);
    } catch (err) {
      console.error('[worker] daily reconcile error', (err as Error).message);
    }
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
console.info('[worker] stopped');
process.exit(0);
