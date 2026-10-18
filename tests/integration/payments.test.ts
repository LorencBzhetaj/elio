import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/db/client';
import { entitlements, orders, outboxJobs, paymentAttempts, paymentEvents, mockProviderPayments } from '../../src/db/schema';
import { processVerifiedPayment } from '../../src/features/commerce/fulfillment';
import { applyFetchedPayment, handleCallback, reconcileAttempts, statusDedupeKey } from '../../src/features/payments/reconcile';
import type { PaymentProvider, VerifiedPayment } from '../../src/features/payments/contract';
import { checkoutFor, seedProducts, setupDb } from '../helpers';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDb());
  await seedProducts(db);
});
afterAll(() => close());

const meta = (p: VerifiedPayment) => ({ dedupeKey: statusDedupeKey(p), payloadHash: 'h', expectLivemode: false });
const countEnt = async (orderId: string) => {
  const rows = await db.select().from(entitlements).innerJoin(orders, eq(orders.buyerEmail, entitlements.buyerEmail)).where(eq(orders.id, orderId));
  return rows.length;
};
const jobsFor = async (orderId: string) => db.select().from(outboxJobs).where(eq(outboxJobs.uniqueKey, `purchase-email:${orderId}`));
const orderOf = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];

describe('verified payment processing', () => {
  it('concurrent duplicate paid callbacks produce exactly one entitlement and one email job', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'dup@example.com');
    await provider.simulate(ref, 'paid');
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => applyFetchedPayment(db, provider, ref, false)));
    expect(results.filter((r) => r.outcome === 'fulfilled')).toHaveLength(1);
    expect(await countEnt(order.orderId)).toBe(1);
    expect(await jobsFor(order.orderId)).toHaveLength(1);
    expect((await orderOf(order.orderId)).status).toBe('paid');
  });

  it('a forged callback (bad signature) changes nothing', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'forged@example.com');
    const body = JSON.stringify({ reference: ref, eventId: 'evt1', state: 'paid' });
    const res = await handleCallback(db, provider, { rawBody: body, headers: new Headers({ 'x-mock-signature': 'forged' }), query: new URLSearchParams() }, false);
    expect(res.accepted).toBe(false);
    expect((await orderOf(order.orderId)).status).toBe('pending');
    expect(await countEnt(order.orderId)).toBe(0);
  });

  it('a validly signed callback is only a trigger: status comes from the provider, not the payload', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'trigger@example.com');
    // Payload claims "paid" but the provider still says pending.
    const body = JSON.stringify({ reference: ref, eventId: 'evt-x', state: 'paid', amount: 1 });
    const res = await handleCallback(db, provider, { rawBody: body, headers: new Headers({ 'x-mock-signature': provider.signCallback(body) }), query: new URLSearchParams() }, false);
    expect(res.accepted).toBe(true);
    expect((await orderOf(order.orderId)).status).toBe('pending');
    await provider.simulate(ref, 'paid');
    await handleCallback(db, provider, { rawBody: body, headers: new Headers({ 'x-mock-signature': provider.signCallback(body) }), query: new URLSearchParams() }, false);
    expect((await orderOf(order.orderId)).status).toBe('paid');
  });

  it('amount mismatch yields no entitlement and an owner alert', async () => {
    const { order, ref } = await checkoutFor(db, 'amount@example.com');
    const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerReference, ref));
    const p: VerifiedPayment = { provider: 'mock', providerReference: ref, merchantReference: attempt.id, state: 'paid', amountMinor: 1, currency: 'USD', livemode: false };
    const r = await processVerifiedPayment(db, p, meta(p));
    expect(r.outcome).toBe('rejected_mismatch');
    expect(await countEnt(order.orderId)).toBe(0);
    const alerts = await db.select().from(outboxJobs).where(eq(outboxJobs.uniqueKey, `owner-alert:mismatch:${attempt.id}`));
    expect(alerts).toHaveLength(1);
  });

  it('currency, merchant reference and live/test mode mismatches yield no entitlement', async () => {
    for (const patch of [{ currency: 'EUR' }, { merchantReference: '00000000-0000-0000-0000-000000000000' }, { livemode: true }]) {
      const { order, ref } = await checkoutFor(db, `mm${Object.keys(patch)[0]}@example.com`);
      const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerReference, ref));
      const p: VerifiedPayment = { provider: 'mock', providerReference: ref, merchantReference: attempt.id, state: 'paid', amountMinor: 900, currency: 'USD', livemode: false, ...patch };
      const r = await processVerifiedPayment(db, p, meta(p));
      expect(r.outcome).toBe('rejected_mismatch');
      expect(await countEnt(order.orderId)).toBe(0);
    }
  });

  it('an unknown provider reference is recorded and ignored', async () => {
    const p: VerifiedPayment = { provider: 'mock', providerReference: 'mock_unknown', merchantReference: 'x', state: 'paid', amountMinor: 900, currency: 'USD', livemode: false };
    expect((await processVerifiedPayment(db, p, meta(p))).outcome).toBe('unknown_reference');
  });

  it('authorized but not captured does not fulfil', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'auth@example.com');
    await provider.simulate(ref, 'authorized');
    const r = await applyFetchedPayment(db, provider, ref, false);
    expect(r.fulfilled).toBe(false);
    expect((await orderOf(order.orderId)).status).toBe('pending');
    expect(await countEnt(order.orderId)).toBe(0);
  });

  it('a late verified paid after a browser cancel is fulfilled exactly once', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'late@example.com');
    await provider.simulate(ref, 'cancelled');
    await applyFetchedPayment(db, provider, ref, false);
    expect((await orderOf(order.orderId)).status).toBe('cancelled');
    await provider.simulate(ref, 'paid');
    const r1 = await applyFetchedPayment(db, provider, ref, false);
    const r2 = await applyFetchedPayment(db, provider, ref, false);
    expect(r1.outcome).toBe('fulfilled');
    expect(r2.outcome).toBe('duplicate_event');
    expect((await orderOf(order.orderId)).status).toBe('paid');
    expect(await countEnt(order.orderId)).toBe(1);
  });

  it('refunded cannot return to paid, and access is revoked', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'refund@example.com');
    await provider.simulate(ref, 'paid');
    await applyFetchedPayment(db, provider, ref, false);
    await provider.simulate(ref, 'refunded');
    expect((await applyFetchedPayment(db, provider, ref, false)).outcome).toBe('refunded');
    const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.providerReference, ref));
    // A stale "paid" notification with a new dedupe key arrives afterwards.
    const stale: VerifiedPayment = { provider: 'mock', providerReference: ref, merchantReference: attempt.id, state: 'paid', amountMinor: 900, currency: 'USD', livemode: false };
    const r = await processVerifiedPayment(db, stale, { dedupeKey: 'stale-paid-2', payloadHash: 'h2', expectLivemode: false });
    expect(r.outcome).toBe('ignored_after_refund');
    expect((await orderOf(order.orderId)).status).toBe('refunded');
    const ents = await db.select().from(entitlements).where(eq(entitlements.buyerEmail, 'refund@example.com'));
    expect(ents.every((e) => e.status === 'revoked')).toBe(true);
  });

  it('a full refund arriving before a duplicate paid event still wins', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'refund-first@example.com');
    await provider.simulate(ref, 'refunded');
    await applyFetchedPayment(db, provider, ref, false);
    await provider.simulate(ref, 'paid');
    const r = await applyFetchedPayment(db, provider, ref, false);
    expect(r.outcome).toBe('ignored_after_refund');
    expect(await countEnt(order.orderId)).toBe(0);
  });

  it('failed after paid does not undo the purchase', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'regress@example.com');
    await provider.simulate(ref, 'paid');
    await applyFetchedPayment(db, provider, ref, false);
    await provider.simulate(ref, 'failed');
    await applyFetchedPayment(db, provider, ref, false);
    expect((await orderOf(order.orderId)).status).toBe('paid');
  });
});

describe('reconciliation', () => {
  it('fulfils a payment whose callback was lost', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'lost-callback@example.com');
    await provider.simulate(ref, 'paid'); // no callback delivered
    const s = await reconcileAttempts(db, provider, { expectLivemode: false, olderThanMs: -1000 });
    expect(s.errors).toBe(0);
    expect((await orderOf(order.orderId)).status).toBe('paid');
  });

  it('survives a provider API outage without changing state', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'outage@example.com');
    await provider.simulate(ref, 'paid');
    const down: PaymentProvider = { ...provider, fetchPayment: async () => { throw new Error('503'); } };
    const s = await reconcileAttempts(db, down, { expectLivemode: false, olderThanMs: -1000 });
    expect(s.errors).toBeGreaterThan(0);
    expect((await orderOf(order.orderId)).status).toBe('pending');
    await reconcileAttempts(db, provider, { expectLivemode: false, olderThanMs: -1000 });
    expect((await orderOf(order.orderId)).status).toBe('paid');
  });

  it('daily pass picks up a late refund', async () => {
    const { provider, order, ref } = await checkoutFor(db, 'late-refund@example.com');
    await provider.simulate(ref, 'paid');
    await applyFetchedPayment(db, provider, ref, false);
    await db.update(mockProviderPayments).set({ state: 'refunded' }).where(eq(mockProviderPayments.providerReference, ref));
    await reconcileAttempts(db, provider, { expectLivemode: false, olderThanMs: -1000, includePaid: true });
    expect((await orderOf(order.orderId)).status).toBe('refunded');
  });

  it('records every processed status once', async () => {
    const events = await db.select().from(paymentEvents);
    const keys = events.map((e) => `${e.provider}:${e.dedupeKey}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
