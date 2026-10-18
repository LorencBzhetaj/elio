/**
 * Listing filters shared by Destinations, Guides, Photo spots, Events and the Map.
 * Pure functions, used on the server (initial render from the URL) and in the browser.
 *
 * Semantics: text AND groups AND map-area. Inside a group the chosen values are OR-ed.
 */
import { tokens } from '../search/normalize';

export interface FilterOption {
  value: string;
  label: string;
}
export interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
}
export interface SortOption {
  value: string;
  label: string;
}
/** [west, south, east, north] */
export type BBox = [number, number, number, number];

export interface FilterItem {
  id: string;
  /** normalised searchable text (see search/normalize) */
  text: string;
  facets: Record<string, string[]>;
  sort?: Record<string, string | number>;
  /** [lng, lat] when the item has a public map location */
  coords?: [number, number] | null;
}

export interface FilterState {
  q: string;
  groups: Record<string, string[]>;
  sort: string;
  bbox: BBox | null;
}

export function emptyState(sort = ''): FilterState {
  return { q: '', groups: {}, sort, bbox: null };
}

export function inBBox(coords: [number, number], [w, s, e, n]: BBox): boolean {
  const [lng, lat] = coords;
  return lat >= s && lat <= n && (w <= e ? lng >= w && lng <= e : lng >= w || lng <= e);
}

export function matches(item: FilterItem, state: FilterState): boolean {
  const terms = tokens(state.q);
  if (terms.length && !terms.every((t) => item.text.includes(t))) return false;
  for (const [key, selected] of Object.entries(state.groups)) {
    if (!selected.length) continue;
    const values = item.facets[key] ?? [];
    if (!selected.some((v) => values.includes(v))) return false;
  }
  if (state.bbox) {
    if (!item.coords || !inBBox(item.coords, state.bbox)) return false;
  }
  return true;
}

export function applyFilters<T extends FilterItem>(items: T[], state: FilterState): T[] {
  const out = items.filter((i) => matches(i, state));
  if (state.sort) {
    const [field, dir] = state.sort.split(':');
    const sign = dir === 'desc' ? -1 : 1;
    out.sort((a, b) => {
      const av = a.sort?.[field];
      const bv = b.sort?.[field];
      if (av === undefined && bv === undefined) return 0;
      if (av === undefined) return 1; // missing values last
      if (bv === undefined) return -1;
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * sign;
    });
  }
  return out;
}

export function activeFilterCount(state: FilterState): number {
  return Object.values(state.groups).reduce((n, v) => n + v.length, 0) + (state.bbox ? 1 : 0);
}

/** "South · Beach +1" — short, never a list of pills. */
export function summarize(state: FilterState, groups: FilterGroup[], max = 2): string {
  const labels: string[] = [];
  for (const g of groups) for (const v of state.groups[g.key] ?? []) labels.push(g.options.find((o) => o.value === v)?.label ?? v);
  if (state.bbox) labels.push('Map area');
  if (!labels.length) return '';
  return labels.slice(0, max).join(' · ') + (labels.length > max ? ` +${labels.length - max}` : '');
}

/** Reads state from the URL, keeping only known groups/values (repeated params: ?region=south&region=north). */
export function readState(params: URLSearchParams, groups: FilterGroup[], sorts: SortOption[] = [], defaultSort = ''): FilterState {
  const state = emptyState(defaultSort);
  state.q = (params.get('q') ?? '').slice(0, 100);
  for (const g of groups) {
    const allowed = new Set(g.options.map((o) => o.value));
    const values = params.getAll(g.key).flatMap((v) => v.split(',')).filter((v) => allowed.has(v));
    if (values.length) state.groups[g.key] = [...new Set(values)];
  }
  const sort = params.get('sort');
  if (sort && sorts.some((s) => s.value === sort)) state.sort = sort;
  const bbox = params.get('bbox')?.split(',').map(Number);
  if (bbox?.length === 4 && bbox.every(Number.isFinite) && bbox[1] < bbox[3]) state.bbox = bbox as BBox;
  return state;
}

export function writeParams(state: FilterState, groups: FilterGroup[], defaultSort = '', base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of ['q', 'sort', 'bbox', ...groups.map((g) => g.key)]) p.delete(k);
  if (state.q.trim()) p.set('q', state.q.trim());
  for (const g of groups) for (const v of state.groups[g.key] ?? []) p.append(g.key, v);
  if (state.sort && state.sort !== defaultSort) p.set('sort', state.sort);
  if (state.bbox) p.set('bbox', state.bbox.map((n) => n.toFixed(4)).join(','));
  return p;
}

/** Only offer groups that can actually narrow the list (≥ 2 values present in the data). */
export function usefulGroups(groups: FilterGroup[], items: FilterItem[]): FilterGroup[] {
  return groups
    .map((g) => ({ ...g, options: g.options.filter((o) => items.some((i) => (i.facets[g.key] ?? []).includes(o.value))) }))
    .filter((g) => g.options.length >= 2);
}
