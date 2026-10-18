import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/db/client';
import { orders, paymentAttempts, orderItems } from '../../src/db/schema';
import { canViewOrder, createOrder, createRetryAttempt, startCheckout } from '../../src/features/commerce/orders';
import { CommerceError } from '../../src/features/commerce/errors';
import { AmbiguousProviderResultError, type PaymentProvider } from '../../src/features/payments/contract';
import { idem, mockProvider, seedProducts, setupDb, SITE } from '../helpers';

let db: Db;
let close: () => Promise<void>;
const opts = { provider: 'mock', livemode: false };

beforeAll(async () => {
  ({ db, close } = await setupDb());
  await seedProducts(db);
});
afterAll(() => close());

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof CommerceError ? e.code : String(e);
  }
};

describe('createOrder', () => {
  it('takes the price from the database, never from input', async () => {
    const input = { productSlug: 'theth-guide', email: 'Buyer@Example.com ', idempotencyKey: idem(), termsAccepted: true, amountMinor: 1, priceMinor: 1 };
    const r = await createOrder(db, input as never, opts);
    const [order] = await db.select().from(orders).where(eq(orders.id, r.orderId));
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, r.orderId));
    expect(order.totalMinor).toBe(900);
    expect(item.amountMinor).toBe(900);
    expect(order.buyerEmail).toBe('buyer@example.com');
    expect(order.status).toBe('pending');
  });

  it('rejects inactive or unknown products', async () => {
    expect(await code(createOrder(db, { productSlug: 'retired-guide', email: 'a@example.com', idempotencyKey: idem(), termsAccepted: true }, opts))).toBe('product_unavailable');
    expect(await code(createOrder(db, { productSlug: 'nope', email: 'a@example.com', idempotencyKey: idem(), termsAccepted: true }, opts))).toBe('product_unavailable');
  });

  it('rejects invalid email and missing terms', async () => {
    expect(await code(createOrder(db, { productSlug: 'theth-guide', email: 'not-an-email', idempotencyKey: idem(), termsAccepted: true }, opts))).toBe('invalid_email');
    expect(await code(createOrder(db, { productSlug: 'theth-guide', email: 'a@example.com', idempotencyKey: idem(), termsAccepted: false }, opts))).toBe('terms_required');
  });

  it('returns the same order for a repeated idempotency key', async () => {
    const key = idem();
    const a = await createOrder(db, { productSlug: 'theth-guide', email: 'r@example.com', idempotencyKey: key, termsAccepted: true }, opts);
    const b = await createOrder(db, { productSlug: 'theth-guide', email: 'r@example.com', idempotencyKey: key, termsAccepted: true }, opts);
    expect(b.orderId).toBe(a.orderId);
    expect(b.replayed).toBe(true);
    expect(b.viewerSecret).toBeNull();
    const all = await db.select().from(orders).where(eq(orders.idempotencyKey, key));
    expect(all).toHaveLength(1);
  });

  it('refuses a reused idempotency key with different details', async () => {
    const key = idem();
    await createOrder(db, { productSlug: 'theth-guide', email: 'x@example.com', idempotencyKey: key, termsAccepted: true }, opts);
    expect(await code(createOrder(db, { productSlug: 'albania-explorer', email: 'x@example.com', idempotencyKey: key, termsAccepted: true }, opts))).toBe('idempotency_conflict');
  });
});

describe('startCheckout', () => {
  it('persists the provider reference before redirect and is not re-created twice', async () => {
    const provider = mockProvider(db);
    const o = await createOrder(db, { productSlug: 'theth-guide', email: 'c@example.com', idempotencyKey: idem(), termsAccepted: true }, opts);
    const first = await startCheckout(db, provider, o.attemptId, { siteUrl: SITE });
    const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, o.attemptId));
    expect(attempt.providerReference).toMatch(/^mock_/);
    expect(attempt.status).toBe('pending');
    const again = await startCheckout(db, provider, o.attemptId, { siteUrl: SITE });
    expect(again.checkoutUrl).toBe(first.checkoutUrl);
  });

  it('parks an ambiguous provider timeout for review instead of retrying blindly', async () => {
    const timeoutProvider: PaymentProvider = {
      ...mockProvider(db),
      id: 'mock',
      createCheckout: async () => {
        throw new AmbiguousProviderResultError('timeout after request was sent');
      },
    };
    const o = await createOrder(db, { productSlug: 'theth-guide', email: 't@example.com', idempotencyKey: idem(), termsAccepted: true }, opts);
    expect(await code(startCheckout(db, timeoutProvider, o.attemptId, { siteUrl: SITE }))).toBe('provider_unavailable');
    const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, o.attemptId));
    expect(attempt.status).toBe('needs_review');
    // A retry attempt is refused while the ambiguous one is unresolved.
    expect(await code(createRetryAttempt(db, o.orderId, opts))).toBe('checkout_in_progress');
  });

  it('allows a second attempt only after the first is final', async () => {
    const provider = mockProvider(db);
    const o = await createOrder(db, { productSlug: 'theth-guide', email: 'two@example.com', idempotencyKey: idem(), termsAccepted: true }, opts);
    await startCheckout(db, provider, o.attemptId, { siteUrl: SITE });
    expect(await code(createRetryAttempt(db, o.orderId, opts))).toBe('checkout_in_progress');
    await db.update(paymentAttempts).set({ status: 'failed' }).where(eq(paymentAttempts.id, o.attemptId));
    const second = await createRetryAttempt(db, o.orderId, opts);
    expect(second).not.toBe(o.attemptId);
    const [a2] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, second));
    expect(a2.idempotencyKey).toBe(`${o.orderId}:2`);
  });
});

describe('order viewing', () => {
  it('requires the viewer cookie or a session for the buyer — the reference alone is not enough', async () => {
    const o = await createOrder(db, { productSlug: 'theth-guide', email: 'v@example.com', idempotencyKey: idem(), termsAccepted: true }, opts);
    const [order] = await db.select().from(orders).where(eq(orders.id, o.orderId));
    expect(canViewOrder(order, {})).toBe(false);
    expect(canViewOrder(order, { cookieSecret: 'wrong' })).toBe(false);
    expect(canViewOrder(order, { sessionEmail: 'someone@else.com' })).toBe(false);
    expect(canViewOrder(order, { cookieSecret: o.viewerSecret! })).toBe(true);
    expect(canViewOrder(order, { sessionEmail: 'v@example.com' })).toBe(true);
  });
});
