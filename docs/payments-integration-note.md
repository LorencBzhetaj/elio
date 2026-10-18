# Payment provider integration note

**Status: no live provider selected.** `PAYMENT_PROVIDER=mock` for development/staging. The `paysera`
and `pok` adapters throw `ProviderNotConfiguredError` on purpose so real payments cannot be enabled by
accident. Do not invent endpoints, signature algorithms or status mappings — fill this note from the
provider's current official documentation and merchant support first.

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
