import { z } from 'zod';

/**
 * Saved trip MVP: an ordered list of days, each an ordered list of destination slugs.
 * No routing, travel-time or optimisation logic — by design.
 */
export const MAX_DAYS = 30;
export const MAX_PER_DAY = 40;

/** A destination slug, or `place:<slug>` for a photo spot / place. */
const slug = z.string().regex(/^(?:place:)?[a-z0-9]+(?:-[a-z0-9]+)*$/).max(130);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const savedTripSchema = z.object({
  version: z.literal(1),
  days: z
    .array(z.object({ date: isoDate.optional(), destinationIds: z.array(slug).max(MAX_PER_DAY) }))
    .min(1)
    .max(MAX_DAYS),
});
export type SavedTrip = z.infer<typeof savedTripSchema>;

export const emptyTrip = (days = 1): SavedTrip => ({ version: 1, days: Array.from({ length: Math.max(1, Math.min(days, MAX_DAYS)) }, () => ({ destinationIds: [] })) });

const clone = (t: SavedTrip): SavedTrip => ({ version: 1, days: t.days.map((d) => ({ ...d, destinationIds: [...d.destinationIds] })) });

/** Parses untrusted storage. Corrupt data yields an empty trip plus a `recovered` flag — never a crash. */
export function parseTrip(raw: unknown): { trip: SavedTrip; recovered: boolean } {
  if (raw === null || raw === undefined || raw === '') return { trip: emptyTrip(), recovered: false };
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { trip: emptyTrip(), recovered: true };
    }
  }
  const parsed = savedTripSchema.safeParse(value);
  if (!parsed.success) return { trip: emptyTrip(), recovered: true };
  // Remove duplicates that could only come from manual edits.
  const seen = new Set<string>();
  const trip = clone(parsed.data);
  for (const day of trip.days) day.destinationIds = day.destinationIds.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  return { trip, recovered: false };
}

export function findDestination(trip: SavedTrip, id: string): { day: number; index: number } | null {
  for (let day = 0; day < trip.days.length; day++) {
    const index = trip.days[day].destinationIds.indexOf(id);
    if (index >= 0) return { day, index };
  }
  return null;
}

/** Adding a destination that is already saved is a no-op (reported via `added: false`). */
export function addDestination(trip: SavedTrip, id: string, dayIndex = 0): { trip: SavedTrip; added: boolean; day: number } {
  const existing = findDestination(trip, id);
  if (existing) return { trip, added: false, day: existing.day };
  const next = clone(trip);
  const day = Math.max(0, Math.min(dayIndex, next.days.length - 1));
  if (next.days[day].destinationIds.length >= MAX_PER_DAY) return { trip, added: false, day };
  next.days[day].destinationIds.push(slug.parse(id));
  return { trip: next, added: true, day };
}

export function removeDestination(trip: SavedTrip, id: string): SavedTrip {
  const next = clone(trip);
  for (const d of next.days) d.destinationIds = d.destinationIds.filter((x) => x !== id);
  return next;
}

/** Moves a destination up (-1) or down (+1); crossing a day boundary moves it to the adjacent day. */
export function moveDestination(trip: SavedTrip, id: string, delta: -1 | 1): SavedTrip {
  const pos = findDestination(trip, id);
  if (!pos) return trip;
  const next = clone(trip);
  const list = next.days[pos.day].destinationIds;
  const target = pos.index + delta;
  if (target >= 0 && target < list.length) {
    [list[pos.index], list[target]] = [list[target], list[pos.index]];
    return next;
  }
  const dayTarget = pos.day + delta;
  if (dayTarget < 0 || dayTarget >= next.days.length) return trip;
  list.splice(pos.index, 1);
  if (delta === 1) next.days[dayTarget].destinationIds.unshift(id);
  else next.days[dayTarget].destinationIds.push(id);
  return next;
}

export function moveToDay(trip: SavedTrip, id: string, dayIndex: number): SavedTrip {
  if (dayIndex < 0 || dayIndex >= trip.days.length) return trip;
  const next = removeDestination(trip, id);
  next.days[dayIndex].destinationIds.push(id);
  return next;
}

export function addDay(trip: SavedTrip): SavedTrip {
  if (trip.days.length >= MAX_DAYS) return trip;
  const next = clone(trip);
  const last = next.days[next.days.length - 1];
  next.days.push({ destinationIds: [], ...(last.date ? { date: shiftDate(last.date, 1) } : {}) });
  return next;
}

/** Removing a day keeps its destinations by moving them to the previous (or next) day. */
export function removeDay(trip: SavedTrip, dayIndex: number): SavedTrip {
  if (trip.days.length <= 1 || dayIndex < 0 || dayIndex >= trip.days.length) return trip;
  const next = clone(trip);
  const [removed] = next.days.splice(dayIndex, 1);
  const into = Math.max(0, dayIndex - 1);
  next.days[into].destinationIds.push(...removed.destinationIds);
  return next;
}

/** Sets day 1's date and fills following days sequentially. Pass null to clear dates. */
export function setStartDate(trip: SavedTrip, date: string | null): SavedTrip {
  const next = clone(trip);
  next.days.forEach((d, i) => {
    if (date && isoDate.safeParse(date).success) d.date = shiftDate(date, i);
    else delete d.date;
  });
  return next;
}

/** Changes the number of days; destinations from removed days move into the new last day. */
export function setDayCount(trip: SavedTrip, count: number): SavedTrip {
  const target = Math.max(1, Math.min(Math.floor(count) || 1, MAX_DAYS));
  let next = clone(trip);
  while (next.days.length < target) next = addDay(next);
  while (next.days.length > target) next = removeDay(next, next.days.length - 1);
  return next;
}

export function unknownDestinations(trip: SavedTrip, known: Set<string>): string[] {
  return trip.days.flatMap((d) => d.destinationIds).filter((id) => !known.has(id));
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
