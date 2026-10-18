import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/db/client';
import { orders, outboxJobs } from '../../src/db/schema';
import { runOutboxOnce, enqueueJob } from '../../src/features/jobs/outbox';
import { createJobHandlers } from '../../src/features/jobs/handlers';
import { createMemoryTransport } from '../../src/features/jobs/email';
import { applyFetchedPayment } from '../../src/features/payments/reconcile';
import { redeemAccessToken } from '../../src/features/access/tokens';
import { authorizeAsset } from '../../src/features/access/downloads';
import { checkoutFor, seedProducts, setupDb, SITE } from '../helpers';

let db: Db;
let close: () => Promise<void>;
let seeded: Awaited<ReturnType<typeof seedProducts>>;

beforeAll(async () => {
  ({ db, close } = await setupDb());
  seeded = await seedProducts(db);
});
afterAll(() => close());

const later = (min: number) => new Date(Date.now() + min * 60_000);

describe('purchase email via outbox', () => {
  it('sends an access link that works once; the outbox never stores the raw link', async () => {
    const transport = createMemoryTransport();
    const handlers = createJobHandlers({ db, transport, siteUrl: SITE, brand: 'Test', accessTtlMinutes: 15 });
    const { provider, order, ref } = await checkoutFor(db, 'mail@example.com');
    await provider.simulate(ref, 'paid');
    await applyFetchedPayment(db, provider, ref, false);

    const [job] = await db.select().from(outboxJobs).where(eq(outboxJobs.uniqueKey, `purchase-email:${order.orderId}`));
    expect(JSON.stringify(job.payload)).not.toMatch(/token|redeem/);

    const r = await runOutboxOnce(db, handlers);
    expect(r.done).toBeGreaterThanOrEqual(1);
    const mail = transport.sent.find((m) => m.to === 'mail@example.com')!;
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail.text)![1];
    expect(await redeemAccessToken(db, token)).toEqual({ email: 'mail@example.com', role: 'buyer' });
    expect(await redeemAccessToken(db, token)).toBeNull();
  });

  it('email outage: retries with backoff, paid state and access are unaffected, exhaustion alerts the owner', async () => {
    const transport = createMemoryTransport();
    const handlers = createJobHandlers({ db, transport, siteUrl: SITE, brand: 'Test', accessTtlMinutes: 15, ownerEmail: 'owner@example.com' });
    // Clear earlier jobs.
    await runOutboxOnce(db, createJobHandlers({ db, transport: createMemoryTransport(), siteUrl: SITE, brand: 'T', accessTtlMinutes: 15 }), later(0), 100);

    const { provider, order, ref } = await checkoutFor(db, 'outage@example.com');
    await provider.simulate(ref, 'paid');
    await applyFetchedPayment(db, provider, ref, false);

    transport.failNext = 100;
    const key = `purchase-email:${order.orderId}`;
    let t = 0;
    for (let i = 0; i < 6; i++) {
      await runOutboxOnce(db, handlers, later(t));
      t += 60 * 8; // jump past any backoff
    }
    const [job] = await db.select().from(outboxJobs).where(eq(outboxJobs.uniqueKey, key));
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(6);

    const [o] = await db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(o.status).toBe('paid');
    expect((await authorizeAsset(db, 'outage@example.com', seeded.thethPdf.id)).ok).toBe(true);

    const [alert] = await db.select().from(outboxJobs).where(eq(outboxJobs.uniqueKey, `owner-alert:job-failed:${job.id}`));
    expect(alert).toBeTruthy();
    transport.failNext = 0;
    await runOutboxOnce(db, handlers, later(t + 1));
    expect(transport.sent.some((m) => m.to === 'owner@example.com')).toBe(true);
  });

  it('does not send a purchase email for an order refunded before sending', async () => {
    const transport = createMemoryTransport();
    const handlers = createJobHandlers({ db, transport, siteUrl: SITE, brand: 'Test', accessTtlMinutes: 15 });
    const { provider, ref } = await checkoutFor(db, 'refund-before-mail@example.com');
    await provider.simulate(ref, 'paid');
    await applyFetchedPayment(db, provider, ref, false);
    await provider.simulate(ref, 'refunded');
    await applyFetchedPayment(db, provider, ref, false);
    await runOutboxOnce(db, handlers, later(10_000), 100);
    expect(transport.sent.some((m) => m.to === 'refund-before-mail@example.com')).toBe(false);
  });

  it('enqueue is idempotent by unique key', async () => {
    await enqueueJob(db, { uniqueKey: 'k-1', type: 'owner-alert', payload: { kind: 'x' } });
    await enqueueJob(db, { uniqueKey: 'k-1', type: 'owner-alert', payload: { kind: 'x' } });
    expect(await db.select().from(outboxJobs).where(eq(outboxJobs.uniqueKey, 'k-1'))).toHaveLength(1);
  });
});
