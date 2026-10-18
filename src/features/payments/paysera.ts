import { ProviderNotConfiguredError, type PaymentProvider } from './contract';

/**
 * Paysera adapter — INTENTIONALLY NOT IMPLEMENTED.
 *
 * Paysera documents more than one API family (Checkout "Classic" and the newer Checkout v3).
 * Before writing code, the owner must confirm with Paysera which family the approved merchant project
 * uses, then record in docs/payments-integration-note.md: endpoint base URLs, request signing,
 * callback verification algorithm, amount units, supported currencies, test-mode flag and the
 * final status mapping to PaymentState. Do not mix Classic and v3 fields, signatures or SDKs.
 *
 * Until then this adapter refuses to run so real payments can never be enabled by accident.
 */
export function createPayseraProvider(): PaymentProvider {
  throw new ProviderNotConfiguredError(
    'paysera',
    'awaiting merchant approval and a documented API family (see docs/payments-integration-note.md).',
  );
}
