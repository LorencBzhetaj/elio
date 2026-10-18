import type { CatalogPrice } from '../features/commerce/catalog';

/**
 * Loads display prices for on-demand pages. If the commerce DB is unreachable the public page still
 * renders (without prices) instead of failing; checkout always re-reads the product itself.
 */
export async function loadDisplayPrices(): Promise<Map<string, CatalogPrice> | null> {
  try {
    const [{ getDb }, { getActivePrices }] = await Promise.all([import('../db/client'), import('../features/commerce/catalog')]);
    return await getActivePrices(await getDb());
  } catch (err) {
    console.warn('[prices] unavailable:', (err as Error).message);
    return null;
  }
}
