import type { APIRoute } from 'astro';
import { getDb } from '../../../features/services';
import { listOwnedGuides } from '../../../features/access/downloads';
import { currentSession } from '../../../lib/session';
import { maskEmail } from '../../../lib/crypto';

export const prerender = false;

const PRIVATE = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

/**
 * Guides owned by the buyer signed in on THIS browser (HttpOnly session from checkout or an email
 * access link). Each buyer only ever sees their own; no file locations are returned, only asset ids
 * that /api/downloads checks again.
 */
export const GET: APIRoute = async ({ cookies }) => {
  const session = await currentSession(cookies);
  if (!session || session.role !== 'buyer') return Response.json({ signedIn: false, guides: [] }, { headers: PRIVATE });
  const guides = await listOwnedGuides(await getDb(), session.email);
  return Response.json({ signedIn: true, email: maskEmail(session.email), guides }, { headers: PRIVATE });
};
