import type { AstroCookies } from 'astro';
import { getDb, getProvider, isLiveMode } from '../features/services';
import { canViewOrder, findOrderByReference, getOrderDetail, viewerCookieName } from '../features/commerce/orders';
import { applyFetchedPayment } from '../features/payments/reconcile';
import { currentSession } from './session';

/** Loads an order only for an authorised viewer. The reference in the URL is never enough by itself. */
export async function loadOrderForViewer(ref: string, cookies: AstroCookies) {
  const db = await getDb();
  const order = await findOrderByReference(db, ref);
  if (!order) return null;
  const session = await currentSession(cookies);
  const cookieSecret = cookies.get(viewerCookieName(order.publicReference))?.value;
  const allowed = canViewOrder(order, { cookieSecret, sessionEmail: session?.email, isAdmin: session?.role === 'admin' });
  if (!allowed) return null;
  const detail = (await getOrderDetail(db, order.id))!;
  return { db, order: detail.order, detail, session, viaCookie: Boolean(cookieSecret) && !session };
}

/**
 * While an order is pending, ask the provider (authenticated API) for the current status. This covers
 * "browser returned before the callback". Errors are swallowed: the page just keeps showing "pending".
 */
export async function refreshPendingOrder(detail: NonNullable<Awaited<ReturnType<typeof loadOrderForViewer>>>['detail']) {
  if (detail.order.status === 'paid' || detail.order.status === 'refunded') return false;
  const db = await getDb();
  let provider;
  try {
    provider = await getProvider(db);
  } catch {
    return false;
  }
  let changed = false;
  for (const a of detail.attempts) {
    if (a.provider !== provider.id || !a.providerReference || !['pending', 'authorized'].includes(a.status)) continue;
    try {
      const r = await applyFetchedPayment(db, provider, a.providerReference, isLiveMode());
      if (r.outcome !== 'duplicate_event') changed = true;
    } catch (err) {
      console.warn('[order] status refresh failed', (err as Error).message);
    }
  }
  return changed;
}
