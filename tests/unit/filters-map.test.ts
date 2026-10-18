import { describe, expect, it } from 'vitest';
import { contentBundle } from '../../src/features/content/schemas';
import { fixtures } from '../../src/content/fixtures';
import { activeFilterCount, applyFilters, emptyState, readState, summarize, usefulGroups, writeParams, type FilterState } from '../../src/features/filters/core';
import { destinationListing, eventListing, guideListing, placeListing } from '../../src/features/filters/listings';
import { buildMapItems, mapGroups } from '../../src/features/map/data';
import { addDestination, emptyTrip, parseTrip, removeDestination } from '../../src/features/trip/model';

const content = contentBundle.parse(fixtures);
const dest = destinationListing(content);
const ids = (s: Partial<FilterState>) => applyFilters(dest.items, { ...emptyState('featured'), ...s }).map((i) => i.id);

describe('filter semantics', () => {
  it('OR inside a group, AND across groups, AND with text', () => {
    expect(ids({ groups: { region: ['south'] } }).sort()).toEqual(['gjirokaster', 'ksamil']);
    expect(ids({ groups: { region: ['south', 'north'] } }).sort()).toEqual(['gjirokaster', 'ksamil', 'shkoder', 'theth']);
    expect(ids({ groups: { region: ['south'], experience: ['beach'] } })).toEqual(['ksamil']);
    expect(ids({ groups: { region: ['south', 'north'] }, q: 'thethi' })).toEqual(['theth']);
    expect(ids({ groups: { region: ['central'], experience: ['beach'] } })).toEqual([]);
  });

  it('text matching ignores diacritics and name variants', () => {
    expect(ids({ q: 'Shkodra' })).toEqual(['shkoder']);
    expect(ids({ q: 'gjirokaster' })).toEqual(['gjirokaster']);
  });

  it('sorts (featured default, A–Z)', () => {
    expect(ids({ sort: 'title' })).toEqual(['berat', 'gjirokaster', 'ksamil', 'shkoder', 'theth', 'tirana']);
    expect(ids({ sort: 'featured' }).slice(0, 3)).toEqual(['theth', 'ksamil', 'berat']);
  });

  it('round-trips through the URL and rejects unknown values', () => {
    const state: FilterState = { q: 'old town', groups: { region: ['south', 'north'], experience: ['culture'] }, sort: 'title', bbox: [19, 40, 20.5, 42.1] };
    const params = writeParams(state, dest.groups, dest.defaultSort);
    expect(params.getAll('region')).toEqual(['south', 'north']);
    expect(readState(params, dest.groups, dest.sorts, dest.defaultSort)).toEqual(state);
    const junk = readState(new URLSearchParams('region=mars&experience=culture&sort=evil&bbox=1,2,x,4'), dest.groups, dest.sorts, dest.defaultSort);
    expect(junk).toEqual({ q: '', groups: { experience: ['culture'] }, sort: 'featured', bbox: null });
    expect(writeParams({ ...state, sort: 'featured' }, dest.groups, 'featured').has('sort')).toBe(false);
  });

  it('summarises briefly and counts active filters', () => {
    const s: FilterState = { ...emptyState(), groups: { region: ['south'], experience: ['beach', 'nature'] } };
    expect(summarize(s, dest.groups)).toBe('South · Beach & coast +1');
    expect(activeFilterCount(s)).toBe(3);
    expect(summarize(emptyState(), dest.groups)).toBe('');
  });

  it('only offers groups that can narrow results; hides empty listings’ filters', () => {
    expect(dest.groups.map((g) => g.key)).toEqual(['region', 'experience']);
    expect(dest.groups[0].options.map((o) => o.value)).toEqual(['north', 'central', 'south']); // from real data, no "coast"
    expect(eventListing(content, []).groups).toEqual([]); // no events → no filters
    expect(placeListing(content).groups.map((g) => g.key)).toEqual(['kind']);
    expect(usefulGroups([{ key: 'x', label: 'X', options: [{ value: 'a', label: 'A' }] }], dest.items)).toEqual([]);
  });

  it('guides offer price sorting only when prices are known', () => {
    expect(guideListing(content, null).sorts.map((s) => s.value)).toEqual(['featured']);
    const prices = new Map([['theth-guide', { amountMinor: 900 }], ['albania-explorer', { amountMinor: 1500 }], ['photo-spots-map', { amountMinor: 500 }]]);
    const g = guideListing(content, prices);
    expect(applyFilters(g.items, { ...emptyState(), sort: 'price' }).map((i) => i.id)).toEqual(['photo-spots-map', 'theth-guide', 'albania-explorer']);
    expect(applyFilters(g.items, { ...emptyState(), sort: 'price:desc' }).map((i) => i.id)[0]).toBe('albania-explorer');
  });
});

describe('map data', () => {
  const items = buildMapItems(content, new Date('2026-10-18T00:00:00Z'), { showUnverified: true });

  it('never invents coordinates: places without a location get no pin', () => {
    const places = items.filter((i) => i.kind === 'place');
    expect(places.length).toBe(content.places.length);
    expect(places.every((p) => p.coords === null)).toBe(true);
  });

  it('hides unverified pins when configured for launch', () => {
    const strict = buildMapItems(content, new Date(), { showUnverified: false });
    expect(strict.filter((i) => i.coords)).toEqual([]);
    expect(items.filter((i) => i.coords).every((i) => i.verified === false && i.precision === 'town-centre')).toBe(true);
  });

  it('applies map area together with text and category filters', () => {
    const groups = mapGroups(items);
    expect(groups.map((g) => g.key)).toEqual(['category', 'region']);
    const north: [number, number, number, number] = [19.3, 41.8, 20.2, 42.6];
    const inArea = applyFilters(items, { ...emptyState(), bbox: north }).map((i) => i.title).sort();
    expect(inArea).toEqual(['Shkodër', 'Theth']);
    expect(applyFilters(items, { ...emptyState(), bbox: north, groups: { category: ['culture'] } }).map((i) => i.title)).toEqual(['Shkodër']);
    expect(applyFilters(items, { ...emptyState(), q: 'beach' }).map((i) => i.title).sort()).toEqual(['Gjipe Beach', 'Ksamil']);
  });

  it('public map payload holds no premium or private fields', () => {
    const blob = JSON.stringify(items);
    expect(blob).not.toMatch(/premium|privateObjectKey|externalUrl|priceMinor|guides\/[a-z-]+\/v\d/);
  });
});

describe('trip ids from the map', () => {
  it('stores places with a prefix and never duplicates', () => {
    let t = addDestination(emptyTrip(), 'place:lake-komani').trip;
    expect(addDestination(t, 'place:lake-komani').added).toBe(false);
    t = addDestination(t, 'berat').trip;
    expect(parseTrip(JSON.stringify(t)).trip.days[0].destinationIds).toEqual(['place:lake-komani', 'berat']);
    expect(removeDestination(t, 'place:lake-komani').days[0].destinationIds).toEqual(['berat']);
    expect(parseTrip(JSON.stringify({ version: 1, days: [{ destinationIds: ['evil:x'] }] })).recovered).toBe(true);
  });
});
