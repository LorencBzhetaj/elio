import { sha256 } from '../../lib/crypto';
import {
  AmbiguousProviderResultError,
  ProviderNotConfiguredError,
  type CallbackResult,
  type CreateCheckoutInput,
  type PaymentProvider,
  type PaymentState,
  type RawCallback,
  type VerifiedPayment,
} from './contract';

/**
 * POK (pokpay.io) — STAGING ONLY. Not related to pok.tech.
 *
 * Source: https://docs.pokpay.io/llms-full.txt (REST API) and the full reference at
 * https://payments.doc.pokpay.io/ (Merchant Orders API). What we rely on, and nothing else:
 *  - POST /auth/sdk/login {keyId, keySecret} → data.accessToken, data.expiresAt (bearer token)
 *  - POST /merchants/{merchantId}/sdk-orders → data.sdkOrder with id and `_self.confirmUrl`
 *    ("Webpage URL to confirm the order" — POK's hosted payment page; we never collect card data)
 *  - GET  /merchants/{merchantId}/sdk-orders/{id} → order state (isCompleted, isCaptured, isCanceled,
 *    isRefunded, capturedAmount, currencyCode, merchantCustomReference, merchant.id, expiresAt)
 *  - amounts are in major units (10 = €10; confirmed against staging).
 *
 * The webhook payload format and any signature are NOT documented, so a webhook is only a trigger:
 * we re-fetch the order through the authenticated API and never trust what the notification says.
 */
export interface PokConfig {
  baseUrl: string;
  merchantId: string;
  keyId: string;
  keySecret: string;
  /** Minutes an unpaid POK order stays payable (documented `expiresAfterMinutes`). */
  expiresAfterMinutes?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export const POK_STAGING_BASE_URL = 'https://api-staging.pokpay.io';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Currencies whose minor-unit conversion we have checked against POK (EUR on staging). */
const SUPPORTED_CURRENCIES: Record<string, number> = { EUR: 2 };

export class PokApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PokApiError';
  }
}

interface PokOrder {
  id: string;
  amount?: number;
  capturedAmount?: number;
  currencyCode?: string;
  originalCurrencyCode?: string;
  merchantCustomReference?: string | null;
  isCompleted?: boolean;
  isConfirmed?: boolean;
  isCaptured?: boolean;
  isCanceled?: boolean;
  isRefunded?: boolean;
  expiresAt?: string;
  merchant?: { id?: string } | null;
  _self?: { confirmUrl?: string } | null;
}

export function toPokAmount(amountMinor: number, currency: string): number {
  const digits = SUPPORTED_CURRENCIES[currency];
  if (digits === undefined) throw new Error(`pok: currency ${currency} is not enabled`);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error('pok: invalid amount');
  return amountMinor / 10 ** digits;
}

/** Converts a POK major-unit amount back to minor units; NaN if it is not a whole number of minor units. */
export function fromPokAmount(amount: unknown, currency: string): number {
  const digits = SUPPORTED_CURRENCIES[currency];
  if (digits === undefined || typeof amount !== 'number' || !Number.isFinite(amount)) return Number.NaN;
  const minor = Math.round(amount * 10 ** digits);
  return Math.abs(minor - amount * 10 ** digits) < 1e-6 ? minor : Number.NaN;
}

/** Maps a fetched POK order to our states. Only a completed AND captured order counts as paid. */
export function mapPokState(o: PokOrder, now: Date): PaymentState {
  if (o.isRefunded) return 'refunded';
  if (o.isCanceled) return 'cancelled';
  const captured = o.isCaptured === true || (typeof o.capturedAmount === 'number' && o.capturedAmount > 0);
  if (o.isCompleted && captured) return 'paid';
  if (o.isCompleted || o.isConfirmed) return 'authorized';
  if (o.expiresAt && new Date(o.expiresAt).getTime() < now.getTime()) return 'expired';
  return 'pending';
}

export function createPokProvider(cfg: PokConfig): PaymentProvider {
  // Production is deliberately not enabled: refuse any other base URL.
  if (cfg.baseUrl !== POK_STAGING_BASE_URL) {
    throw new ProviderNotConfiguredError('pok', `only staging (${POK_STAGING_BASE_URL}) is enabled.`);
  }
  if (!UUID.test(cfg.merchantId) || !cfg.keyId || !cfg.keySecret) {
    throw new ProviderNotConfiguredError('pok', 'POK_MERCHANT_ID, POK_KEY_ID and POK_KEY_SECRET are required.');
  }
  const doFetch = cfg.fetchImpl ?? fetch;
  const now = cfg.now ?? (() => new Date());
  const timeoutMs = cfg.timeoutMs ?? 15_000;
  let token: { value: string; expiresAt: number } | null = null;

  async function call(method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth) headers.authorization = `Bearer ${await accessToken()}`;
    const res = await doFetch(cfg.baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // Non-JSON error page; handled by the status check below.
    }
    if (!res.ok) {
      // Log the provider's message server-side only (never shown to buyers; never includes secrets).
      throw new PokApiError(`pok ${method} ${path.replace(UUID, ':id')} → ${res.status} ${String(json?.message ?? '').slice(0, 120)}`, res.status);
    }
    return { status: res.status, json };
  }

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > now().getTime()) return token.value;
    const { json } = await call('POST', '/auth/sdk/login', { keyId: cfg.keyId, keySecret: cfg.keySecret }, false);
    const value = json?.data?.accessToken;
    if (typeof value !== 'string' || !value) throw new PokApiError('pok login: no access token in response', 502);
    const expiresAt = Date.parse(json?.data?.expiresAt ?? '') || now().getTime() + 5 * 60_000;
    token = { value, expiresAt };
    return value;
  }

  const ordersPath = (id?: string) => `/merchants/${cfg.merchantId}/sdk-orders${id ? `/${id}` : ''}`;

  return {
    id: 'pok',

    async createCheckout(input: CreateCheckoutInput) {
      const amount = toPokAmount(input.amountMinor, input.currency);
      // POK has no documented idempotency key: startCheckout guarantees one call per attempt, and
      // timeouts are parked as ambiguous instead of being retried.
      const body: Record<string, unknown> = {
        amount,
        currencyCode: input.currency,
        autoCapture: true,
        description: input.description.slice(0, 200),
        merchantCustomReference: input.attemptId,
        redirectUrl: input.returnUrl,
        failRedirectUrl: input.cancelUrl,
        expiresAfterMinutes: cfg.expiresAfterMinutes ?? 30,
      };
      // A webhook must be reachable from POK; a localhost URL would only produce failed deliveries.
      if (input.callbackUrl.startsWith('https://')) body.webhookUrl = input.callbackUrl;

      let json: any;
      try {
        ({ json } = await call('POST', ordersPath(), body));
      } catch (err) {
        if (err instanceof PokApiError && err.status < 500) throw err; // definite refusal: nothing created
        throw new AmbiguousProviderResultError(`pok: order creation outcome unknown (${(err as Error).message})`);
      }
      const order: PokOrder | undefined = json?.data?.sdkOrder;
      const confirmUrl = order?._self?.confirmUrl;
      if (!order || !UUID.test(order.id ?? '') || typeof confirmUrl !== 'string') {
        throw new AmbiguousProviderResultError('pok: order created without id or confirmUrl');
      }
      const url = new URL(confirmUrl);
      if (url.protocol !== 'https:' || !(url.hostname === 'pokpay.io' || url.hostname.endsWith('.pokpay.io'))) {
        throw new AmbiguousProviderResultError('pok: unexpected payment page host');
      }
      if (order.amount !== amount || order.currencyCode !== input.currency || order.merchantCustomReference !== input.attemptId) {
        throw new AmbiguousProviderResultError('pok: created order does not match the request');
      }
      return { providerReference: order.id.toLowerCase(), checkoutUrl: url.href };
    },

    async verifyAndNormalizeCallback(raw: RawCallback): Promise<CallbackResult> {
      const payloadHash = sha256(raw.rawBody);
      let body: any;
      try {
        body = JSON.parse(raw.rawBody);
      } catch {
        return { kind: 'rejected', reason: 'bad_json', payloadHash };
      }
      // The webhook body is undocumented: look for the SDK order id in the shapes POK uses for orders.
      // Whatever we find is only re-fetched through the authenticated API (unknown ids just 404).
      const candidates = [body?.sdkOrderId, body?.sdkOrder?.id, body?.data?.sdkOrder?.id, body?.data?.id, body?.id];
      const reference = candidates.find((c) => typeof c === 'string' && UUID.test(c));
      if (!reference) return { kind: 'rejected', reason: 'no_order_id', payloadHash };
      return { kind: 'trigger', providerReference: reference.toLowerCase(), dedupeKey: `cb:${payloadHash}`, payloadHash };
    },

    async fetchPayment(providerReference: string): Promise<VerifiedPayment> {
      if (!UUID.test(providerReference)) throw new Error('pok: invalid order id');
      const { json } = await call('GET', ordersPath(providerReference));
      const o: PokOrder | undefined = json?.data?.sdkOrder;
      if (!o || o.id?.toLowerCase() !== providerReference.toLowerCase()) throw new Error('pok: order not in response');
      if (o.merchant?.id && o.merchant.id !== cfg.merchantId) throw new Error('pok: order belongs to another merchant');
      const state = mapPokState(o, now());
      // Charged currency must equal the requested one (no conversion), otherwise the amount check fails.
      const currency = o.currencyCode && o.currencyCode === (o.originalCurrencyCode ?? o.currencyCode) ? o.currencyCode : `converted:${o.currencyCode}`;
      // For a payment, the CAPTURED amount must equal the order total; otherwise the requested amount.
      const amountMinor = fromPokAmount(state === 'paid' ? o.capturedAmount : o.amount, currency);
      return {
        provider: 'pok',
        providerReference: o.id.toLowerCase(),
        merchantReference: o.merchantCustomReference ?? '',
        state,
        amountMinor,
        currency,
        livemode: false, // staging only
      };
    },
  };
}
