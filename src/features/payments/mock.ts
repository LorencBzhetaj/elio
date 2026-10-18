import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { mockProviderPayments } from '../../db/schema';
import { hmac, randomToken, safeEqual, sha256 } from '../../lib/crypto';
import type { CallbackResult, CreateCheckoutInput, PaymentProvider, PaymentState, RawCallback, VerifiedPayment } from './contract';

/**
 * DEVELOPMENT/TEST-ONLY payment provider. It plays the "remote gateway": it stores its own payment
 * state in `mock_provider_payments` and exposes a hosted page at /mock-pay/[ref].
 * Its callback carries only a reference + HMAC; status is ALWAYS re-fetched via fetchPayment,
 * which is the same pattern real adapters must use when callback authenticity is uncertain.
 * Disabled in production by config validation.
 */
export function createMockProvider(deps: { db: Db; secret: string; siteUrl: string }): PaymentProvider & {
  simulate(providerReference: string, state: PaymentState): Promise<void>;
  signCallback(body: string): string;
} {
  const { db, secret, siteUrl } = deps;
  const sign = (body: string) => hmac(secret, `mock-callback:${body}`);

  return {
    id: 'mock',

    async createCheckout(input: CreateCheckoutInput) {
      // Remote-side idempotency: the same key returns the same payment.
      const existing = await db.select().from(mockProviderPayments).where(eq(mockProviderPayments.idempotencyKey, input.idempotencyKey));
      if (existing[0]) {
        return { providerReference: existing[0].providerReference, checkoutUrl: new URL(`/mock-pay/${existing[0].providerReference}`, siteUrl).href };
      }
      const providerReference = `mock_${randomToken(12)}`;
      await db.insert(mockProviderPayments).values({
        providerReference,
        merchantReference: input.attemptId,
        idempotencyKey: input.idempotencyKey,
        amountMinor: input.amountMinor,
        currency: input.currency,
        state: 'pending',
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
        callbackUrl: input.callbackUrl,
      });
      return { providerReference, checkoutUrl: new URL(`/mock-pay/${providerReference}`, siteUrl).href };
    },

    async verifyAndNormalizeCallback(raw: RawCallback): Promise<CallbackResult> {
      const payloadHash = sha256(raw.rawBody);
      const signature = raw.headers.get('x-mock-signature') ?? '';
      if (!signature || !safeEqual(signature, sign(raw.rawBody))) {
        return { kind: 'rejected', reason: 'bad_signature', payloadHash };
      }
      let body: { reference?: unknown; eventId?: unknown };
      try {
        body = JSON.parse(raw.rawBody);
      } catch {
        return { kind: 'rejected', reason: 'bad_json', payloadHash };
      }
      if (typeof body.reference !== 'string' || typeof body.eventId !== 'string') {
        return { kind: 'rejected', reason: 'bad_shape', payloadHash };
      }
      // Trigger only: never trust state/amount from the notification.
      return { kind: 'trigger', providerReference: body.reference, dedupeKey: `cb:${body.eventId}`, payloadHash };
    },

    async fetchPayment(providerReference: string): Promise<VerifiedPayment> {
      const [row] = await db.select().from(mockProviderPayments).where(eq(mockProviderPayments.providerReference, providerReference));
      if (!row) throw new Error('mock: unknown payment reference');
      return {
        provider: 'mock',
        providerReference: row.providerReference,
        merchantReference: row.merchantReference,
        state: row.state as PaymentState,
        amountMinor: row.amountMinor,
        currency: row.currency,
        livemode: false,
      };
    },

    async simulate(providerReference: string, state: PaymentState) {
      await db
        .update(mockProviderPayments)
        .set({ state, updatedAt: new Date() })
        .where(eq(mockProviderPayments.providerReference, providerReference));
    },

    signCallback: sign,
  };
}
