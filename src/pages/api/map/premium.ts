import type { APIRoute } from 'astro';
import { getDb } from '../../../features/services';
import { listPremiumPoints } from '../../../features/map/premium';
import { currentSession } from '../../../lib/session';

export const prerender = false;

const PRIVATE = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

/** Exact guide locations for the signed-in buyer only. Never cached publicly. */
export const GET: APIRoute = async ({ cookies }) => {
  const session = await currentSession(cookies);
  if (!session) return Response.json({ error: 'sign_in_required' }, { status: 401, headers: PRIVATE });
  const points = await listPremiumPoints(await getDb(), session.email);
  return Response.json({ points }, { headers: PRIVATE });
};
