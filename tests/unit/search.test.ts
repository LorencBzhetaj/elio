import { describe, expect, it } from 'vitest';
import { contentBundle } from '../../src/features/content/schemas';
import { fixtures } from '../../src/content/fixtures';
import { buildSearchIndex, search, suggestions } from '../../src/features/content/search';
import { highlightRanges, normalize } from '../../src/features/search/normalize';
import { createLatestOnly } from '../../src/features/search/latest';

const content = contentBundle.parse(fixtures);
const index = buildSearchIndex(content);
const titles = (q: string, extra = {}) => search(index, { q, ...extra }).results.map((r) => r.title);

describe('normalisation', () => {
  it('ignores case and Albanian diacritics (ë/e, ç/c)', () => {
    expect(normalize('GJIROKASTËR')).toBe('gjirokaster');
    expect(normalize('Çajupi')).toBe('cajupi');
    expect(normalize('  Tiranë!! ')).toBe('tirana');
  });

  it('maps known name variants to one form', () => {
    expect(normalize('Thethi')).toBe(normalize('Theth'));
    expect(normalize('Shkodra')).toBe(normalize('Shkodër'));
    expect(normalize('gjirokastra')).toBe('gjirokaster');
  });

  it('highlights the matching part of the original text, including variants', () => {
    expect(highlightRanges('Gjirokastër', 'kaster')).toEqual([[5, 11]]);
    const theth = highlightRanges('Hiking in Theth: what to know', 'thethi');
    expect(theth).toEqual([[10, 15]]);
  });
});

describe('search ranking', () => {
  it('finds with and without diacritics and via variants', () => {
    expect(titles('gjirokaster')[0]).toBe('Gjirokastër');
    expect(titles('Gjirokastër')[0]).toBe('Gjirokastër');
    expect(titles('thethi')[0]).toBe('Theth');
    expect(titles('shkodra')[0]).toBe('Shkodër');
    expect(titles('tirane')[0]).toBe('Tirana');
  });

  it('orders exact name → name prefix → title match → content match', () => {
    const r = titles('theth');
    expect(r[0]).toBe('Theth'); // exact
    expect(r.indexOf('Theth Guide')).toBeGreaterThan(0); // prefix
    expect(r.indexOf('Hiking in Theth: what to know')).toBeGreaterThan(r.indexOf('Theth Guide')); // title contains
    expect(r[r.length - 1]).toBe('Valbona Pass'); // only mentioned in the summary
  });

  it('requires at least 2 characters', () => {
    expect(search(index, { q: 't' }).total).toBe(0);
  });

  it('filters by content type (articles include essentials) and region, together with text', () => {
    expect(search(index, { q: 'theth', type: 'guide' }).results.every((r) => r.type === 'guide')).toBe(true);
    const articles = search(index, { q: 'around', type: 'article' }).results.map((r) => r.type);
    expect(articles).toContain('essential');
    expect(articles).toContain('article');
    expect(titles('a', {})).toEqual([]);
    const south = search(index, { q: 'town', region: 'south' }).results.map((r) => r.title);
    expect(south).toContain('Gjirokastër');
    expect(south).not.toContain('Berat');
  });

  it('returns no results cleanly', () => {
    expect(search(index, { q: 'zzzz qqqq' })).toEqual({ total: 0, results: [] });
  });

  it('shows the destination for results linked to one', () => {
    const guide = search(index, { q: 'hiking in theth' }).results.find((r) => r.type === 'article');
    expect(guide?.destination).toEqual({ slug: 'theth', title: 'Theth' });
  });
});

describe('public payload', () => {
  it('only exposes whitelisted fields', () => {
    const allowed = ['category', 'destination', 'id', 'image', 'summary', 'title', 'type', 'url'];
    for (const r of search(index, { q: 'th' }).results) {
      for (const key of Object.keys(r)) expect(allowed).toContain(key);
      expect(Object.keys(r.image).every((k) => ['src', 'alt', 'scene'].includes(k))).toBe(true);
    }
  });

  it('never contains coordinates, private keys, prices or map links', () => {
    const blob = JSON.stringify([search(index, { q: 'th' }), search(index, { q: 'guide' }), suggestions(content, index)]);
    expect(blob).not.toMatch(/"(lat|lng|coordinates|location|privateObjectKey|priceMinor|externalUrl)"|guides\/[a-z-]+\/v\d/);
  });

  it('empty-state suggestions are editorial picks, not statistics', () => {
    const s = suggestions(content, index);
    expect(s.destinations.map((d) => d.title)).toEqual(content.destinations.filter((d) => d.featured).map((d) => d.title));
    expect(s.searches).toEqual(content.settings.suggestedSearches);
  });
});

describe('out-of-order responses', () => {
  it('a slow older request cannot overwrite a newer one', async () => {
    const latest = createLatestOnly();
    let releaseOld!: (v: string) => void;
    const old = latest.run(() => new Promise<string>((r) => (releaseOld = r)));
    const fresh = latest.run(async () => 'new');
    releaseOld('old');
    expect(await fresh).toEqual({ stale: false, value: 'new' });
    expect(await old).toEqual({ stale: true });
  });

  it('aborts the previous request', async () => {
    const latest = createLatestOnly();
    let firstSignal!: AbortSignal;
    const first = latest.run((s) => {
      firstSignal = s;
      return new Promise((_, reject) => s.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    });
    await latest.run(async () => 1);
    expect(firstSignal.aborted).toBe(true);
    expect(await first).toEqual({ stale: true });
  });
});
