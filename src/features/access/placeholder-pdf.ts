/**
 * One-page PDF that clearly says it is a TEST placeholder. Used by the seed script and, outside
 * production, to serve test downloads on hosts without stored files (e.g. a Vercel preview).
 */
export function placeholderPdf(title: string): Buffer {
  const text = `TEST PLACEHOLDER - ${title} - not a real guide`;
  const stream = `BT /F1 18 Tf 50 750 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Only the seeded test keys qualify: guides/<slug>/v<n>-placeholder.pdf */
const PLACEHOLDER_KEY = /^guides\/([a-z0-9-]+)\/v\d+-placeholder\.pdf$/;

export function placeholderTitleForKey(key: string): string | null {
  const m = PLACEHOLDER_KEY.exec(key);
  if (!m) return null;
  return m[1].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
