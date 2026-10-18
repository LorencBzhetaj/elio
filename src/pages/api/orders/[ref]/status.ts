import type { APIRoute } from 'astro';
import { loadOrderForViewer, refreshPendingOrder } from '../../../../lib/order-access';
import { findOrderByReference } from '../../../../features/commerce/orders';
import { deliverQueuedEmailsInDev } from '../../../../lib/dev-mail';

export const prerender = false;

/** First-party status for the return page. Requires the viewer cookie or a buyer session. */
export const GET: APIRoute = async ({ params, cookies }) => {
  const loaded = await loadOrderForViewer(params.ref ?? '', cookies);
  if (!loaded) return Response.json({ error: 'not_found' }, { status: 404 });
  let status = loaded.order.status;
  if (status === 'pending' && (await refreshPendingOrder(loaded.detail))) {
    status = (await findOrderByReference(loaded.db, loaded.order.publicReference))!.status;
    await deliverQueuedEmailsInDev();
  }
  return Response.json({ status }, { headers: { 'Cache-Control': 'no-store' } });
};
