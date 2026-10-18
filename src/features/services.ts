import { getDb, type Db } from '../db/client';
import { adminEmails, isLiveMode, serverEnv } from '../config/env';
import { site } from '../config/site';
import type { PaymentProvider } from './payments/contract';
import { createMockProvider } from './payments/mock';
import { createPayseraProvider } from './payments/paysera';
import { createPokProvider } from './payments/pok';
import { createLocalStorage, createS3Storage, type PrivateStorage } from './access/storage';
import { createConsoleTransport, createSmtpTransport, type EmailTransport } from './jobs/email';
import { createJobHandlers } from './jobs/handlers';

/** Runtime composition root for server routes, the worker and scripts. */
export async function getProvider(db?: Db): Promise<PaymentProvider & Partial<ReturnType<typeof createMockProvider>>> {
  const env = serverEnv();
  switch (env.PAYMENT_PROVIDER) {
    case 'mock':
      if (isLiveMode()) throw new Error('Mock payments are disabled in production.');
      return createMockProvider({ db: db ?? (await getDb()), secret: env.APP_SECRET, siteUrl: env.SITE_URL });
    case 'paysera':
      return createPayseraProvider();
    case 'pok':
      return createPokProvider();
  }
}

let storage: Promise<PrivateStorage> | undefined;
export function getStorage(): Promise<PrivateStorage> {
  const env = serverEnv();
  storage ??=
    env.STORAGE_DRIVER === 's3'
      ? createS3Storage({
          bucket: env.S3_BUCKET!,
          region: env.S3_REGION,
          endpoint: env.S3_ENDPOINT,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        })
      : Promise.resolve(createLocalStorage({ dir: env.PRIVATE_STORAGE_DIR, secret: env.APP_SECRET, siteUrl: env.SITE_URL }));
  return storage;
}

export function getLocalStorage() {
  const env = serverEnv();
  return createLocalStorage({ dir: env.PRIVATE_STORAGE_DIR, secret: env.APP_SECRET, siteUrl: env.SITE_URL });
}

let transport: Promise<EmailTransport> | undefined;
export function getTransport(): Promise<EmailTransport> {
  const env = serverEnv();
  transport ??= env.EMAIL_TRANSPORT === 'smtp' ? createSmtpTransport(env.SMTP_URL!, env.EMAIL_FROM) : Promise.resolve(createConsoleTransport());
  return transport;
}

export async function getJobHandlers() {
  const env = serverEnv();
  return createJobHandlers({
    db: await getDb(),
    transport: await getTransport(),
    siteUrl: env.SITE_URL,
    brand: process.env.PUBLIC_BRAND_NAME || site.brandName,
    accessTtlMinutes: env.ACCESS_LINK_TTL_MINUTES,
    ownerEmail: env.OWNER_ALERT_EMAIL,
  });
}

export { getDb, serverEnv, adminEmails, isLiveMode };
