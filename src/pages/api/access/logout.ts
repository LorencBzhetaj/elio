import type { APIRoute } from 'astro';
import { getDb } from '../../../features/services';
import { revokeSession, SESSION_COOKIE } from '../../../features/access/tokens';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, redirect }) => {
  await revokeSession(await getDb(), cookies.get(SESSION_COOKIE)?.value);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/', 303);
};
