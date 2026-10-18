import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client';
import { premiumPlaces } from '../../src/db/schema';
import { listPremiumPoints, premiumPlaceCount } from '../../src/features/map/premium';
import { applyFetchedPayment } from '../../src/features/payments/reconcile';
import { checkoutFor, seedProducts, setupDb } from '../helpers';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDb());
  const { theth } = await seedProducts(db);
  await db.insert(premiumPlaces).values([
    { productId: theth.id, title: 'Secret viewpoint', lat: 42.4, lng: 19.78 },
    { productId: theth.id, title: 'Hidden pool', lat: 42.39, lng: 19.77 },
  ]);
});
afterAll(() => close());

async function buy(email: string, slug = 'theth-guide') {
  const { provider, ref } = await checkoutFor(db, email, slug);
  await provider.simulate(ref, 'paid');
  await applyFetchedPayment(db, provider, ref, false);
  return { provider, ref };
}

describe('premium map locations', () => {
  it('are returned only to buyers of that guide', async () => {
    expect(await listPremiumPoints(db, 'nobody@example.com')).toEqual([]);
    await buy('explorer-only@example.com', 'albania-explorer');
    expect(await listPremiumPoints(db, 'explorer-only@example.com')).toEqual([]);
    await buy('theth-buyer@example.com');
    const pts = await listPremiumPoints(db, 'theth-buyer@example.com');
    expect(pts.map((p) => p.title).sort()).toEqual(['Hidden pool', 'Secret viewpoint']);
    expect(pts[0].coords).toHaveLength(2);
  });

  it('disappear after a refund', async () => {
    const { provider, ref } = await buy('refund-map@example.com');
    expect(await listPremiumPoints(db, 'refund-map@example.com')).toHaveLength(2);
    await provider.simulate(ref, 'refunded');
    await applyFetchedPayment(db, provider, ref, false);
    expect(await listPremiumPoints(db, 'refund-map@example.com')).toEqual([]);
  });

  it('the public preview is a count, never positions', async () => {
    expect(await premiumPlaceCount(db, 'theth-guide')).toBe(2);
    expect(await premiumPlaceCount(db, 'albania-explorer')).toBe(0);
  });
});
