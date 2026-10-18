import { emptyTrip, parseTrip, type SavedTrip } from './model';

export const TRIP_KEY = 'albania-trip:v1';

export type LoadStatus = 'ok' | 'recovered' | 'unavailable';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // access denied (privacy settings, sandboxed iframe)
  }
}

export function loadTrip(storage: StorageLike | null = defaultStorage()): { trip: SavedTrip; status: LoadStatus } {
  if (!storage) return { trip: emptyTrip(), status: 'unavailable' };
  try {
    const { trip, recovered } = parseTrip(storage.getItem(TRIP_KEY));
    return { trip, status: recovered ? 'recovered' : 'ok' };
  } catch {
    return { trip: emptyTrip(), status: 'unavailable' };
  }
}

export function saveTrip(trip: SavedTrip, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(TRIP_KEY, JSON.stringify(trip));
    return true;
  } catch {
    return false; // quota exceeded or denied
  }
}

export function clearTrip(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(TRIP_KEY);
    return true;
  } catch {
    return false;
  }
}
