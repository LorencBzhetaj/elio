import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256 = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');

/** 256-bit URL-safe random token. Only its hash is ever stored. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Unguessable public order reference, e.g. "AL-7KQ2…". */
export const publicReference = () => `AL-${randomBytes(12).toString('base64url').replace(/[-_]/g, '').slice(0, 14).toUpperCase()}`;

export const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Masks emails for logs: "an***@ex***.com". Never log full emails, tokens or links. */
export function maskEmail(email: string): string {
  const [user, domain = ''] = email.split('@');
  const [host, ...tld] = domain.split('.');
  return `${user.slice(0, 2)}***@${host.slice(0, 2)}***.${tld.join('.')}`;
}
