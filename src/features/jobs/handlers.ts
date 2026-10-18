import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { orderItems, orders } from '../../db/schema';
import { mintAccessToken, type Role } from '../access/tokens';
import { renderEmail, type EmailTransport } from './email';
import type { JobHandler, JobType } from './outbox';

export interface HandlerDeps {
  db: Db;
  transport: EmailTransport;
  siteUrl: string;
  brand: string;
  accessTtlMinutes: number;
  ownerEmail?: string;
}

/**
 * Access links are minted at SEND time, so raw tokens are never stored in the outbox.
 * A retry mints a fresh link; older unused links simply expire.
 */
export function createJobHandlers(deps: HandlerDeps): Record<JobType, JobHandler> {
  const { db, transport, siteUrl, brand, accessTtlMinutes } = deps;
  const link = (token: string) => new URL(`/access/redeem?token=${encodeURIComponent(token)}`, siteUrl).href;
  const recoverUrl = new URL('/access', siteUrl).href;

  return {
    'purchase-email': async (payload) => {
      const orderId = String(payload.orderId);
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) throw new Error('order not found');
      if (order.status !== 'paid') return; // refunded before sending: nothing to deliver
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const token = await mintAccessToken(db, order.buyerEmail, 'buyer', accessTtlMinutes);
      const titles = items.map((i) => i.titleSnapshot).join(', ');
      const { html, text } = renderEmail({
        brand,
        heading: 'Your guide is ready',
        paragraphs: [
          `Thank you for your purchase (${order.publicReference}): ${titles}.`,
          `Use the button below to open My guides. For your security this link works once and expires in ${accessTtlMinutes} minutes.`,
          `If it has expired, request a new link any time at ${recoverUrl} using this email address.`,
        ],
        action: { label: 'Open my guides', url: link(token) },
        footer: 'You received this email because this address was used to buy a digital guide. Never share this link.',
      });
      await transport.send({ to: order.buyerEmail, subject: `Your guide is ready — ${titles}`, html, text });
    },

    'access-link-email': async (payload) => {
      const email = String(payload.email);
      const role = (payload.role === 'admin' ? 'admin' : 'buyer') as Role;
      const token = await mintAccessToken(db, email, role, accessTtlMinutes);
      const { html, text } = renderEmail({
        brand,
        heading: role === 'admin' ? 'Admin sign-in link' : 'Your access link',
        paragraphs: [
          `This link works once and expires in ${accessTtlMinutes} minutes.`,
          'If you did not request it, you can ignore this email.',
        ],
        action: { label: role === 'admin' ? 'Sign in to admin' : 'Open my guides', url: link(token) },
        footer: 'Never share this link.',
      });
      await transport.send({ to: email, subject: role === 'admin' ? 'Admin sign-in link' : 'Your access link', html, text });
    },

    'owner-alert': async (payload) => {
      if (!deps.ownerEmail) {
        console.warn('[owner-alert] OWNER_ALERT_EMAIL not configured', { kind: payload.kind });
        return;
      }
      const { html, text } = renderEmail({
        brand,
        heading: `Action needed: ${String(payload.kind)}`,
        paragraphs: [JSON.stringify(payload, null, 2), 'Review it in the admin orders dashboard.'],
        action: { label: 'Open admin', url: new URL('/admin/orders', siteUrl).href },
        footer: 'Automated operational alert.',
      });
      await transport.send({ to: deps.ownerEmail, subject: `[${brand}] Alert: ${String(payload.kind)}`, html, text });
    },
  };
}
