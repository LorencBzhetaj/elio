import type { AstroCookies } from 'astro';
import { adminEmails } from '../config/env';
import { currentSession } from './session';

/**
 * Owner/support access: a session created from an ADMIN magic link AND an email that is still listed in
 * ADMIN_EMAILS (removing an email revokes access immediately). No passwords are stored.
 * For production, additionally place /admin behind a maintained identity layer (e.g. Cloudflare Access,
 * an SSO proxy) — see docs/admin-guide.md.
 */
export async function requireAdmin(cookies: AstroCookies): Promise<{ email: string } | null> {
  const s = await currentSession(cookies);
  if (!s || s.role !== 'admin' || !adminEmails().includes(s.email)) return null;
  return { email: s.email };
}
