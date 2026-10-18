import { ProviderNotConfiguredError, type PaymentProvider } from './contract';

/**
 * Albania POK adapter (pokpay.io, payments.doc.pokpay.io) — INTENTIONALLY NOT IMPLEMENTED.
 * Not related to pok.tech products.
 *
 * Before writing code, confirm from current merchant documentation and record in
 * docs/payments-integration-note.md: Merchant Orders create/retrieve endpoints, authentication,
 * hosted checkout redirect, webhook authenticity (signature) — or, if none is documented, treat the
 * webhook purely as a trigger and fetch the order via the authenticated API — paid/captured semantics,
 * amount units (do NOT assume cents) and currency conversion behaviour.
 *
 * Until then this adapter refuses to run so real payments can never be enabled by accident.
 */
export function createPokProvider(): PaymentProvider {
  throw new ProviderNotConfiguredError(
    'pok',
    'awaiting merchant approval and confirmed Merchant Orders documentation (see docs/payments-integration-note.md).',
  );
}
