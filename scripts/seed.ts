/**
 * Seeds the TEST catalogue (explicit test-only prices) and placeholder private PDFs.
 * Refuses to run in production. Usage: npm run db:seed
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/db/client';
import { migrateDb } from '../src/db/migrate';
import { premiumPlaces, productAssets, products } from '../src/db/schema';
import { serverEnv } from '../src/config/env';
import { placeholderPdf } from '../src/features/access/placeholder-pdf';

const env = serverEnv();
if (env.APP_ENV === 'production') {
  console.error('Refusing to seed test products in production.');
  process.exit(1);
}


// TEST prices only — final prices/currency are an open owner decision.
const catalogue = [
  { slug: 'photo-spots-map', title: 'Photo Spots Map', priceMinor: 500, currency: 'USD' },
  { slug: 'theth-guide', title: 'Theth Guide', priceMinor: 900, currency: 'USD' },
  { slug: 'albania-explorer', title: 'Albania Explorer', priceMinor: 1500, currency: 'USD' },
];

const { db, kind, close } = await createDb(env.DATABASE_URL);
await migrateDb(db, kind);

for (const item of catalogue) {
  let [p] = await db.select().from(products).where(eq(products.slug, item.slug));
  if (!p) {
    [p] = await db.insert(products).values({ ...item, active: true, isTestProduct: true }).returning();
    console.info(`+ product ${item.slug}`);
  }
  const key = `guides/${item.slug}/v1-placeholder.pdf`;
  const existing = await db.select().from(productAssets).where(eq(productAssets.productId, p.id));
  if (existing.length === 0) {
    const pdf = placeholderPdf(item.title);
    if (env.STORAGE_DRIVER === 'local') {
      const full = path.resolve(env.PRIVATE_STORAGE_DIR, key);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, pdf);
    } else {
      console.warn(`  upload ${key} to the private bucket manually (STORAGE_DRIVER=s3)`);
    }
    await db.insert(productAssets).values([
      {
        productId: p.id,
        version: 1,
        kind: 'pdf',
        label: `${item.title} (placeholder PDF)`,
        privateObjectKey: key,
        filename: `${item.slug}-placeholder.pdf`,
        checksum: createHash('sha256').update(pdf).digest('hex'),
      },
    ]);
    console.info(`  + placeholder asset ${key}`);
  }
}
// TEST premium locations for the Theth Guide, to exercise the buyer-only map layer.
// Clearly labelled; replace with the real guide locations (see docs/admin-guide.md).
const [theth] = await db.select().from(products).where(eq(products.slug, 'theth-guide'));
if (theth && (await db.select().from(premiumPlaces).where(eq(premiumPlaces.productId, theth.id))).length === 0) {
  await db.insert(premiumPlaces).values([
    { productId: theth.id, title: 'TEST premium point A', note: 'Placeholder — not a real location', lat: 42.401, lng: 19.781 },
    { productId: theth.id, title: 'TEST premium point B', note: 'Placeholder — not a real location', lat: 42.389, lng: 19.769 },
  ]);
  console.info('  + 2 TEST premium points (theth-guide)');
}
console.info('Seed complete (test catalogue).');
await close();
