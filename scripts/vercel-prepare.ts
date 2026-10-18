/**
 * Runs before `astro build` on Vercel (package.json "vercel-build").
 *  - No PostgreSQL DATABASE_URL → design preview: nothing to do (shop routes show a notice).
 *  - PostgreSQL + non-production → apply migrations and the TEST catalogue (seed refuses production).
 *  - PostgreSQL + production → apply migrations only.
 */
const url = process.env.DATABASE_URL ?? '';
const appEnv = process.env.APP_ENV ?? 'development';

if (!/^postgres(ql)?:\/\//.test(url)) {
  console.info('[vercel-prepare] No PostgreSQL DATABASE_URL — building a design preview without the shop.');
} else if (appEnv === 'production') {
  console.info('[vercel-prepare] Applying migrations (production, no seed).');
  await import('./migrate');
} else {
  console.info(`[vercel-prepare] Applying migrations and TEST catalogue (APP_ENV=${appEnv}).`);
  await import('./seed');
}

export {};
