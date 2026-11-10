# Payment provider integration note

**Status: POK (pokpay.io) implemented for STAGING only** (`src/features/payments/pok.ts`). Production is
refused by code (base URL must be `https://api-staging.pokpay.io`; `APP_ENV=production` + `pok` fails config
validation). `mock` remains for development. Paysera is still the refusing stub.

## POK — what the implementation relies on (11 November 2026)

Sources: <https://docs.pokpay.io/llms-full.txt> (REST API, PHP SDK) and the authoritative reference
<https://payments.doc.pokpay.io/> (Postman collection "Merchant Orders API").

| Item | Value |
|---|---|
| Sandbox / production base URL | `https://api-staging.pokpay.io` / `https://api.pokpay.io` (production NOT enabled) |
| Authentication | `POST /auth/sdk/login` `{keyId, keySecret}` → `data.accessToken` (Bearer), `data.expiresAt` (~10 min). Token cached per process, refreshed 60 s early |
| Create order | `POST /merchants/{merchantId}/sdk-orders` with `amount`, `currencyCode`, `autoCapture: true`, `description`, `merchantCustomReference` (= our attempt id), `redirectUrl`, `failRedirectUrl`, `expiresAfterMinutes: 30`, `webhookUrl` (only when the site is https) |
| Hosted checkout | `data.sdkOrder._self.confirmUrl` — documented as "Webpage URL to confirm the order" (`https://pay-staging.pokpay.io/sdk-orders/{id}`). We only accept https `*.pokpay.io` hosts |
| Return / cancel | `redirectUrl` after confirmation (POK appends `?orderId=…`), `failRedirectUrl` if the payment fails. Both only trigger a server-side status fetch |
| Webhook | Field `webhookUrl` exists; **payload format and signature are not documented** → treated as a trigger only; the order is re-fetched through the authenticated API |
| Status retrieval | `GET /merchants/{merchantId}/sdk-orders/{id}` (merchant-scoped; also returns `merchant.id`, which we check) |
| Status mapping | `isRefunded` → refunded; `isCanceled` → cancelled; `isCompleted && isCaptured` → **paid**; completed/confirmed without capture → authorized; past `expiresAt` → expired; else pending |
| Amount unit / currency | Major units (`10` = €10), confirmed on staging. Only EUR enabled; paid amount = `capturedAmount`; currency conversion (`originalCurrencyCode ≠ currencyCode`) is treated as a mismatch |
| Test vs live | Staging only → `livemode: false` |
| Idempotency for order creation | Not documented → one call per attempt (row lock); timeouts/5xx park the attempt as `needs_review` |
| Refund visibility | `isRefunded` on the order (refunds are not issued from this site) |

### Verified on staging (11 November 2026)

- Login, create order and retrieve order with the project's staging credentials.
- Full browser flow: guide page → checkout (email) → POK hosted page → test card `4242 4242 4242 4242` →
  redirect → server fetch → order `paid`, one entitlement, one purchase email (console transport) →
  email access link → My trip → PDF download (100 237 268 bytes, identical to the source file).
- POK order after payment: `isCompleted/isConfirmed/isCaptured: true`, `capturedAmount: 10`, `EUR`,
  `status: "paid"`, our merchant id and attempt reference. Unpaid order: `status: "created"`.
- Leaving the POK page (`?cancelled=1` return): order stays pending, nothing unlocked, "Return to the payment page".

### Open questions (ask POK support before production)

1. Webhook payload shape, retry policy and any signature/authentication (we use it only as a trigger; the
   adapter looks for the order id in `sdkOrderId`, `sdkOrder.id`, `data.sdkOrder.id`, `data.id`, `id`).
   Not received yet: localhost is not reachable, so a public https deployment is needed to observe it.
2. Whether the hosted page has an explicit "cancel" action that uses `failRedirectUrl`, and which test
   card produces a declined payment (the documented staging cards all succeed).
3. Meaning of the undocumented `status` field (seen: `created`, `paid`) — we do not rely on it.
4. Whether an unpaid order can be cancelled server-side (the documented cancel endpoint is for confirmed
   `autoCapture: false` orders); today an abandoned order simply expires after 30 minutes.

## Contract to implement (`src/features/payments/contract.ts`)

- `createCheckout(input) → { providerReference, checkoutUrl }` — hosted checkout only; we never collect
  card data. `input.attemptId` must be sent as the merchant reference. Translate `amountMinor` to the
  provider's documented unit **explicitly** (never assume cents). Use the provider's idempotency feature
  only if documented; on timeouts throw `AmbiguousProviderResultError` (attempt is parked for review).
- `verifyAndNormalizeCallback(raw)` — if the provider documents a signature: verify it exactly and
  return `verified`; otherwise return `trigger` with the reference and let us fetch the status.
- `fetchPayment(reference) → VerifiedPayment` — authenticated API call; map the provider's states to
  `pending | authorized | paid | failed | cancelled | expired | refunded`; report `livemode`.

`processVerifiedPayment` already enforces reference/attempt/amount/currency/mode matching, idempotency,
no fulfilment on authorisation and refund precedence — adapters must not duplicate that logic.

## Fill in for the chosen provider

| Item | Value (from official docs / merchant support) |
|---|---|
| Provider and API family (Paysera: Classic **or** Checkout v3 — never mix) | |
| Sandbox base URL / production base URL | |
| Authentication method for server API | |
| Create order / payment endpoint and required fields | |
| Hosted checkout redirect + return/cancel URL behaviour | |
| Callback/webhook format, HTTP method and content type | |
| Callback signature algorithm (or “none → trigger + fetch”) | |
| Status retrieval endpoint | |
| Status mapping → our `PaymentState` (incl. authorised vs captured) | |
| Amount unit and currency rules (conversion on/off, settlement currency) | |
| Test vs live indicator | |
| Refund visibility in API (full refunds) | |
| Idempotency support for order creation | |

Paysera docs: <https://developers.paysera.com/> (choose the family enabled for the merchant project).
POK (Albania) docs: <https://payments.doc.pokpay.io/> — not pok.tech.

## Implementation checklist

1. Implement only the selected adapter; leave the other as the refusing stub.
2. If callbacks arrive as `application/x-www-form-urlencoded` with an `Origin` header, confirm they pass
   Astro's origin check (server-to-server requests normally send no `Origin`).
3. Add integration tests with recorded sandbox payloads for every scenario in
   `docs/brief/04-PAYMENTS-AND-DELIVERY.md` → *Security and operations acceptance*.
4. Run a sandbox payment end-to-end and record provider → DB final status here.
5. Configure secrets only in the hosting platform; never in the repo.
6. First real payment and refund under owner supervision; then switch `APP_ENV=production`.
