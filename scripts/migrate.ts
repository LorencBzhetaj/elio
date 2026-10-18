/** Applies committed migrations to DATABASE_URL. Usage: npm run db:migrate */
import { createDb } from '../src/db/client';
import { migrateDb } from '../src/db/migrate';
import { serverEnv } from '../src/config/env';

const { db, kind, close } = await createDb(serverEnv().DATABASE_URL);
await migrateDb(db, kind);
console.info(`Migrations applied (${kind}).`);
await close();
