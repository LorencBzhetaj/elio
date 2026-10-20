import type { APIRoute } from 'astro';
import { getDb, getStorage, serverEnv } from '../../../features/services';
import { authorizeAsset } from '../../../features/access/downloads';
import { currentSession } from '../../../lib/session';

export const prerender = false;

/**
 * Entitlement check, then a 303 to a short-lived signed URL (60 s by default).
 * `?inline=1` asks for in-browser display (the viewer in My trip) instead of a download.
 */
export const GET: APIRoute = async ({ params, cookies, redirect, url }) => {
  const session = await currentSession(cookies);
  if (!session) return redirect('/access', 303);
  const auth = await authorizeAsset(await getDb(), session.email, params.assetId ?? '');
  if (!auth.ok) return redirect('/my-trip?error=download#guides', 303);
  if (auth.kind === 'map_link') return redirect(auth.url, 303);
  try {
    const storage = await getStorage();
    const signed = await storage.signedDownloadUrl(auth.objectKey, auth.filename, serverEnv().DOWNLOAD_URL_TTL_SECONDS, {
      inline: url.searchParams.get('inline') === '1',
    });
    return redirect(signed, 303);
  } catch (err) {
    console.error('[download] signing failed', (err as Error).message);
    return redirect('/my-trip?error=download#guides', 303);
  }
};
