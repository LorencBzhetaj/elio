import type { ContentBundle, Destination } from '../content/schemas';
import { normalize } from '../search/normalize';
import { usefulGroups, type FilterGroup, type FilterItem, type SortOption } from './core';

/** Filter definitions per listing. Groups are derived from the data, so empty/unhelpful ones disappear. */

const REGION_LABEL: Record<string, string> = { north: 'North', central: 'Central', south: 'South', coast: 'Coast' };

/** Experience categories, mapped from the existing destination `types`. */
export const EXPERIENCES = [
  { value: 'beach', label: 'Beach & coast', types: ['coast'] },
  { value: 'nature', label: 'Nature & mountains', types: ['mountains', 'nature', 'lake'] },
  { value: 'culture', label: 'Culture & history', types: ['historic-town'] },
  { value: 'city', label: 'City', types: ['city'] },
] as const;

export function experiencesOf(d: Destination): string[] {
  return EXPERIENCES.filter((e) => e.types.some((t) => (d.types as string[]).includes(t))).map((e) => e.value);
}

const regionGroup = (values: string[]): FilterGroup => ({
  key: 'region',
  label: 'Region',
  options: ['north', 'central', 'south', 'coast'].filter((r) => values.includes(r)).map((r) => ({ value: r, label: REGION_LABEL[r] })),
});

export function destinationListing(c: ContentBundle) {
  const items: FilterItem[] = c.destinations.map((d, i) => ({
    id: d.slug,
    text: normalize([d.title, ...d.aliases, d.kicker, d.summary, ...d.highlights].join(' ')),
    facets: { region: [d.region], experience: experiencesOf(d) },
    sort: { featured: (d.featured ? 0 : 1) * 1000 + i, title: d.title },
  }));
  const groups = usefulGroups(
    [regionGroup(c.destinations.map((d) => d.region)), { key: 'experience', label: 'Experience', options: EXPERIENCES.map(({ value, label }) => ({ value, label })) }],
    items,
  );
  const sorts: SortOption[] = [
    { value: 'featured', label: 'Recommended' },
    { value: 'title', label: 'A–Z' },
  ];
  return { items, groups, sorts, defaultSort: 'featured' };
}

export function guideListing(c: ContentBundle, prices: Map<string, { amountMinor: number }> | null) {
  const dest = new Map(c.destinations.map((d) => [d.slug, d]));
  const items: FilterItem[] = c.guides.map((g, i) => ({
    id: g.slug,
    text: normalize([g.title, g.subtitle, g.summary, ...g.contents.map((x) => x.title), ...g.destinationSlugs.map((s) => dest.get(s)?.title ?? '')].join(' ')),
    facets: { region: [...new Set(g.destinationSlugs.map((s) => dest.get(s)?.region).filter(Boolean) as string[])] },
    sort: { featured: i, ...(prices?.get(g.productSlug) ? { price: prices.get(g.productSlug)!.amountMinor } : {}) },
  }));
  const groups = usefulGroups([regionGroup(c.destinations.map((d) => d.region))], items);
  const sorts: SortOption[] = [{ value: 'featured', label: 'Recommended' }];
  if (prices && items.some((i) => i.sort?.price !== undefined)) {
    sorts.push({ value: 'price', label: 'Price: low to high' }, { value: 'price:desc', label: 'Price: high to low' });
  }
  return { items, groups, sorts, defaultSort: 'featured' };
}

const PLACE_KIND: Record<string, string> = { 'photo-spot': 'Photo spot', viewpoint: 'Viewpoint', beach: 'Beach', landmark: 'Landmark' };

export function placeListing(c: ContentBundle) {
  const dest = new Map(c.destinations.map((d) => [d.slug, d]));
  const items: FilterItem[] = c.places.map((p) => ({
    id: p.slug,
    text: normalize([p.title, ...p.aliases, p.summary, PLACE_KIND[p.kind], dest.get(p.destinationSlug ?? '')?.title ?? ''].join(' ')),
    facets: { kind: [p.kind], region: dest.get(p.destinationSlug ?? '') ? [dest.get(p.destinationSlug!)!.region] : [] },
  }));
  const groups = usefulGroups(
    [
      { key: 'kind', label: 'Type of place', options: Object.entries(PLACE_KIND).map(([value, label]) => ({ value, label })) },
      regionGroup(c.destinations.map((d) => d.region)),
    ],
    items,
  );
  return { items, groups, sorts: [] as SortOption[], defaultSort: '' };
}

export function eventListing(c: ContentBundle, upcoming: ContentBundle['events']) {
  const dest = new Map(c.destinations.map((d) => [d.slug, d]));
  const items: FilterItem[] = upcoming.map((e) => ({
    id: e.slug,
    text: normalize([e.title, e.summary, e.venue ?? '', dest.get(e.destinationSlug ?? '')?.title ?? ''].join(' ')),
    facets: { destination: e.destinationSlug ? [e.destinationSlug] : [] },
    sort: { date: e.start },
  }));
  const groups = usefulGroups(
    [{ key: 'destination', label: 'Destination', options: c.destinations.map((d) => ({ value: d.slug, label: d.title })) }],
    items,
  );
  return { items, groups, sorts: [] as SortOption[], defaultSort: 'date' };
}
