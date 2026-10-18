import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { entitlements, productAssets, products } from '../../db/schema';

export interface OwnedGuide {
  productId: string;
  slug: string;
  title: string;
  version: number;
  assets: { id: string; kind: 'pdf' | 'map_link'; label: string }[];
}

/** Guides the buyer currently has access to. Asset targets (keys/URLs) are NOT included. */
export async function listOwnedGuides(db: Db, email: string): Promise<OwnedGuide[]> {
  const ents = await db
    .select({ productId: entitlements.productId })
    .from(entitlements)
    .where(and(eq(entitlements.buyerEmail, email), eq(entitlements.status, 'active')));
  const ids = [...new Set(ents.map((e) => e.productId))];
  if (ids.length === 0) return [];
  const prods = await db.select().from(products).where(inArray(products.id, ids));
  const assets = await db.select().from(productAssets).where(inArray(productAssets.productId, ids)).orderBy(desc(productAssets.version));
  return prods.map((p) => {
    const current = assets.filter((a) => a.productId === p.id && a.version === p.fulfillmentVersion);
    return {
      productId: p.id,
      slug: p.slug,
      title: p.title,
      version: p.fulfillmentVersion,
      assets: current.map((a) => ({ id: a.id, kind: a.kind as 'pdf' | 'map_link', label: a.label })),
    };
  });
}

export type AssetAuthorization =
  | { ok: true; kind: 'pdf'; objectKey: string; filename: string }
  | { ok: true; kind: 'map_link'; url: string }
  | { ok: false; reason: 'not_found' | 'forbidden' };

/** Entitlement check for a single asset: the session email must hold an ACTIVE entitlement for its product. */
export async function authorizeAsset(db: Db, email: string, assetId: string): Promise<AssetAuthorization> {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return { ok: false, reason: 'not_found' };
  const [asset] = await db.select().from(productAssets).where(eq(productAssets.id, assetId));
  if (!asset) return { ok: false, reason: 'not_found' };
  const [ent] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.buyerEmail, email), eq(entitlements.productId, asset.productId), eq(entitlements.status, 'active')))
    .limit(1);
  if (!ent) return { ok: false, reason: 'forbidden' };
  if (asset.kind === 'map_link' && asset.externalUrl) return { ok: true, kind: 'map_link', url: asset.externalUrl };
  if (asset.kind === 'pdf' && asset.privateObjectKey) {
    return { ok: true, kind: 'pdf', objectKey: asset.privateObjectKey, filename: asset.filename ?? `${asset.label}.pdf` };
  }
  return { ok: false, reason: 'not_found' };
}
