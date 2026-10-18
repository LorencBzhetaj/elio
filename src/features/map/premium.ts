import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { entitlements, premiumPlaces, products } from '../../db/schema';

export interface PremiumPoint {
  id: string;
  title: string;
  note: string | null;
  guide: string;
  coords: [number, number];
}

/** Exact premium locations, ONLY for guides the email holds an active entitlement for. */
export async function listPremiumPoints(db: Db, email: string): Promise<PremiumPoint[]> {
  const owned = await db
    .select({ productId: entitlements.productId })
    .from(entitlements)
    .where(and(eq(entitlements.buyerEmail, email), eq(entitlements.status, 'active')));
  const ids = [...new Set(owned.map((o) => o.productId))];
  if (!ids.length) return [];
  const rows = await db
    .select({ id: premiumPlaces.id, title: premiumPlaces.title, note: premiumPlaces.note, lat: premiumPlaces.lat, lng: premiumPlaces.lng, guide: products.title })
    .from(premiumPlaces)
    .innerJoin(products, eq(products.id, premiumPlaces.productId))
    .where(inArray(premiumPlaces.productId, ids));
  return rows.map((r) => ({ id: `premium:${r.id}`, title: r.title, note: r.note, guide: r.guide, coords: [r.lng, r.lat] }));
}

/** Public preview: how many exact locations a guide includes — a count only, never positions. */
export async function premiumPlaceCount(db: Db, productSlug: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(premiumPlaces)
    .innerJoin(products, eq(products.id, premiumPlaces.productId))
    .where(eq(products.slug, productSlug));
  return row?.n ?? 0;
}
