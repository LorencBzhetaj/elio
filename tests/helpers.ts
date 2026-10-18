import { createDb, type Db } from '../src/db/client';
import { migrateDb } from '../src/db/migrate';
import { products, productAssets } from '../src/db/schema';
import { createMockProvider } from '../src/features/payments/mock';
import { createOrder, startCheckout } from '../src/features/commerce/orders';
import { eq, sql } from 'drizzle-orm';
import { paymentAttempts } from '../src/db/schema';

export const SECRET = 'test-secret-test-secret-test-secret-123';
export const SITE = 'http://localhost:4321';

/**
 * Fresh, migrated database per test file. Uses TEST_DATABASE_URL (real PostgreSQL, e.g. from
 * docker-compose) when set; otherwise in-process PGlite.
 */
export async function setupDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const url = process.env.TEST_DATABASE_URL ?? 'pglite:memory';
  const { db, kind, close } = await createDb(url);
  if (kind === 'pg') {
    await db.execute(sql.raw('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;'));
  }
  await migrateDb(db, kind);
  return { db, close };
}

export async function seedProducts(db: Db) {
  const [theth] = await db
    .insert(products)
    .values({ slug: 'theth-guide', title: 'Theth Guide', active: true, currency: 'USD', priceMinor: 900, isTestProduct: true })
    .returning();
  const [inactive] = await db
    .insert(products)
    .values({ slug: 'retired-guide', title: 'Retired', active: false, currency: 'USD', priceMinor: 500, isTestProduct: true })
    .returning();
  const [other] = await db
    .insert(products)
    .values({ slug: 'albania-explorer', title: 'Albania Explorer', active: true, currency: 'USD', priceMinor: 1500, isTestProduct: true })
    .returning();
  const [thethPdf] = await db
    .insert(productAssets)
    .values({ productId: theth.id, version: 1, kind: 'pdf', label: 'Theth Guide PDF', privateObjectKey: 'guides/theth/v1.pdf', filename: 'theth-guide.pdf' })
    .returning();
  const [otherPdf] = await db
    .insert(productAssets)
    .values({ productId: other.id, version: 1, kind: 'pdf', label: 'Explorer PDF', privateObjectKey: 'guides/explorer/v1.pdf', filename: 'explorer.pdf' })
    .returning();
  return { theth, inactive, other, thethPdf, otherPdf };
}

export function mockProvider(db: Db) {
  return createMockProvider({ db, secret: SECRET, siteUrl: SITE });
}

let n = 0;
export const idem = () => `test-idempotency-key-${Date.now()}-${n++}`;

/** Creates an order and starts mock checkout; returns ids and the provider reference. */
export async function checkoutFor(db: Db, email = 'buyer@example.com', productSlug = 'theth-guide') {
  const provider = mockProvider(db);
  const order = await createOrder(db, { productSlug, email, idempotencyKey: idem(), termsAccepted: true }, { provider: 'mock', livemode: false });
  await startCheckout(db, provider, order.attemptId, { siteUrl: SITE });
  const ref = await findRef(db, order.attemptId);
  return { provider, order, ref };
}

async function findRef(db: Db, attemptId: string): Promise<string> {
  const [a] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId));
  return a.providerReference!;
}
