import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { paymentAttempts } from '../../db/schema';
import { sha256 } from '../../lib/crypto';
import { processVerifiedPayment, recordRejectedCallback, type ProcessResult } from '../commerce/fulfillment';
import type { PaymentProvider, RawCallback, VerifiedPayment } from './contract';

/** Status-based dedupe: callbacks and reconciliation converge on the same key for the same truth. */
export const statusDedupeKey = (p: VerifiedPayment) => `status:${p.providerReference}:${p.state}`;

export async function applyFetchedPayment(db: Db, provider: PaymentProvider, providerReference: string, expectLivemode: boolean): Promise<ProcessResult> {
  const payment = await provider.fetchPayment(providerReference);
  if (payment.provider !== provider.id || payment.providerReference !== providerReference) {
    throw new Error('Provider returned a different payment than requested');
  }
  return processVerifiedPayment(db, payment, {
    dedupeKey: statusDedupeKey(payment),
    payloadHash: sha256(JSON.stringify(payment)),
    expectLivemode,
  });
}

/** Handles an incoming provider callback. Unverifiable input changes nothing. */
export async function handleCallback(db: Db, provider: PaymentProvider, raw: RawCallback, expectLivemode: boolean) {
  const result = await provider.verifyAndNormalizeCallback(raw);
  if (result.kind === 'rejected') {
    await recordRejectedCallback(db, provider.id, result.payloadHash, result.reason);
    return { accepted: false as const, reason: result.reason };
  }
  if (result.kind === 'verified') {
    const outcome = await processVerifiedPayment(db, result.payment, {
      dedupeKey: statusDedupeKey(result.payment),
      payloadHash: result.payloadHash,
      expectLivemode,
    });
    return { accepted: true as const, outcome };
  }
  // Trigger: fetch authoritative status through the authenticated provider API.
  const outcome = await applyFetchedPayment(db, provider, result.providerReference, expectLivemode);
  return { accepted: true as const, outcome };
}

/**
 * Re-checks attempts that are not final (run every 5 minutes), and — with `includePaid` — paid attempts
 * to catch late refunds (run daily). Provider outages are counted, not fatal.
 */
export async function reconcileAttempts(
  db: Db,
  provider: PaymentProvider,
  opts: { expectLivemode: boolean; olderThanMs?: number; includePaid?: boolean; now?: Date; limit?: number },
) {
  const now = opts.now ?? new Date();
  const statuses: ('pending' | 'authorized' | 'paid')[] = opts.includePaid ? ['pending', 'authorized', 'paid'] : ['pending', 'authorized'];
  const rows = await db
    .select({ ref: paymentAttempts.providerReference })
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.provider, provider.id),
        isNotNull(paymentAttempts.providerReference),
        inArray(paymentAttempts.status, statuses),
        lte(paymentAttempts.updatedAt, new Date(now.getTime() - (opts.olderThanMs ?? 60_000))),
      ),
    )
    .limit(opts.limit ?? 200);

  const summary = { checked: 0, changed: 0, errors: 0 };
  for (const { ref } of rows) {
    summary.checked++;
    try {
      const r = await applyFetchedPayment(db, provider, ref!, opts.expectLivemode);
      if (r.outcome !== 'duplicate_event') summary.changed++;
    } catch (err) {
      summary.errors++;
      console.warn('[reconcile] provider status fetch failed', { ref: ref?.slice(0, 12), error: (err as Error).message });
    }
  }
  return summary;
}
