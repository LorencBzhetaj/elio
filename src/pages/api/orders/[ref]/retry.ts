import type { APIRoute } from 'astro';
import { loadOrderForViewer } from '../../../../lib/order-access';
import { createRetryAttempt, startCheckout } from '../../../../features/commerce/orders';
import { CommerceError } from '../../../../features/commerce/errors';
import { getProvider, isLiveMode, serverEnv } from '../../../../features/services';

export const prerender = false;

/** Starts a new payment attempt for a failed/cancelled/expired order. Price stays the order's price. */
export const POST: APIRoute = async ({ params, cookies, redirect }) => {
  const loaded = await loadOrderForViewer(params.ref ?? '', cookies);
  if (!loaded) return redirect('/access', 303);
  try {
    const provider = await getProvider(loaded.db);
    const attemptId = await createRetryAttempt(loaded.db, loaded.order.id, { provider: provider.id, livemode: isLiveMode() });
    const { checkoutUrl } = await startCheckout(loaded.db, provider, attemptId, { siteUrl: serverEnv().SITE_URL });
    return redirect(checkoutUrl, 303);
  } catch (err) {
    if (!(err instanceof CommerceError)) console.error('[retry] unexpected', (err as Error).message);
    return redirect(`/order/${loaded.order.publicReference}`, 303);
  }
};
