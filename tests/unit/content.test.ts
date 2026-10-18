import { describe, expect, it } from 'vitest';
import { eventEndsAt, isUpcoming, tiraneMidnight, upcomingEvents } from '../../src/features/content/events';
import { buildSearchIndex, search } from '../../src/features/content/search';
import { contentBundle, event as eventSchema } from '../../src/features/content/schemas';
import { assertUniqueSlugs } from '../../src/features/content/source';
import { fixtures } from '../../src/content/fixtures';
import { formatMoney } from '../../src/features/commerce/money';

describe('events (Europe/Tirane)', () => {
  it('computes Tirane midnight across DST', () => {
    expect(tiraneMidnight('2026-07-15').toISOString()).toBe('2026-07-14T22:00:00.000Z'); // CEST +2
    expect(tiraneMidnight('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z'); // CET +1
  });

  it('an all-day event ending today stays upcoming until midnight in Tirane, then disappears', () => {
    const e = { start: '2026-08-10', end: '2026-08-10', allDay: true };
    expect(eventEndsAt(e).toISOString()).toBe('2026-08-10T22:00:00.000Z');
    expect(isUpcoming(e, new Date('2026-08-10T21:59:59Z'))).toBe(true); // 23:59:59 Tirane
    expect(isUpcoming(e, new Date('2026-08-10T22:00:00Z'))).toBe(false); // 00:00 Tirane
  });

  it('a timed event ending exactly at midnight is gone at midnight', () => {
    const e = { start: '2026-08-10T20:00:00+02:00', end: '2026-08-11T00:00:00+02:00', allDay: false };
    expect(isUpcoming(e, new Date('2026-08-10T21:59:00Z'))).toBe(true);
    expect(isUpcoming(e, new Date('2026-08-10T22:00:00Z'))).toBe(false);
  });

  it('returns an empty list when there are no future events', () => {
    expect(upcomingEvents([{ start: '2020-01-01', allDay: true }], new Date('2026-10-18T00:00:00Z'))).toEqual([]);
    expect(upcomingEvents([], new Date())).toEqual([]);
  });

  it('rejects events without source/lastChecked or with end before start', () => {
    const base = { slug: 'x', title: 'X', summary: 's', updatedAt: '2026-01-01', start: '2026-05-02', organizerUrl: 'https://example.com', sourceUrl: 'https://example.com', lastCheckedAt: '2026-01-01' };
    expect(eventSchema.safeParse(base).success).toBe(true);
    expect(eventSchema.safeParse({ ...base, sourceUrl: undefined }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, end: '2026-05-01' }).success).toBe(false);
  });
});

describe('content', () => {
  it('fixtures validate and publish no invented events', () => {
    const c = contentBundle.parse(fixtures);
    expect(c.events).toEqual([]);
    expect(c.destinations.every((d) => d.verified === false)).toBe(true);
    expect(() => assertUniqueSlugs(c)).not.toThrow();
  });

  it('rejects duplicate slugs and images without alt text', () => {
    const c = contentBundle.parse(fixtures);
    expect(() => assertUniqueSlugs({ ...c, destinations: [c.destinations[0], c.destinations[0]] })).toThrow(/Duplicate/);
    const broken = structuredClone(fixtures);
    broken.destinations[0].cover.alt = '';
    expect(contentBundle.safeParse(broken).success).toBe(false);
  });
});

describe('search', () => {
  const index = buildSearchIndex(contentBundle.parse(fixtures));

  it('finds accented names without accents', () => {
    expect(search(index, 'gjirokaster').map((r) => r.title)).toContain('Gjirokastër');
  });

  it('returns only whitelisted public fields', () => {
    const results = search(index, 'theth');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(Object.keys(r).sort()).toEqual(['summary', 'title', 'type', 'url']);
  });

  it('never exposes private keys, coordinates or prices', () => {
    const blob = JSON.stringify(search(index, 'a'));
    expect(blob).not.toMatch(/privateObjectKey|guides\/[a-z-]+\/v\d|coordinates|priceMinor|externalUrl/);
  });

  it('handles no results and empty queries', () => {
    expect(search(index, 'zzzzzz')).toEqual([]);
    expect(search(index, '   ')).toEqual([]);
  });
});

describe('money', () => {
  it('formats minor units', () => {
    expect(formatMoney(900, 'USD')).toBe('$9');
    expect(formatMoney(1550, 'EUR')).toBe('€15.50');
  });
});
