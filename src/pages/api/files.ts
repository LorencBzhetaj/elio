import type { APIRoute } from 'astro';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { getLocalStorage, serverEnv } from '../../features/services';
import { verifyLocalFileSignature } from '../../features/access/storage';
import { placeholderPdf, placeholderTitleForKey } from '../../features/access/placeholder-pdf';

export const prerender = false;

/** Serves a private file from local storage for a valid, unexpired HMAC-signed URL (local driver only). */
export const GET: APIRoute = async ({ url }) => {
  const env = serverEnv();
  if (env.STORAGE_DRIVER !== 'local') return new Response('Not found', { status: 404 });
  const key = url.searchParams.get('key') ?? '';
  const name = url.searchParams.get('name') ?? 'guide.pdf';
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';
  if (!verifyLocalFileSignature(env.APP_SECRET, key, name, exp, sig)) {
    return new Response('This download link has expired. Return to My guides to get a fresh one.', { status: 403 });
  }
  const headers = {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"`,
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  };
  let path: string;
  try {
    path = getLocalStorage().resolve(key);
  } catch {
    // Test previews (e.g. Vercel) have no stored files: generate the seeded TEST placeholder on the fly.
    // Never in production, and only for placeholder keys; the signed URL was already verified above.
    const title = env.APP_ENV !== 'production' ? placeholderTitleForKey(key) : null;
    if (title) {
      const pdf = placeholderPdf(title);
      return new Response(new Uint8Array(pdf), { headers: { ...headers, 'Content-Length': String(pdf.length) } });
    }
    return new Response('File not available', { status: 404 });
  }
  const stat = fs.statSync(path);
  const body = Readable.toWeb(fs.createReadStream(path)) as ReadableStream;
  return new Response(body, { headers: { ...headers, 'Content-Length': String(stat.size) } });
};
