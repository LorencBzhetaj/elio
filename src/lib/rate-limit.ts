/**
 * Small in-memory fixed-window limiter for abuse protection on public forms (per process).
 * Per-email limits that must survive restarts are enforced in the database (see requestAccessLink).
 * Behind several instances, put a shared limiter (reverse proxy / WAF) in front as well.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return true;
  }
  b.count++;
  return b.count <= max;
}
