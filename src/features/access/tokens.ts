import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { accessSessions, accessTokens, entitlements } from '../../db/schema';
import { randomToken, sha256 } from '../../lib/crypto';
import { emailSchema } from '../commerce/orders';
import { enqueueJob } from '../jobs/outbox';

export type Role = 'buyer' | 'admin';

/** Mints a single-use access token. Only the hash is stored; the raw token goes straight into an email. */
export async function mintAccessToken(db: Db, email: string, role: Role, ttlMinutes: number, now = new Date()): Promise<string> {
  const token = randomToken();
  await db.insert(accessTokens).values({
    tokenHash: sha256(token),
    buyerEmail: email,
    role,
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
  });
  return token;
}

/**
 * Requests an access link. Always returns void so the caller can show the same generic message whether
 * or not the address has purchases (prevents revealing buyers). Rate limited to one email per address
 * per 5-minute window via the outbox unique key.
 */
export async function requestAccessLink(db: Db, rawEmail: string, opts: { role: Role; adminEmails?: string[]; now?: Date }): Promise<void> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return;
  const email = parsed.data;
  const now = opts.now ?? new Date();

  if (opts.role === 'admin') {
    if (!opts.adminEmails?.includes(email)) return;
  } else {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(entitlements)
      .where(and(eq(entitlements.buyerEmail, email), eq(entitlements.status, 'active')));
    if (!row || row.n === 0) return;
  }

  const bucket = Math.floor(now.getTime() / (5 * 60_000));
  await enqueueJob(db, {
    uniqueKey: `access-link:${opts.role}:${sha256(email).slice(0, 32)}:${bucket}`,
    type: 'access-link-email',
    payload: { email, role: opts.role },
    maxAttempts: 4,
  });
}

/**
 * Atomically consumes a token (single UPDATE … WHERE consumed_at IS NULL AND not expired).
 * Replays and expired tokens return null.
 */
export async function redeemAccessToken(db: Db, token: string, now = new Date()): Promise<{ email: string; role: Role } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const rows = await db
    .update(accessTokens)
    .set({ consumedAt: now })
    .where(and(eq(accessTokens.tokenHash, sha256(token)), isNull(accessTokens.consumedAt), gt(accessTokens.expiresAt, now)))
    .returning({ email: accessTokens.buyerEmail, role: accessTokens.role });
  return rows[0] ? { email: rows[0].email, role: rows[0].role } : null;
}

export async function createSession(db: Db, email: string, role: Role, ttlDays: number, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + ttlDays * 86_400_000);
  await db.insert(accessSessions).values({ tokenHash: sha256(token), buyerEmail: email, role, expiresAt });
  return { token, expiresAt };
}

export async function getSession(db: Db, token: string | undefined, now = new Date()): Promise<{ id: string; email: string; role: Role } | null> {
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [row] = await db
    .select()
    .from(accessSessions)
    .where(and(eq(accessSessions.tokenHash, sha256(token)), isNull(accessSessions.revokedAt), gt(accessSessions.expiresAt, now)));
  return row ? { id: row.id, email: row.buyerEmail, role: row.role } : null;
}

export async function revokeSession(db: Db, token: string | undefined) {
  if (!token) return;
  await db.update(accessSessions).set({ revokedAt: new Date() }).where(eq(accessSessions.tokenHash, sha256(token)));
}

export const SESSION_COOKIE = 'sid';
