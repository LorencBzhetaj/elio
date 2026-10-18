# Payment and fulfillment contract
## Provider-neutral rules
PAYMENT_PROVIDER=mock|paysera|pok. Enable just one live adapter initially. Mock is disabled in production. Provider selection never changes UI components or entitlement logic. Merchant approval, product category support, international cards, currencies, settlement, fees and refund process require confirmation with the selected provider. Do not assume automatic tax handling or Merchant of Record service.

Interface (design pseudocode, implement provider mapping after reviewing current docs):
createCheckout(input: {orderId, attemptId, amountMinor, currency, returnUrl, cancelUrl, callbackUrl, idempotencyKey}) -> {providerReference, checkoutUrl}
verifyAndNormalizeCallback(rawBody, headers, query) -> VerifiedNotification
fetchPayment(providerReference) -> VerifiedPayment
VerifiedPayment = {providerReference, merchantReference, state: pending|authorized|paid|failed|cancelled|expired|refunded, amountMinor, currency}
Callback verifier must reject forged input; do not invent a provider signature algorithm. When callback authenticity cannot be established from approved docs, treat it only as a trigger to fetch status via authenticated provider API. Never trust notification amount or status alone.

1. Server validates active product, reads authoritative amount/currency, creates pending order + item snapshot and payment attempt. Browser cannot submit a trusted price.
2. Adapter creates checkout; persist provider reference before redirect. Serialize/dedupe checkout creation per attempt; for ambiguous timeouts reconcile reference before retrying. Use provider idempotency only if actually supported; internal idempotency alone cannot guarantee remote exactly-once creation.
3. Browser leaves for hosted checkout. Never collect raw card fields on this site.
4. Callback or scheduled reconciliation obtains authenticated final status. Validate provider reference, merchant/order binding, exact paid amount and currency, account and test/live mode. Authorization alone is not fulfillment.
5. Transaction locks attempt/order; record dedupe key, transition to paid, create unique entitlement and outbox email job. Repeated/out-of-order callbacks cannot duplicate fulfillment or reverse a refund. A late verified paid callback after a browser cancel still must be reconciled and fulfilled once.
6. Return page polls first-party authenticated order status with bounded backoff (e.g. 2, 4, 8, 10 seconds then manual refresh). Redirect query parameters never mark an order paid. Show support route if verification remains pending.
7. Worker sends access email and retries failures. Email failure does not undo paid state. Entitlement remains available via verified recovery flow. Retry exhaustion raises an owner alert.
8. Reconcile pending attempts every 5 minutes; reconcile late payments and refunds daily. Define provider-specific terminal semantics before mapping; retain unresolved ambiguity for manual review.

Orders: pending → paid / failed / cancelled / expired; paid → refunded. Payment attempts can differ from the parent order: one failed attempt does not cancel an already paid order. MVP full refunds only; use provider dashboard initially, sync confirmed refund status and revoke future access. Partial refunds and automated refund buttons are deferred. A downloaded PDF cannot be recalled.

## Paysera
Official documentation exposes Classic and newer Checkout families. Choose ONE supported API family for the approved merchant project; do not mix legacy signatures, callback fields or SDKs across versions. Confirm available family with merchant support and lock it in an integration note. Server callback verification and reconciliation are required. Do not assume a PHP SDK runs natively in the TypeScript server; implement documented HTTP protocol or choose an explicitly supported service if needed.

## POK
Use Albania POK at pokpay.io / payments.doc.pokpay.io, not unrelated pok.tech credential/LMS products. The published Merchant Orders API documents order creation, redirects, webhook URL and authenticated order retrieval. Confirm hosted checkout flow, signature verification, paid/captured semantics, currency conversions and amount units with current merchant documentation. Internal cents must be translated explicitly at the boundary; never assume POK's numeric amount is in cents. If conversion changes processing currency, either validate the documented original/settlement mapping explicitly or disable conversion for MVP; do not bypass currency mismatch checks.

## Security and operations acceptance
Forged callback; changed amount/currency; wrong merchant/reference; replay; two simultaneous callbacks; payment timeout; callback before return; return before callback; authorized but uncaptured; late paid after cancel; full refund before duplicate paid event; email outage; expired access link; request for another buyer's PDF. Each has integration/E2E coverage before live enablement.

Do not promise Apple Pay, Google Pay, offline maps, instant refunds or international cards until enabled and tested. Seller invoicing/tax requirements are a separate go-live decision; payment gateway receipts do not automatically satisfy them.
