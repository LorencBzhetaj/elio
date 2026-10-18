import type { AstroCookies } from 'astro';
import { getDb } from '../db/client';
import { serverEnv } from '../config/env';
import { getSession, SESSION_COOKIE } from '../features/access/tokens';

export const secureCookies = () => serverEnv().SITE_URL.startsWith('https://');

export async function currentSession(cookies: AstroCookies) {
  return getSession(await getDb(), cookies.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(cookies: AstroCookies, token: string, expiresAt: Date) {
  cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: '/', expires: expiresAt });
}
