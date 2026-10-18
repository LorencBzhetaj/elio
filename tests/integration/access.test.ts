import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/db/client';
import { accessTokens, outboxJobs } from '../../src/db/schema';
import { createSession, getSession, mintAccessToken, redeemAccessToken, requestAccessLink, revokeSession } from '../../src/features/access/tokens';
import { authorizeAsset, listOwnedGuides } from '../../src/features/access/downloads';
import { signLocalFile, verifyLocalFileSignature, assertSafeKey } from '../../src/features/access/storage';
import { applyFetchedPayment } from '../../src/features/payments/reconcile';
import { checkoutFor, seedProducts, setupDb, SECRET } from '../helpers';

let db: Db;
let close: () => Promise<void>;
let assets: Awaited<ReturnType<typeof seedProducts>>;

beforeAll(async () => {
  ({ db, close } = await setupDb());
  assets = await seedProducts(db);
});
afterAll(() => close());

async function buy(email: string, slug = 'theth-guide') {
  const { provider, ref } = await checkoutFor(db, email, slug);
  await provider.simulate(ref, 'paid');
  await applyFetchedPayment(db, provider, ref, false);
  return { provider, ref };
}

describe('access tokens', () => {
  it('are single use (replay fails)', async () => {
    const t = await mintAccessToken(db, 'a@example.com', 'buyer', 15);
    expect(await redeemAccessToken(db, t)).toEqual({ email: 'a@example.com', role: 'buyer' });
    expect(await redeemAccessToken(db, t)).toBeNull();
  });

  it('expire', async () => {
    const t = await mintAccessToken(db, 'b@example.com', 'buyer', 15, new Date(Date.now() - 20 * 60_000));
    expect(await redeemAccessToken(db, t)).toBeNull();
  });

  it('only stores hashes', async () => {
    const t = await mintAccessToken(db, 'c@example.com', 'buyer', 15);
    const rows = await db.select().from(accessTokens);
    expect(rows.some((r) => r.tokenHash === t)).toBe(false);
  });

  it('concurrent redemption of one token succeeds once', async () => {
    const t = await mintAccessToken(db, 'race@example.com', 'buyer', 15);
    const results = await Promise.all([1, 2, 3].map(() => redeemAccessToken(db, t)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('rejects malformed tokens without querying', async () => {
    expect(await redeemAccessToken(db, "' or 1=1 --")).toBeNull();
  });
});

describe('access link requests', () => {
  it('only queue an email for real buyers, and at most once per 5-minute window', async () => {
    await buy('owner-of-guide@example.com');
    const now = new Date();
    await requestAccessLink(db, 'owner-of-guide@example.com', { role: 'buyer', now });
    await requestAccessLink(db, 'OWNER-of-guide@example.com', { role: 'buyer', now });
    await requestAccessLink(db, 'nobody@example.com', { role: 'buyer', now });
    const jobs = (await db.select().from(outboxJobs).where(eq(outboxJobs.type, 'access-link-email'))).map((j) => j.payload.email);
    expect(jobs.filter((e) => e === 'owner-of-guide@example.com')).toHaveLength(1);
    expect(jobs).not.toContain('nobody@example.com');
  });

  it('admin links only go to configured admin emails', async () => {
    await requestAccessLink(db, 'intruder@example.com', { role: 'admin', adminEmails: ['owner@example.com'] });
    await requestAccessLink(db, 'owner@example.com', { role: 'admin', adminEmails: ['owner@example.com'] });
    const jobs = (await db.select().from(outboxJobs).where(eq(outboxJobs.type, 'access-link-email'))).map((j) => j.payload);
    expect(jobs.some((p) => p.email === 'intruder@example.com')).toBe(false);
    expect(jobs.some((p) => p.email === 'owner@example.com' && p.role === 'admin')).toBe(true);
  });
});

describe('sessions and assets', () => {
  it('buyer A cannot access buyer B’s product', async () => {
    await buy('alice@example.com', 'theth-guide');
    await buy('bob@example.com', 'albania-explorer');
    expect((await authorizeAsset(db, 'alice@example.com', assets.thethPdf.id)).ok).toBe(true);
    expect(await authorizeAsset(db, 'alice@example.com', assets.otherPdf.id)).toEqual({ ok: false, reason: 'forbidden' });
    expect(await authorizeAsset(db, 'bob@example.com', assets.thethPdf.id)).toEqual({ ok: false, reason: 'forbidden' });
    const owned = await listOwnedGuides(db, 'alice@example.com');
    expect(owned.map((g) => g.slug)).toEqual(['theth-guide']);
    expect(JSON.stringify(owned)).not.toContain('guides/theth'); // no object keys leak to the UI
  });

  it('refunded purchase loses access', async () => {
    const { provider, ref } = await buy('refunded@example.com');
    expect((await authorizeAsset(db, 'refunded@example.com', assets.thethPdf.id)).ok).toBe(true);
    await provider.simulate(ref, 'refunded');
    await applyFetchedPayment(db, provider, ref, false);
    expect((await authorizeAsset(db, 'refunded@example.com', assets.thethPdf.id)).ok).toBe(false);
  });

  it('sessions expire and can be revoked', async () => {
    const s = await createSession(db, 's@example.com', 'buyer', 7);
    expect((await getSession(db, s.token))?.email).toBe('s@example.com');
    expect(await getSession(db, s.token, new Date(Date.now() + 8 * 86_400_000))).toBeNull();
    await revokeSession(db, s.token);
    expect(await getSession(db, s.token)).toBeNull();
  });
});

describe('signed download URLs', () => {
  it('expire and cannot be altered', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signLocalFile(SECRET, 'guides/theth/v1.pdf', 'theth.pdf', exp);
    expect(verifyLocalFileSignature(SECRET, 'guides/theth/v1.pdf', 'theth.pdf', exp, sig)).toBe(true);
    expect(verifyLocalFileSignature(SECRET, 'guides/explorer/v1.pdf', 'theth.pdf', exp, sig)).toBe(false);
    expect(verifyLocalFileSignature(SECRET, 'guides/theth/v1.pdf', 'theth.pdf', exp + 600, sig)).toBe(false);
    expect(verifyLocalFileSignature(SECRET, 'guides/theth/v1.pdf', 'theth.pdf', exp, sig, Date.now() + 61_000)).toBe(false);
  });

  it('reject path traversal keys', () => {
    expect(() => assertSafeKey('../.env')).toThrow();
    expect(() => assertSafeKey('guides/../../secret')).toThrow();
    expect(() => assertSafeKey('guides/theth/v1.pdf')).not.toThrow();
  });
});
