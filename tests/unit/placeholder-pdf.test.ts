import { describe, expect, it } from 'vitest';
import { placeholderPdf, placeholderTitleForKey } from '../../src/features/access/placeholder-pdf';

describe('test placeholder PDFs', () => {
  it('are valid PDFs that say they are placeholders', () => {
    const pdf = placeholderPdf('Theth Guide').toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('TEST PLACEHOLDER - Theth Guide');
  });

  it('only stand in for seeded placeholder keys', () => {
    expect(placeholderTitleForKey('guides/theth-guide/v1-placeholder.pdf')).toBe('Theth Guide');
    expect(placeholderTitleForKey('guides/theth-guide/v2.pdf')).toBeNull(); // a real guide file
    expect(placeholderTitleForKey('../.env')).toBeNull();
    expect(placeholderTitleForKey('guides/../x/v1-placeholder.pdf')).toBeNull();
  });
});
