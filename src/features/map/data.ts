import type { ContentBundle, ImageRef } from '../content/schemas';
import { normalize } from '../search/normalize';
import { experiencesOf } from '../filters/listings';
import { usefulGroups, type FilterGroup, type FilterItem } from '../filters/core';
import { upcomingEvents } from '../content/events';

/**
 * Public map data, built from published CMS content only (never from the commerce DB).
 * Items without a public location are returned with `coords: null` and are listed, not plotted.
 * Premium guide locations are served separately by /api/map/premium after an entitlement check.
 */
export const MAP_CATEGORIES = [
  { value: 'destinations', label: 'Destinations' },
  { value: 'beaches', label: 'Beaches' },
  { value: 'nature', label: 'Nature' },
  { value: 'culture', label: 'Culture' },
  { value: 'photo-spots', label: 'Photo spots' },
  { value: 'events', label: 'Events' },
] as const;

const catLabel = (v: string) => MAP_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export interface MapItem extends FilterItem {
  kind: 'destination' | 'place' | 'event';
  title: string;
  category: string;
  summary: string;
  url: string;
  image: { src?: string; alt: string; scene: ImageRef['scene'] };
  /** id used by the saved trip, or null if it cannot be saved */
  tripId: string | null;
  precision?: 'exact' | 'town-centre' | 'area';
  verified?: boolean;
  destination?: string;
}

function showUnverified(): boolean {
  const v = (typeof process !== 'undefined' ? process.env.PUBLIC_MAP_SHOW_UNVERIFIED : undefined) ?? (import.meta as { env?: Record<string, string> }).env?.PUBLIC_MAP_SHOW_UNVERIFIED;
  return v !== 'false';
}

export function buildMapItems(c: ContentBundle, now = new Date(), opts = { showUnverified: showUnverified() }): MapItem[] {
  const dest = new Map(c.destinations.map((d) => [d.slug, d]));
  const img = (i: ImageRef) => ({ ...(i.src ? { src: i.src } : {}), alt: i.alt, scene: i.scene });
  const usable = (loc?: { lat: number; lng: number; verified: boolean }) => (loc && (loc.verified || opts.showUnverified) ? loc : null);

  const items: MapItem[] = [];
  for (const d of c.destinations) {
    const loc = usable(d.location);
    const exp = experiencesOf(d);
    const categories = ['destinations', ...(exp.includes('beach') ? ['beaches'] : []), ...(exp.includes('nature') ? ['nature'] : []), ...(exp.includes('culture') || exp.includes('city') ? ['culture'] : [])];
    items.push({
      id: `destination:${d.slug}`,
      kind: 'destination',
      title: d.title,
      category: d.kicker,
      summary: d.summary,
      url: `/destinations/${d.slug}`,
      image: img(d.cover),
      tripId: d.slug,
      coords: loc ? [loc.lng, loc.lat] : null,
      precision: d.location?.precision,
      verified: d.location?.verified,
      text: normalize([d.title, ...d.aliases, d.kicker, d.summary, ...d.highlights, ...categories.map(catLabel)].join(' ')),
      facets: { category: categories, region: [d.region] },
      sort: { title: d.title },
    });
  }
  for (const p of c.places) {
    const loc = p.coordinates ? { ...p.coordinates, verified: p.verified } : undefined;
    const d = dest.get(p.destinationSlug ?? '');
    const usableLoc = usable(loc);
    items.push({
      id: `place:${p.slug}`,
      kind: 'place',
      title: p.title,
      category: p.kind === 'beach' ? 'Beach' : 'Photo spot',
      summary: p.summary,
      url: `/photo-spots/${p.slug}`,
      image: img(p.cover),
      tripId: `place:${p.slug}`,
      coords: usableLoc ? [usableLoc.lng, usableLoc.lat] : null,
      precision: 'exact',
      verified: p.verified,
      destination: d?.title,
      text: normalize([p.title, ...p.aliases, p.summary, d?.title ?? '', 'photo spot', p.kind === 'beach' ? 'beach' : ''].join(' ')),
      facets: { category: ['photo-spots', ...(p.kind === 'beach' ? ['beaches'] : [])], region: d ? [d.region] : [] },
      sort: { title: p.title },
    });
  }
  for (const e of upcomingEvents(c.events, now)) {
    const d = dest.get(e.destinationSlug ?? '');
    // Only events with their own location are plotted; we never place an event at a town centre by guess.
    const loc = usable(e.location);
    items.push({
      id: `event:${e.slug}`,
      kind: 'event',
      title: e.title,
      category: 'Event',
      summary: e.summary,
      url: `/events#${e.slug}`,
      image: img(d?.cover ?? { alt: e.title, scene: 'city', rights: 'placeholder' }),
      tripId: null,
      coords: loc ? [loc.lng, loc.lat] : null,
      precision: e.location?.precision,
      verified: e.location?.verified,
      destination: d?.title,
      text: normalize([e.title, e.summary, e.venue ?? '', d?.title ?? ''].join(' ')),
      facets: { category: ['events'], region: d ? [d.region] : [] },
      sort: { title: e.title },
    });
  }
  return items;
}

const REGION_LABEL: Record<string, string> = { north: 'North', central: 'Central', south: 'South', coast: 'Coast' };

export function mapGroups(items: MapItem[]): FilterGroup[] {
  return usefulGroups(
    [
      { key: 'category', label: 'Category', options: MAP_CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
      { key: 'region', label: 'Region', options: Object.entries(REGION_LABEL).map(([value, label]) => ({ value, label })) },
    ],
    items,
  );
}

/** Albania, roughly: used for the initial view. */
export const ALBANIA_BOUNDS: [number, number, number, number] = [19.1, 39.6, 21.1, 42.7];
