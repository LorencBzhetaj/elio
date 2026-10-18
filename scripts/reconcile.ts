/** One-shot reconciliation (e.g. from a cron job). `npm run reconcile -- --include-paid` for the daily pass. */
import { getDb, getProvider, isLiveMode } from '../src/features/services';
import { reconcileAttempts } from '../src/features/payments/reconcile';

const includePaid = process.argv.includes('--include-paid');
const db = await getDb();
const provider = await getProvider(db);
const summary = await reconcileAttempts(db, provider, { expectLivemode: isLiveMode(), includePaid, olderThanMs: includePaid ? 60 * 60_000 : 2 * 60_000, limit: 1000 });
console.info('[reconcile]', { includePaid, ...summary });
process.exit(summary.errors > 0 ? 2 : 0);
