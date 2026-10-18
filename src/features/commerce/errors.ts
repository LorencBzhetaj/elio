export type CommerceErrorCode =
  | 'invalid_email'
  | 'terms_required'
  | 'product_unavailable'
  | 'idempotency_conflict'
  | 'order_not_found'
  | 'order_not_payable'
  | 'checkout_in_progress'
  | 'provider_unavailable';

export class CommerceError extends Error {
  constructor(public readonly code: CommerceErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CommerceError';
  }
}
