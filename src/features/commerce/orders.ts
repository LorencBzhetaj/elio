import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { orderItems, orders, paymentAttempts, products } from '../../db/schema';
import { publicReference, randomToken, safeEqual, sha256 } from '../../lib/crypto';
import { AmbiguousProviderResultError, type PaymentProvider } from '../payments/contract';
import { CommerceError } from './errors';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export interface CreateOrderInput {
  productSlug: string;
  email: string;
  idempotencyKey: string;
  termsAccepted: boolean;
  marketingOptIn?: boolean;
}

export interface CreateOrderResult {
  orderId: string;
  attemptId: string;
  publicReference: string;
  /** Raw secret for the HttpOnly viewer cookie. Only its hash is stored. Null on idempotent replay. */
  viewerSecret: string | null;
  replayed: boolean;
}

/**
 * Creates a pending order, its item snapshot and a first payment attempt.
 * The price ALWAYS comes from the products table — the browser never submits an amount.
 * Repeating the same idempotency key returns the original order instead of creating another.
 */
export async function createOrder(db: Db, input: CreateOrderInput, opts: { provider: string; livemode: boolean }): Promise<CreateOrderResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw new CommerceError('invalid_email');
  if (!input.termsAccepted) throw new CommerceError('terms_required');
  const key = z.string().trim().min(16).max(100).safeParse(input.idempotencyKey);
  if (!key.success) throw new CommerceError('idempotency_conflict', 'Missing or invalid idempotency key');

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(orders).where(eq(orders.idempotencyKey, key.data));
    if (existing) {
      const [item] = await tx.select().from(orderItems).where(eq(orderItems.orderId, existing.id));
      const [product] = item ? await tx.select().from(products).where(eq(products.id, item.productId)) : [];
      if (existing.buyerEmail !== email.data || product?.slug !== input.productSlug) {
        throw new CommerceError('idempotency_conflict');
      }
      const [attempt] = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, existing.id))
        .orderBy(desc(paymentAttempts.createdAt))
        .limit(1);
      return { orderId: existing.id, attemptId: attempt.id, publicReference: existing.publicReference, viewerSecret: null, replayed: true };
    }

    const [product] = await tx.select().from(products).where(and(eq(products.slug, input.productSlug), eq(products.active, true)));
    if (!product) throw new CommerceError('product_unavailable');

    const viewerSecret = randomToken();
    const [order] = await tx
      .insert(orders)
      .values({
        publicReference: publicReference(),
        buyerEmail: email.data,
        currency: product.currency,
        totalMinor: product.priceMinor,
        status: 'pending',
        idempotencyKey: key.data,
        viewerSecretHash: sha256(viewerSecret),
        termsAcceptedAt: new Date(),
        marketingOptIn: Boolean(input.marketingOptIn),
      })
      .returning();

    // MVP: one product per checkout, quantity one. order_items keeps bundles possible later.
    await tx.insert(orderItems).values({
      orderId: order.id,
      productId: product.id,
      titleSnapshot: product.title,
      amountMinor: product.priceMinor,
      currency: product.currency,
      fulfillmentVersion: product.fulfillmentVersion,
    });

    const [attempt] = await tx
      .insert(paymentAttempts)
      .values({
        orderId: order.id,
        provider: opts.provider,
        amountMinor: order.totalMinor,
        currency: order.currency,
        idempotencyKey: `${order.id}:1`,
        livemode: opts.livemode,
        status: 'created',
      })
      .returning();

    return { orderId: order.id, attemptId: attempt.id, publicReference: order.publicReference, viewerSecret, replayed: false };
  });
}

/**
 * Calls the provider for an attempt exactly once. The attempt is moved to "creating" under a row lock
 * so concurrent requests cannot both call the provider. The provider reference is persisted before the
 * browser is redirected. Ambiguous outcomes (timeouts) park the attempt in "needs_review" — they are
 * reconciled, never blindly retried.
 */
export async function startCheckout(
  db: Db,
  provider: PaymentProvider,
  attemptId: string,
  urls: { siteUrl: string },
): Promise<{ checkoutUrl: string }> {
  const claimed = await db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId)).for('update');
    if (!attempt) throw new CommerceError('order_not_found');
    if (attempt.checkoutUrl && attempt.providerReference && attempt.status === 'pending') {
      return { reuse: attempt.checkoutUrl } as const;
    }
    if (attempt.status !== 'created') throw new CommerceError('checkout_in_progress');
    const [order] = await tx.select().from(orders).where(eq(orders.id, attempt.orderId)).for('update');
    if (order.status !== 'pending') throw new CommerceError('order_not_payable');
    await tx.update(paymentAttempts).set({ status: 'creating', updatedAt: new Date() }).where(eq(paymentAttempts.id, attempt.id));
    const [item] = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    return { attempt, order, item } as const;
  });
  if ('reuse' in claimed) return { checkoutUrl: claimed.reuse! };

  const { attempt, order, item } = claimed;
  const orderUrl = new URL(`/order/${order.publicReference}`, urls.siteUrl);
  try {
    const result = await provider.createCheckout({
      orderId: order.id,
      attemptId: attempt.id,
      amountMinor: attempt.amountMinor,
      currency: attempt.currency,
      returnUrl: orderUrl.href,
      cancelUrl: `${orderUrl.href}?cancelled=1`,
      callbackUrl: new URL(`/api/payments/${provider.id}/callback`, urls.siteUrl).href,
      idempotencyKey: attempt.idempotencyKey,
      buyerEmail: order.buyerEmail,
      description: item?.titleSnapshot ?? 'Digital guide',
    });
    await db
      .update(paymentAttempts)
      .set({ status: 'pending', providerReference: result.providerReference, checkoutUrl: result.checkoutUrl, updatedAt: new Date() })
      .where(eq(paymentAttempts.id, attempt.id));
    return { checkoutUrl: result.checkoutUrl };
  } catch (err) {
    const ambiguous = err instanceof AmbiguousProviderResultError;
    await db
      .update(paymentAttempts)
      .set({ status: ambiguous ? 'needs_review' : 'failed', lastError: (err as Error).message.slice(0, 500), updatedAt: new Date() })
      .where(eq(paymentAttempts.id, attempt.id));
    throw new CommerceError('provider_unavailable', (err as Error).message);
  }
}

/**
 * Adds a NEW payment attempt to an unpaid order (e.g. after a failed or cancelled payment).
 * Refused while another attempt may still complete, so one order cannot be charged twice in parallel.
 */
export async function createRetryAttempt(db: Db, orderId: string, opts: { provider: string; livemode: boolean }): Promise<string> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new CommerceError('order_not_found');
    if (!['pending', 'failed', 'cancelled', 'expired'].includes(order.status)) throw new CommerceError('order_not_payable');
    const attempts = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
    if (attempts.some((a) => ['created', 'creating', 'pending', 'authorized', 'needs_review'].includes(a.status))) {
      throw new CommerceError('checkout_in_progress');
    }
    if (order.status !== 'pending') {
      await tx.update(orders).set({ status: 'pending', updatedAt: new Date() }).where(eq(orders.id, orderId));
    }
    const [attempt] = await tx
      .insert(paymentAttempts)
      .values({
        orderId,
        provider: opts.provider,
        amountMinor: order.totalMinor,
        currency: order.currency,
        idempotencyKey: `${orderId}:${attempts.length + 1}`,
        livemode: opts.livemode,
        status: 'created',
      })
      .returning();
    return attempt.id;
  });
}

export async function findOrderByReference(db: Db, ref: string) {
  if (!/^AL-[A-Z0-9]{6,20}$/.test(ref)) return undefined;
  const [order] = await db.select().from(orders).where(eq(orders.publicReference, ref));
  return order;
}

/** Viewing an order requires the creating browser's cookie secret OR a session for the buyer's email. */
export function canViewOrder(order: { viewerSecretHash: string; buyerEmail: string }, viewer: { cookieSecret?: string; sessionEmail?: string; isAdmin?: boolean }): boolean {
  if (viewer.isAdmin) return true;
  if (viewer.sessionEmail && viewer.sessionEmail === order.buyerEmail) return true;
  if (viewer.cookieSecret && safeEqual(sha256(viewer.cookieSecret), order.viewerSecretHash)) return true;
  return false;
}

export async function getOrderDetail(db: Db, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return undefined;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const attempts = await db.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, orderId)).orderBy(desc(paymentAttempts.createdAt));
  const productRows = items.length ? await db.select().from(products).where(inArray(products.id, items.map((i) => i.productId))) : [];
  return { order, items, attempts, products: productRows };
}

export const viewerCookieName = (ref: string) => `ov_${ref.replace(/[^A-Z0-9-]/g, '')}`;
