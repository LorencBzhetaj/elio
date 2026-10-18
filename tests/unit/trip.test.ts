import { describe, expect, it } from 'vitest';
import {
  addDay, addDestination, emptyTrip, moveDestination, moveToDay, parseTrip, removeDay, removeDestination,
  setDayCount, setStartDate, unknownDestinations, MAX_DAYS,
} from '../../src/features/trip/model';
import { loadTrip, saveTrip, TRIP_KEY } from '../../src/features/trip/storage';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('trip model', () => {
  it('adds without duplicates', () => {
    let t = emptyTrip(2);
    t = addDestination(t, 'theth', 0).trip;
    const again = addDestination(t, 'theth', 1);
    expect(again.added).toBe(false);
    expect(again.day).toBe(0);
    expect(t.days.flatMap((d) => d.destinationIds)).toEqual(['theth']);
  });

  it('reorders within a day and across day boundaries', () => {
    let t = emptyTrip(2);
    t = addDestination(t, 'a', 0).trip;
    t = addDestination(t, 'b', 0).trip;
    t = moveDestination(t, 'b', -1);
    expect(t.days[0].destinationIds).toEqual(['b', 'a']);
    t = moveDestination(t, 'a', 1); // last of day 1 → first of day 2
    expect(t.days[1].destinationIds).toEqual(['a']);
    expect(moveDestination(t, 'b', -1)).toBe(t); // already first overall: no-op
  });

  it('moves to a chosen day, removes, and keeps places when a day is removed', () => {
    let t = emptyTrip(3);
    t = addDestination(t, 'x', 2).trip;
    t = moveToDay(t, 'x', 1);
    expect(t.days[1].destinationIds).toEqual(['x']);
    t = removeDay(t, 1);
    expect(t.days).toHaveLength(2);
    expect(t.days[0].destinationIds).toEqual(['x']);
    t = removeDestination(t, 'x');
    expect(t.days.flatMap((d) => d.destinationIds)).toEqual([]);
  });

  it('sets sequential dates and changes day count safely', () => {
    let t = setStartDate(emptyTrip(3), '2026-12-31');
    expect(t.days.map((d) => d.date)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
    t = addDay(t);
    expect(t.days[3].date).toBe('2027-01-03');
    t = addDestination(t, 'late', 3).trip;
    t = setDayCount(t, 2);
    expect(t.days).toHaveLength(2);
    expect(t.days[1].destinationIds).toContain('late');
    expect(setDayCount(t, 999).days).toHaveLength(MAX_DAYS);
  });

  it('reports outdated destination ids', () => {
    let t = addDestination(emptyTrip(), 'gone').trip;
    t = addDestination(t, 'theth').trip;
    expect(unknownDestinations(t, new Set(['theth']))).toEqual(['gone']);
  });
});

describe('trip storage', () => {
  it('recovers from corrupt JSON and wrong shapes without throwing', () => {
    for (const bad of ['{not json', '{"version":2,"days":[]}', '{"version":1,"days":[{"destinationIds":["<script>"]}]}', '[]']) {
      const s = memory();
      s.setItem(TRIP_KEY, bad);
      const r = loadTrip(s);
      expect(r.status).toBe('recovered');
      expect(r.trip).toEqual(emptyTrip());
    }
  });

  it('handles storage that throws (denied) and quota errors', () => {
    const denied = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
    expect(loadTrip(denied).status).toBe('unavailable');
    expect(saveTrip(emptyTrip(), denied)).toBe(false);
    expect(loadTrip(null).status).toBe('unavailable');
  });

  it('round-trips and de-duplicates hand-edited data', () => {
    const s = memory();
    s.setItem(TRIP_KEY, JSON.stringify({ version: 1, days: [{ destinationIds: ['a', 'a'] }, { destinationIds: ['a', 'b'] }] }));
    expect(loadTrip(s).trip.days.map((d) => d.destinationIds)).toEqual([['a'], ['b']]);
    expect(parseTrip(undefined).recovered).toBe(false);
  });
});
