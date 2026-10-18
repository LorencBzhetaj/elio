import type { APIRoute } from 'astro';
import { getDb, getStorage, serverEnv } from '../../../features/services';
import { authorizeAsset } from '../../../features/access/downloads';
import { currentSession } from '../../../lib/session';

export const prerender = false;

/** Entitlement check, then a 303 to a short-lived signed URL (60 s by default). */
export const GET: APIRoute = async ({ params, cookies, redirect }) => {
  const session = await currentSession(cookies);
  if (!session) return redirect('/access', 303);
  const auth = await authorizeAsset(await getDb(), session.email, params.assetId ?? '');
  if (!auth.ok) return redirect('/my-guides?error=download', 303);
  if (auth.kind === 'map_link') return redirect(auth.url, 303);
  try {
    const storage = await getStorage();
    const url = await storage.signedDownloadUrl(auth.objectKey, auth.filename, serverEnv().DOWNLOAD_URL_TTL_SECONDS);
    return redirect(url, 303);
  } catch (err) {
    console.error('[download] signing failed', (err as Error).message);
    return redirect('/my-guides?error=download', 303);
  }
};
