import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * Database access. `DATABASE_URL=postgres://…` uses node-postgres (staging/production).
 * `DATABASE_URL=pglite:<dir>` or `pglite:memory` uses embedded PGlite (real Postgres in-process)
 * for zero-setup local development and tests. Production config validation rejects pglite.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbKind = 'pglite' | 'pg';

let dbPromise: Promise<Db> | undefined;

export async function createDb(url: string): Promise<{ db: Db; kind: DbKind; close: () => Promise<void> }> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const target = url.slice('pglite:'.length);
    if (target !== 'memory') {
      const [{ mkdirSync }, { dirname }] = await Promise.all([import('node:fs'), import('node:path')]);
      mkdirSync(dirname(target), { recursive: true });
    }
    const client = target === 'memory' ? new PGlite() : new PGlite(target);
    const db = drizzle(client, { schema }) as unknown as Db;
    return { db, kind: 'pglite', close: () => client.close() };
  }
  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const pool = new pg.default.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema }) as unknown as Db;
  return { db, kind: 'pg', close: () => pool.end() };
}

export async function getDb(): Promise<Db> {
  if (!dbPromise) {
    const { serverEnv } = await import('../config/env');
    dbPromise = createDb(serverEnv().DATABASE_URL).then(async ({ db, kind }) => {
      if (kind === 'pglite') {
        // Local dev convenience: keep the embedded database migrated automatically.
        const { migrateDb } = await import('./migrate');
        await migrateDb(db, kind);
      }
      return db;
    });
    dbPromise.catch(() => {
      dbPromise = undefined;
    });
  }
  return dbPromise;
}

/** Tests inject their own database. */
export function setDbForTests(db: Db) {
  dbPromise = Promise.resolve(db);
}

export { schema };
