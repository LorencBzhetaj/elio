import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import type { Db } from './client';

function migrationsFolder(): string {
  const candidates = [
    path.resolve(process.cwd(), 'src/db/migrations'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations'),
  ];
  const found = candidates.find((p) => fs.existsSync(path.join(p, 'meta', '_journal.json')));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(', ')})`);
  return found;
}

/** Applies committed SQL migrations (drizzle-kit generated). Works for node-postgres and PGlite. */
export async function migrateDb(db: Db, kind: 'pglite' | 'pg'): Promise<void> {
  const folder = migrationsFolder();
  if (kind === 'pglite') {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder: folder });
  } else {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(db as never, { migrationsFolder: folder });
  }
}
