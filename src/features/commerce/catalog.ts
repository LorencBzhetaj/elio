import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { products } from '../../db/schema';

export interface CatalogPrice {
  slug: string;
  title: string;
  amountMinor: number;
  currency: string;
  isTestProduct: boolean;
}

/** Authoritative prices for active products. Display only; checkout always re-reads the product. */
export async function getActivePrices(db: Db): Promise<Map<string, CatalogPrice>> {
  const rows = await db.select().from(products).where(eq(products.active, true));
  return new Map(
    rows.map((p) => [p.slug, { slug: p.slug, title: p.title, amountMinor: p.priceMinor, currency: p.currency, isTestProduct: p.isTestProduct }]),
  );
}

export async function getActiveProductBySlug(db: Db, slug: string) {
  const [row] = await db.select().from(products).where(and(eq(products.slug, slug), eq(products.active, true)));
  return row;
}
