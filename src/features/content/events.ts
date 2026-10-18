import type { TravelEvent } from './schemas';

export const EVENT_TZ = 'Europe/Tirane';

/** Offset (minutes) of Europe/Tirane at a given UTC instant, via Intl (handles DST). */
function tzOffsetMinutes(at: Date, timeZone = EVENT_TZ): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Midnight at the START of a calendar date in Europe/Tirane, as a UTC instant. */
export function tiraneMidnight(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offset = tzOffsetMinutes(guess);
  const first = new Date(guess.getTime() - offset * 60000);
  // Re-check in case the offset changed across the guess (DST boundary).
  const offset2 = tzOffsetMinutes(first);
  return offset2 === offset ? first : new Date(guess.getTime() - offset2 * 60000);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The instant an event stops being "upcoming".
 * - Timed events: their end (or start) instant.
 * - All-day / date-only events: midnight Europe/Tirane at the end of the last day.
 */
export function eventEndsAt(e: Pick<TravelEvent, 'start' | 'end' | 'allDay'>): Date {
  const last = e.end ?? e.start;
  if (e.allDay || DATE_ONLY.test(last)) return tiraneMidnight(addDays(last.slice(0, 10), 1));
  return new Date(last);
}

export function isUpcoming(e: Pick<TravelEvent, 'start' | 'end' | 'allDay'>, now: Date = new Date()): boolean {
  return eventEndsAt(e).getTime() > now.getTime();
}

export function upcomingEvents<T extends Pick<TravelEvent, 'start' | 'end' | 'allDay'>>(events: T[], now: Date = new Date()): T[] {
  return events.filter((e) => isUpcoming(e, now)).sort((a, b) => a.start.localeCompare(b.start));
}

export function formatEventDate(e: Pick<TravelEvent, 'start' | 'end' | 'allDay'>): string {
  const fmt = (v: string) => {
    const d = DATE_ONLY.test(v) ? tiraneMidnight(v) : new Date(v);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: EVENT_TZ,
      day: 'numeric', month: 'short', year: 'numeric',
      ...(e.allDay || DATE_ONLY.test(v) ? {} : { hour: '2-digit', minute: '2-digit' }),
    }).format(d);
  };
  return e.end && e.end !== e.start ? `${fmt(e.start)} – ${fmt(e.end)}` : fmt(e.start);
}
