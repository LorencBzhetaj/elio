/**
 * Search normalisation shared by the server index and the browser (for highlighting).
 * Dependency-free so it can ship to the client.
 *
 *  - case-insensitive, diacritics removed: ë→e, ç→c, Gjirokastër→gjirokaster
 *  - punctuation collapsed to spaces
 *  - known Albanian name variants mapped to one canonical token (Thethi→theth, Shkodra→shkoder)
 */

/** canonical → variants (already accent-free, lowercase). Content can add more via `aliases`. */
export const NAME_VARIANTS: Record<string, string[]> = {
  theth: ['thethi', 'thethit'],
  shkoder: ['shkodra', 'shkodres', 'scutari'],
  gjirokaster: ['gjirokastra', 'gjirokastres', 'argyrokastro'],
  tirana: ['tirane', 'tiranes'],
  berat: ['berati', 'beratit'],
  ksamil: ['ksamili', 'ksamilit'],
  durres: ['durresi', 'durazzo'],
  vlore: ['vlora', 'valona'],
  sarande: ['saranda'],
  korce: ['korca'],
  himare: ['himara'],
  valbona: ['valbone', 'valbones'],
  komani: ['koman'],
  dhermi: ['dhermiu', 'drymades'],
};

const VARIANT_TO_CANONICAL = new Map<string, string>();
for (const [canonical, variants] of Object.entries(NAME_VARIANTS)) for (const v of variants) VARIANT_TO_CANONICAL.set(v, canonical);

const MARKS = /[̀-ͯ]/g;

/** Normalises one character; keeps a 1:1 length for the characters we care about (used for highlighting). */
export function foldChar(ch: string): string {
  const f = ch.normalize('NFD').replace(MARKS, '').toLowerCase();
  if (f.length !== 1) return f.length === 0 ? ' ' : f[0];
  return /[a-z0-9]/.test(f) ? f : ' ';
}

/** Folded text without variant mapping, same length as the input (for match positions). */
export function foldWithSameLength(text: string): string {
  let out = '';
  for (const ch of text) out += ch.length === 1 ? foldChar(ch) : ' ';
  return out;
}

export function canonicalToken(token: string): string {
  return VARIANT_TO_CANONICAL.get(token) ?? token;
}

/** Full normalisation: fold, collapse spaces, canonicalise known name variants. */
export function normalize(text: string): string {
  return foldWithSameLength(text)
    .split(/\s+/)
    .filter(Boolean)
    .map(canonicalToken)
    .join(' ');
}

export function tokens(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

/**
 * Ranges of `text` that match any of the query terms (variants included), for <mark> highlighting.
 * Returns [start, end) pairs, merged and sorted.
 */
export function highlightRanges(text: string, query: string): [number, number][] {
  const folded = foldWithSameLength(text);
  const terms = new Set<string>();
  for (const t of foldWithSameLength(query).split(/\s+/).filter((x) => x.length >= 2)) {
    terms.add(t);
    const canonical = canonicalToken(t);
    terms.add(canonical);
    // Query "thethi" should highlight "Theth"; query "theth" should highlight "Thethi" in text.
    for (const v of NAME_VARIANTS[canonical] ?? []) terms.add(v);
  }
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const i = folded.indexOf(term, from);
      if (i < 0) break;
      ranges.push([i, i + term.length]);
      from = i + 1;
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
