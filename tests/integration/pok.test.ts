import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/db/client';
import { entitlements, orders, outboxJobs, paymentAttempts, productAssets, products } from '../../src/db/schema';
import { createOrder, startCheckout } from '../../src/features/commerce/orders';
import { handleCallback, reconcileAttempts, applyFetchedPayment } from '../../src/features/payments/reconcile';
import { createPokProvider, fromPokAmount, mapPokState, toPokAmount, POK_STAGING_BASE_URL } from '../../src/features/payments/pok';
import { authorizeAsset } from '../../src/features/access/downloads';
import { CommerceError } from '../../src/features/commerce/errors';
import { idem, setupDb, SITE } from '../helpers';

/**
 * A fake POK staging API that follows the documented request/response shapes (login, create order,
 * retrieve order). Tests then change the remote order to simulate what the hosted payment page does.
 */
const MERCHANT = '2f6c1c4e-0000-4000-8000-00000000abcd';
function fakePok() {
  const remote = new Map<string, any>();
  const calls: string[] = [];
  let createMode: 'ok' | 'timeout' | '500' | '400' = 'ok';
  let n = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = url.replace(POK_STAGING_BASE_URL, '');
    calls.push(`${init.method} ${path}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (path === '/auth/sdk/login') {
      const body = JSON.parse(String(init.body));
      if (body.keySecret !== 'test-secret') return json(401, { statusCode: 401, message: 'Invalid credentials' });
      return json(200, { data: { accessToken: 'tok', expiresAt: new Date(Date.now() + 600_000).toISOString() } });
    }
    if ((init.headers as Record<string, string>).authorization !== 'Bearer tok') return json(401, { message: 'Token expired' });
    if (init.method === 'POST' && path === `/merchants/${MERCHANT}/sdk-orders`) {
      if (createMode === 'timeout') throw new DOMException('timed out', 'TimeoutError');
      if (createMode === '500') return json(500, { message: 'boom' });
      if (createMode === '400') return json(400, { message: 'bad request' });
      const body = JSON.parse(String(init.body));
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      const order = {
        id,
        amount: body.amount,
        capturedAmount: 0,
        currencyCode: body.currencyCode,
        originalCurrencyCode: body.currencyCode,
        merchantCustomReference: body.merchantCustomReference,
        isCompleted: false,
        isCaptured: false,
        isCanceled: false,
        isRefunded: false,
        expiresAt: new Date(Date.now() + body.expiresAfterMinutes * 60_000).toISOString(),
        merchant: { id: MERCHANT },
        webhookUrl: body.webhookUrl,
        _self: { confirmUrl: `https://pay-staging.pokpay.io/sdk-orders/${id}` },
      };
      remote.set(id, order);
      return json(200, { data: { sdkOrder: order } });
    }
    const m = path.match(new RegExp(`^/merchants/${MERCHANT}/sdk-orders/([0-9a-f-]{36})$`));
    if (init.method === 'GET' && m) {
      const o = remote.get(m[1]);
      return o ? json(200, { data: { sdkOrder: o } }) : json(404, { message: 'SDK order not found' });
    }
    return json(404, { message: 'not found' });
  }) as unknown as typeof fetch;
  const provider = createPokProvider({ baseUrl: POK_STAGING_BASE_URL, merchantId: MERCHANT, keyId: 'kid', keySecret: 'test-secret', fetchImpl });
  return {
    provider,
    remote,
    calls,
    setCreateMode: (m: typeof createMode) => (createMode = m),
    /** What POK does when the buyer pays on the hosted page (autoCapture: true). */
    pay: (id: string, captured?: number) => Object.assign(remote.get(id), { isCompleted: true, isCaptured: true, capturedAmount: captured ?? remote.get(id).amount }),
  };
}

let db: Db;
let close: () => Promise<void>;
let pdfAssetId: string;
const pok = fakePok();
const webhook = (body: unknown) => ({ rawBody: JSON.stringify(body), headers: new Headers({ 'content-type': 'application/json' }), query: new URLSearchParams() });

beforeAll(async () => {
  ({ db, close } = await setupDb());
  const [p] = await db.insert(products).values({ slug: 'tirana-3-days', title: '3 Days in Tirana', active: true, currency: 'EUR', priceMinor: 1000, isTestProduct: true }).returning();
  const [a] = await db
    .insert(productAssets)
    .values({ productId: p.id, version: 1, kind: 'pdf', label: '3 Days in Tirana (PDF)', privateObjectKey: 'guides/tirana-3-days/v1.pdf', filename: 'tirana-3-days.pdf' })
    .returning();
  pdfAssetId = a.id;
});
afterAll(() => close());

async function buy(email: string) {
  const order = await createOrder(db, { productSlug: 'tirana-3-days', email, idempotencyKey: idem(), termsAccepted: true }, { provider: 'pok', livemode: false });
  const { checkoutUrl } = await startCheckout(db, pok.provider, order.attemptId, { siteUrl: SITE });
  const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, order.attemptId));
  return { order, attempt, checkoutUrl, sdkId: attempt.providerReference! };
}
const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const ents = (email: string) => db.select().from(entitlements).where(eq(entitlements.buyerEmail, email));
const emailJobs = (orderId: string) => db.select().from(outboxJobs).where(eq(outboxJobs.uniqueKey, `purchase-email:${orderId}`));

describe('POK adapter (staging)', () => {
  it('refuses any base URL other than staging, and missing credentials', () => {
    expect(() => createPokProvider({ baseUrl: 'https://api.pokpay.io', merchantId: MERCHANT, keyId: 'k', keySecret: 's' })).toThrow(/only staging/);
    expect(() => createPokProvider({ baseUrl: POK_STAGING_BASE_URL, merchantId: MERCHANT, keyId: 'k', keySecret: '' })).toThrow(/required/);
  });

  it('converts amounts explicitly (POK uses major units)', () => {
    expect(toPokAmount(1000, 'EUR')).toBe(10);
    expect(toPokAmount(1050, 'EUR')).toBe(10.5);
    expect(fromPokAmount(10, 'EUR')).toBe(1000);
    expect(fromPokAmount(10.005, 'EUR')).toBeNaN();
    expect(() => toPokAmount(1000, 'USD')).toThrow(/not enabled/);
  });

  it('maps order states; only completed + captured is paid', () => {
    const now = new Date();
    const base = { id: 'x', expiresAt: new Date(now.getTime() + 60_000).toISOString() };
    expect(mapPokState({ ...base }, now)).toBe('pending');
    expect(mapPokState({ ...base, isCompleted: true, isCaptured: false, capturedAmount: 0 }, now)).toBe('authorized');
    expect(mapPokState({ ...base, isCompleted: true, isCaptured: true, capturedAmount: 10 }, now)).toBe('paid');
    expect(mapPokState({ ...base, isCanceled: true }, now)).toBe('cancelled');
    expect(mapPokState({ ...base, isCompleted: true, isCaptured: true, isRefunded: true }, now)).toBe('refunded');
    expect(mapPokState({ id: 'x', expiresAt: new Date(now.getTime() - 1).toISOString() }, now)).toBe('expired');
  });
});

describe('POK checkout flow', () => {
  it('creates the POK order server-side from the DB price and redirects to the hosted page', async () => {
    const { checkoutUrl, sdkId, attempt } = await buy('ok@example.com');
    const remote = pok.remote.get(sdkId);
    expect(checkoutUrl).toBe(`https://pay-staging.pokpay.io/sdk-orders/${sdkId}`);
    expect(remote.amount).toBe(10);
    expect(remote.currencyCode).toBe('EUR');
    expect(remote.merchantCustomReference).toBe(attempt.id);
    expect(remote.webhookUrl).toBeUndefined(); // localhost is not reachable by POK
  });

  it('does not unlock the PDF before payment, even after returning from POK', async () => {
    const { order, sdkId } = await buy('early@example.com');
    expect((await authorizeAsset(db, 'early@example.com', pdfAssetId)).ok).toBe(false);
    // The return page only triggers a status fetch; POK still says "not paid".
    await applyFetchedPayment(db, pok.provider, sdkId, false);
    expect((await orderRow(order.orderId)).status).toBe('pending');
    expect((await authorizeAsset(db, 'early@example.com', pdfAssetId)).ok).toBe(false);
  });

  it('successful payment: verified via the API, fulfilled once despite repeated webhooks', async () => {
    const { order, sdkId } = await buy('paid@example.com');
    pok.pay(sdkId);
    // The webhook body is not trusted; even a lying body only triggers a fetch.
    const lying = webhook({ sdkOrderId: sdkId, status: 'paid', amount: 1 });
    const results = await Promise.all([handleCallback(db, pok.provider, lying, false), handleCallback(db, pok.provider, lying, false), handleCallback(db, pok.provider, webhook({ id: sdkId }), false)]);
    expect(results.every((r) => r.accepted)).toBe(true);
    await reconcileAttempts(db, pok.provider, { expectLivemode: false, olderThanMs: 0, includePaid: true });
    expect((await orderRow(order.orderId)).status).toBe('paid');
    expect(await ents('paid@example.com')).toHaveLength(1);
    expect(await emailJobs(order.orderId)).toHaveLength(1);
    const auth = await authorizeAsset(db, 'paid@example.com', pdfAssetId);
    expect(auth.ok && auth.kind === 'pdf' && auth.objectKey).toBe('guides/tirana-3-days/v1.pdf');
  });

  it('buyer closes the tab before returning: reconciliation alone fulfils the order', async () => {
    const { order, sdkId } = await buy('closed-tab@example.com');
    pok.pay(sdkId);
    await reconcileAttempts(db, pok.provider, { expectLivemode: false, olderThanMs: 0 });
    expect((await orderRow(order.orderId)).status).toBe('paid');
    expect(await emailJobs(order.orderId)).toHaveLength(1);
  });

  it('cancelled payment: no access, no email', async () => {
    const { order, sdkId } = await buy('cancel@example.com');
    pok.remote.get(sdkId).isCanceled = true;
    await applyFetchedPayment(db, pok.provider, sdkId, false);
    expect((await orderRow(order.orderId)).status).toBe('cancelled');
    expect(await ents('cancel@example.com')).toHaveLength(0);
    expect(await emailJobs(order.orderId)).toHaveLength(0);
  });

  it('failed / abandoned payment: stays pending, then expires without access', async () => {
    const { order, sdkId } = await buy('failed@example.com');
    pok.remote.get(sdkId).hasFailedPaymentFlow = true; // a declined card attempt on the hosted page
    await applyFetchedPayment(db, pok.provider, sdkId, false);
    expect((await orderRow(order.orderId)).status).toBe('pending');
    pok.remote.get(sdkId).expiresAt = new Date(Date.now() - 1000).toISOString();
    await applyFetchedPayment(db, pok.provider, sdkId, false);
    expect((await orderRow(order.orderId)).status).toBe('expired');
    expect((await authorizeAsset(db, 'failed@example.com', pdfAssetId)).ok).toBe(false);
  });

  it('captured amount, currency or reference mismatch never grants access', async () => {
    const a = await buy('short@example.com');
    pok.pay(a.sdkId, 9.99);
    await applyFetchedPayment(db, pok.provider, a.sdkId, false);
    const b = await buy('fx@example.com');
    Object.assign(pok.pay(b.sdkId), { currencyCode: 'ALL', originalCurrencyCode: 'EUR' });
    await applyFetchedPayment(db, pok.provider, b.sdkId, false);
    const c = await buy('ref@example.com');
    Object.assign(pok.pay(c.sdkId), { merchantCustomReference: 'someone-else' });
    await applyFetchedPayment(db, pok.provider, c.sdkId, false);
    for (const x of [a, b, c]) {
      expect((await orderRow(x.order.orderId)).status).toBe('pending');
      expect((await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, x.attempt.id)))[0].status).toBe('needs_review');
    }
    expect(await ents('short@example.com')).toHaveLength(0);
    expect(await ents('fx@example.com')).toHaveLength(0);
    expect(await ents('ref@example.com')).toHaveLength(0);
  });

  it('an order of another merchant is refused', async () => {
    const { sdkId } = await buy('merchant@example.com');
    Object.assign(pok.pay(sdkId), { merchant: { id: '11111111-1111-4111-8111-111111111111' } });
    await expect(applyFetchedPayment(db, pok.provider, sdkId, false)).rejects.toThrow(/another merchant/);
    expect(await ents('merchant@example.com')).toHaveLength(0);
  });

  it('webhooks without a usable order id are rejected and change nothing', async () => {
    expect((await handleCallback(db, pok.provider, { rawBody: 'not json', headers: new Headers(), query: new URLSearchParams() }, false)).accepted).toBe(false);
    expect((await handleCallback(db, pok.provider, webhook({ hello: 'world' }), false)).accepted).toBe(false);
  });

  it('timeouts park the attempt for review; a 4xx refusal fails it (no blind retries)', async () => {
    pok.setCreateMode('timeout');
    const t = await createOrder(db, { productSlug: 'tirana-3-days', email: 't@example.com', idempotencyKey: idem(), termsAccepted: true }, { provider: 'pok', livemode: false });
    await expect(startCheckout(db, pok.provider, t.attemptId, { siteUrl: SITE })).rejects.toBeInstanceOf(CommerceError);
    expect((await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, t.attemptId)))[0].status).toBe('needs_review');
    pok.setCreateMode('400');
    const f = await createOrder(db, { productSlug: 'tirana-3-days', email: 'f@example.com', idempotencyKey: idem(), termsAccepted: true }, { provider: 'pok', livemode: false });
    await expect(startCheckout(db, pok.provider, f.attemptId, { siteUrl: SITE })).rejects.toBeInstanceOf(CommerceError);
    expect((await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, f.attemptId)))[0].status).toBe('failed');
    pok.setCreateMode('ok');
  });

  it('logs in once and reuses the token', () => {
    expect(pok.calls.filter((c) => c.endsWith('/auth/sdk/login'))).toHaveLength(1);
  });
});
