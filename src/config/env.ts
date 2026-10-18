import { z } from 'zod';

/**
 * Server-only configuration. Validated lazily so that public, prerendered pages can build
 * without commerce secrets. Never import this module from client scripts.
 */
const schema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    SITE_URL: z.url().default('http://localhost:4321'),
    DATABASE_URL: z.string().min(1).default('pglite:./.data/pglite'),
    APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
    PAYMENT_PROVIDER: z.enum(['mock', 'paysera', 'pok']).default('mock'),
    PREVIEW_ACCESS_KEY: z.string().optional(),
    ADMIN_EMAILS: z.string().default(''),
    OWNER_ALERT_EMAIL: z.string().optional(),
    EMAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
    EMAIL_FROM: z.string().default('Albania travel guides <no-reply@example.invalid>'),
    SMTP_URL: z.string().optional(),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    PRIVATE_STORAGE_DIR: z.string().default('./storage/private'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    ACCESS_LINK_TTL_MINUTES: z.coerce.number().int().min(5).max(60 * 24).default(15),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
    SANITY_WEBHOOK_SECRET: z.string().optional(),
    BUILD_HOOK_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'production' && env.PAYMENT_PROVIDER === 'mock') {
      ctx.addIssue({ code: 'custom', path: ['PAYMENT_PROVIDER'], message: 'Mock payments are disabled in production.' });
    }
    if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_URL'], message: 'SMTP_URL is required when EMAIL_TRANSPORT=smtp.' });
    }
    if (env.STORAGE_DRIVER === 's3' && !env.S3_BUCKET) {
      ctx.addIssue({ code: 'custom', path: ['S3_BUCKET'], message: 'S3_BUCKET is required when STORAGE_DRIVER=s3.' });
    }
    if (env.APP_ENV === 'production' && env.DATABASE_URL.startsWith('pglite:')) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Use a managed PostgreSQL database in production.' });
    }
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;
let dotEnvLoaded = false;

/** Loads `.env` for local dev and scripts. Real environment variables always win. */
export function loadDotEnvOnce() {
  if (dotEnvLoaded) return;
  dotEnvLoaded = true;
  if (process.env.APP_ENV === 'test') return;
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file: rely on the process environment.
  }
}

export function serverEnv(): ServerEnv {
  if (!cached) {
    loadDotEnvOnce();
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid server configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests only. */
export function setServerEnvForTests(overrides: Partial<ServerEnv>): ServerEnv {
  cached = schema.parse({
    APP_SECRET: 'test-secret-test-secret-test-secret-123',
    APP_ENV: 'test',
    ...overrides,
  });
  return cached;
}

export function adminEmails(): string[] {
  return serverEnv()
    .ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isLiveMode(): boolean {
  return serverEnv().APP_ENV === 'production';
}
