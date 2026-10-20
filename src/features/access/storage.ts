import fs from 'node:fs';
import path from 'node:path';
import { hmac, safeEqual } from '../../lib/crypto';

/**
 * Private guide storage. Premium files NEVER live in /public or in the static build.
 * - local: files under PRIVATE_STORAGE_DIR, served only through /api/files with a short-lived HMAC URL.
 * - s3: private bucket, short-lived presigned GET URLs.
 */
export interface PrivateStorage {
  /** inline = show in the browser (embedded viewer) instead of downloading. */
  signedDownloadUrl(objectKey: string, filename: string, ttlSeconds: number, opts?: { inline?: boolean }): Promise<string>;
}

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,200}$/i;
export function assertSafeKey(key: string) {
  if (!KEY_RE.test(key) || key.includes('..')) throw new Error('Invalid object key');
}

export function signLocalFile(secret: string, key: string, filename: string, expires: number): string {
  return hmac(secret, `file:${key}:${filename}:${expires}`);
}

export function verifyLocalFileSignature(secret: string, key: string, filename: string, expires: number, sig: string, now = Date.now()): boolean {
  if (!Number.isFinite(expires) || expires * 1000 < now) return false;
  return safeEqual(sig, signLocalFile(secret, key, filename, expires));
}

export function createLocalStorage(opts: { dir: string; secret: string; siteUrl: string }): PrivateStorage & { resolve(key: string): string } {
  const root = path.resolve(opts.dir);
  return {
    async signedDownloadUrl(objectKey, filename, ttlSeconds, display = {}) {
      assertSafeKey(objectKey);
      const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
      const sig = signLocalFile(opts.secret, objectKey, filename, expires);
      const url = new URL('/api/files', opts.siteUrl);
      url.searchParams.set('key', objectKey);
      url.searchParams.set('name', filename);
      url.searchParams.set('exp', String(expires));
      url.searchParams.set('sig', sig);
      if (display.inline) url.searchParams.set('inline', '1'); // affects display only, not access
      return url.pathname + url.search;
    },
    resolve(key: string) {
      assertSafeKey(key);
      const full = path.resolve(root, key);
      if (!full.startsWith(root + path.sep)) throw new Error('Invalid object key');
      if (!fs.existsSync(full)) throw new Error('File not found');
      return full;
    },
  };
}

export async function createS3Storage(opts: { bucket: string; region?: string; endpoint?: string; accessKeyId?: string; secretAccessKey?: string }): Promise<PrivateStorage> {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    region: opts.region ?? 'auto',
    endpoint: opts.endpoint,
    forcePathStyle: Boolean(opts.endpoint),
    credentials: opts.accessKeyId && opts.secretAccessKey ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } : undefined,
  });
  return {
    async signedDownloadUrl(objectKey, filename, ttlSeconds, display = {}) {
      assertSafeKey(objectKey);
      const cmd = new GetObjectCommand({
        Bucket: opts.bucket,
        Key: objectKey,
        ResponseContentDisposition: `${display.inline ? 'inline' : 'attachment'}; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
        ResponseCacheControl: 'no-store',
      });
      return getSignedUrl(client, cmd, { expiresIn: ttlSeconds });
    },
  };
}
