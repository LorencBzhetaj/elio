import type { APIRoute } from 'astro';
import { loadOrderForViewer } from '../../../../lib/order-access';
import { createSession } from '../../../../features/access/tokens';
import { serverEnv } from '../../../../config/env';
import { setSessionCookie } from '../../../../lib/session';

export const prerender = false;

const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Immediate access after a VERIFIED payment, for the same browser that placed the order (viewer cookie).
 * Limited to 24 h after payment; afterwards the buyer uses the email access link.
 */
export const POST: APIRoute = async ({ params, cookies, redirect }) => {
  const loaded = await loadOrderForViewer(params.ref ?? '', cookies);
  if (!loaded) return redirect('/access', 303);
  const { order, db } = loaded;
  if (order.status !== 'paid' || !order.paidAt || Date.now() - order.paidAt.getTime() > CLAIM_WINDOW_MS) {
    return redirect(order.status === 'paid' ? '/access' : `/order/${order.publicReference}`, 303);
  }
  const s = await createSession(db, order.buyerEmail, 'buyer', serverEnv().SESSION_TTL_DAYS);
  setSessionCookie(cookies, s.token, s.expiresAt);
  return redirect('/my-guides', 303);
};
