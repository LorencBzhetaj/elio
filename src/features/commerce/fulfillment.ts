import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { auditLog, entitlements, orderItems, orders, paymentAttempts, paymentEvents } from '../../db/schema';
import type { PaymentState, VerifiedPayment } from '../payments/contract';
import { enqueueJob } from '../jobs/outbox';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';

export interface ProcessResult {
  outcome:
    | 'fulfilled'
    | 'already_paid'
    | 'state_recorded'
    | 'duplicate_event'
    | 'unknown_reference'
    | 'rejected_mismatch'
    | 'ignored_after_refund'
    | 'refunded';
  orderStatus?: OrderStatus;
  fulfilled: boolean;
}

/** Terminal-ish states that a late verified "paid" may still override (04, step 5). */
const PAYABLE_FROM: OrderStatus[] = ['pending', 'failed', 'cancelled', 'expired'];

/**
 * The single place where provider truth changes our state. Callers MUST pass a payment obtained via
 * an authenticated channel (provider API fetch or a callback verified with documented signatures).
 *
 * Guarantees (all inside one transaction with row locks + unique constraints):
 *  - exact provider reference, merchant reference (attempt id), amount, currency and mode must match;
 *  - repeated / concurrent / out-of-order events create at most ONE entitlement and ONE email job;
 *  - authorization alone never fulfils;
 *  - a refund is never reversed by a later "paid";
 *  - a late verified "paid" after cancel/fail is fulfilled once.
 */
export async function processVerifiedPayment(
  db: Db,
  payment: VerifiedPayment,
  meta: { dedupeKey: string; payloadHash: string; expectLivemode: boolean },
): Promise<ProcessResult> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentEvents)
      .values({
        provider: payment.provider,
        dedupeKey: meta.dedupeKey,
        providerReference: payment.providerReference,
        payloadHash: meta.payloadHash,
        verificationStatus: 'verified',
      })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });
    if (inserted.length === 0) return { outcome: 'duplicate_event', fulfilled: false };
    const eventId = inserted[0].id;
    const mark = (status: string, detail?: string) =>
      tx.update(paymentEvents).set({ verificationStatus: status, detail }).where(eq(paymentEvents.id, eventId));

    const [attempt] = await tx
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.provider, payment.provider), eq(paymentAttempts.providerReference, payment.providerReference)))
      .for('update');
    if (!attempt) {
      await mark('unknown_reference');
      return { outcome: 'unknown_reference', fulfilled: false };
    }

    const [order] = await tx.select().from(orders).where(eq(orders.id, attempt.orderId)).for('update');

    const mismatches: string[] = [];
    if (payment.merchantReference !== attempt.id) mismatches.push('merchant_reference');
    if (payment.amountMinor !== attempt.amountMinor || attempt.amountMinor !== order.totalMinor) mismatches.push('amount');
    if (payment.currency !== attempt.currency || attempt.currency !== order.currency) mismatches.push('currency');
    if (payment.livemode !== meta.expectLivemode || payment.livemode !== attempt.livemode) mismatches.push('mode');
    if (mismatches.length) {
      await mark('rejected_mismatch', mismatches.join(','));
      await tx.update(paymentAttempts).set({ status: 'needs_review', lastError: `mismatch: ${mismatches.join(',')}`, updatedAt: new Date() }).where(eq(paymentAttempts.id, attempt.id));
      await enqueueJob(tx, {
        uniqueKey: `owner-alert:mismatch:${attempt.id}`,
        type: 'owner-alert',
        payload: { kind: 'payment_mismatch', attemptId: attempt.id, orderReference: order.publicReference, fields: mismatches },
      });
      return { outcome: 'rejected_mismatch', orderStatus: order.status, fulfilled: false };
    }

    const now = new Date();
    const setAttempt = (status: PaymentState | 'needs_review') =>
      tx.update(paymentAttempts).set({ status, updatedAt: now }).where(eq(paymentAttempts.id, attempt.id));

    switch (payment.state) {
      case 'paid': {
        if (attempt.status === 'refunded' || order.status === 'refunded') {
          await mark('ignored_after_refund');
          return { outcome: 'ignored_after_refund', orderStatus: order.status, fulfilled: false };
        }
        await setAttempt('paid');
        if (order.status === 'paid') {
          if (attempt.status !== 'paid') {
            // A second attempt was also captured: flag for a manual refund. Never grant twice.
            await enqueueJob(tx, {
              uniqueKey: `owner-alert:double-payment:${attempt.id}`,
              type: 'owner-alert',
              payload: { kind: 'double_payment', attemptId: attempt.id, orderReference: order.publicReference },
            });
          }
          return { outcome: 'already_paid', orderStatus: 'paid', fulfilled: false };
        }
        if (!PAYABLE_FROM.includes(order.status)) {
          await mark('ignored_state', order.status);
          return { outcome: 'state_recorded', orderStatus: order.status, fulfilled: false };
        }
        await tx.update(orders).set({ status: 'paid', paidAt: now, updatedAt: now }).where(eq(orders.id, order.id));
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        for (const item of items) {
          await tx
            .insert(entitlements)
            .values({ orderItemId: item.id, productId: item.productId, buyerEmail: order.buyerEmail, status: 'active' })
            .onConflictDoNothing();
        }
        await enqueueJob(tx, {
          uniqueKey: `purchase-email:${order.id}`,
          type: 'purchase-email',
          payload: { orderId: order.id },
        });
        return { outcome: 'fulfilled', orderStatus: 'paid', fulfilled: true };
      }

      case 'authorized':
      case 'pending': {
        // Authorization alone is not fulfilment. Never move a finished attempt backwards.
        if (['created', 'creating', 'pending', 'authorized', 'needs_review'].includes(attempt.status)) await setAttempt(payment.state);
        return { outcome: 'state_recorded', orderStatus: order.status, fulfilled: false };
      }

      case 'failed':
      case 'cancelled':
      case 'expired': {
        if (attempt.status === 'paid' || attempt.status === 'refunded') {
          await mark('ignored_regression', `${attempt.status}->${payment.state}`);
          return { outcome: 'state_recorded', orderStatus: order.status, fulfilled: false };
        }
        await setAttempt(payment.state);
        if (order.status === 'pending') {
          await tx.update(orders).set({ status: payment.state, updatedAt: now }).where(eq(orders.id, order.id));
          return { outcome: 'state_recorded', orderStatus: payment.state, fulfilled: false };
        }
        return { outcome: 'state_recorded', orderStatus: order.status, fulfilled: false };
      }

      case 'refunded': {
        await setAttempt('refunded');
        if (order.status !== 'refunded') {
          await tx.update(orders).set({ status: 'refunded', updatedAt: now }).where(eq(orders.id, order.id));
        }
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        for (const item of items) {
          await tx
            .update(entitlements)
            .set({ status: 'revoked', revokedAt: now })
            .where(and(eq(entitlements.orderItemId, item.id), isNull(entitlements.revokedAt)));
        }
        await tx.insert(auditLog).values({
          actorEmail: 'system',
          action: 'refund_synced',
          targetType: 'order',
          targetId: order.id,
          details: { provider: payment.provider, attemptId: attempt.id },
        });
        return { outcome: 'refunded', orderStatus: 'refunded', fulfilled: false };
      }
    }
  });
}

/** Records a callback that could not be authenticated. Nothing else changes. */
export async function recordRejectedCallback(db: Db, provider: string, payloadHash: string, reason: string) {
  await db
    .insert(paymentEvents)
    .values({ provider, dedupeKey: `rejected:${payloadHash}`, payloadHash, verificationStatus: `rejected_${reason}`.slice(0, 40) })
    .onConflictDoNothing();
}
