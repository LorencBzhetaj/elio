/**
 * Provider-neutral payment contract (04-PAYMENTS-AND-DELIVERY.md).
 * Provider selection never changes UI components or entitlement logic.
 */
export type ProviderId = 'mock' | 'paysera' | 'pok';

export type PaymentState = 'pending' | 'authorized' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';

export interface CreateCheckoutInput {
  orderId: string;
  attemptId: string;
  amountMinor: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  idempotencyKey: string;
  buyerEmail: string;
  description: string;
}

export interface CreateCheckoutResult {
  providerReference: string;
  checkoutUrl: string;
}

/**
 * Status obtained through an AUTHENTICATED channel (provider API with merchant credentials, or a
 * callback whose authenticity was established using the provider's documented verification).
 */
export interface VerifiedPayment {
  provider: ProviderId;
  providerReference: string;
  /** Our attempt id, as echoed by the provider. Must match the attempt we stored. */
  merchantReference: string;
  state: PaymentState;
  amountMinor: number;
  currency: string;
  /** Test vs live mode as reported by the provider. Must match our environment. */
  livemode: boolean;
}

export interface RawCallback {
  rawBody: string;
  headers: Headers;
  query: URLSearchParams;
}

/**
 * A callback is EITHER fully verified (documented signature checked) OR only a trigger that tells us
 * which reference to re-fetch through the authenticated API. Status/amount in an unverified
 * notification are never trusted.
 */
export type CallbackResult =
  | { kind: 'verified'; payment: VerifiedPayment; dedupeKey: string; payloadHash: string }
  | { kind: 'trigger'; providerReference: string; dedupeKey: string; payloadHash: string }
  | { kind: 'rejected'; reason: string; payloadHash: string };

export interface PaymentProvider {
  readonly id: ProviderId;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  verifyAndNormalizeCallback(raw: RawCallback): Promise<CallbackResult>;
  fetchPayment(providerReference: string): Promise<VerifiedPayment>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: ProviderId, detail: string) {
    super(`Payment provider "${provider}" is not enabled: ${detail}`);
    this.name = 'ProviderNotConfiguredError';
  }
}

/** Raised when we cannot know whether the remote side created a checkout (e.g. timeout). */
export class AmbiguousProviderResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousProviderResultError';
  }
}
