/** Integer minor units internally; conversion to provider units happens only inside each adapter. */
export function minorUnitDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(amountMinor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  const value = amountMinor / 10 ** digits;
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value);
}
