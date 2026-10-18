/**
 * Browser helper so every "Save to my trip" control (cards, map, list) shows the same state.
 * Changes are broadcast in this tab (`trip:change`) and picked up from other tabs (`storage`).
 */
import { addDestination, findDestination, removeDestination } from './model';
import { loadTrip, saveTrip, TRIP_KEY } from './storage';

export const TRIP_EVENT = 'trip:change';

export function isSaved(id: string): boolean {
  return findDestination(loadTrip().trip, id) !== null;
}

export function savedDay(id: string): number | null {
  return findDestination(loadTrip().trip, id)?.day ?? null;
}

export function storageAvailable(): boolean {
  return loadTrip().status !== 'unavailable';
}

/** Adds (to day 1) or removes. Never creates duplicates. Returns the new saved state, or null if storage failed. */
export function toggleSaved(id: string): boolean | null {
  const { trip, status } = loadTrip();
  if (status === 'unavailable') return null;
  const saved = findDestination(trip, id) !== null;
  const next = saved ? removeDestination(trip, id) : addDestination(trip, id, 0).trip;
  if (!saveTrip(next)) return null;
  window.dispatchEvent(new CustomEvent(TRIP_EVENT, { detail: { id, saved: !saved } }));
  return !saved;
}

export function onTripChange(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === TRIP_KEY || e.key === null) cb();
  };
  window.addEventListener(TRIP_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(TRIP_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}
