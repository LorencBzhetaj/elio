import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Commerce data model (02-ARCHITECTURE.md). UUID keys, UTC timestamps, integer minor units. */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

export const orderStatus = pgEnum('order_status', ['pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded']);
export const attemptStatus = pgEnum('attempt_status', [
  'created', // row exists, provider not yet called
  'creating', // provider call in flight (serialises checkout creation)
  'pending',
  'authorized',
  'paid',
  'failed',
  'cancelled',
  'expired',
  'refunded',
  'needs_review', // ambiguous provider result; never retried automatically
]);
export const entitlementStatus = pgEnum('entitlement_status', ['active', 'revoked']);
export const jobStatus = pgEnum('job_status', ['pending', 'processing', 'done', 'failed']);
export const sessionRole = pgEnum('session_role', ['buyer', 'admin']);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 120 }).notNull().unique(),
    title: text('title').notNull(),
    active: boolean('active').notNull().default(false),
    currency: varchar('currency', { length: 3 }).notNull(),
    priceMinor: integer('price_minor').notNull(),
    fulfillmentVersion: integer('fulfillment_version').notNull().default(1),
    /** True for seeded test catalogue entries; checkout labels these clearly. */
    isTestProduct: boolean('is_test_product').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('products_price_positive', sql`${t.priceMinor} > 0`),
    check('products_currency_upper', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const productAssets = pgTable(
  'product_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id),
    version: integer('version').notNull(),
    kind: varchar('kind', { length: 20 }).notNull(), // 'pdf' | 'map_link'
    label: text('label').notNull(),
    /** Key in PRIVATE storage. Never a public URL. */
    privateObjectKey: text('private_object_key'),
    /** For kind=map_link: private online map URL, only shown to entitled buyers. */
    externalUrl: text('external_url'),
    filename: text('filename'),
    checksum: text('checksum'),
    createdAt: createdAt(),
  },
  (t) => [
    index('product_assets_product_idx').on(t.productId, t.version),
    check('product_assets_kind', sql`${t.kind} in ('pdf', 'map_link')`),
    check(
      'product_assets_target',
      sql`(${t.kind} = 'pdf' and ${t.privateObjectKey} is not null) or (${t.kind} = 'map_link' and ${t.externalUrl} is not null)`,
    ),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Random, unguessable, but still NOT sufficient on its own to view an order. */
    publicReference: varchar('public_reference', { length: 40 }).notNull().unique(),
    buyerEmail: varchar('buyer_email', { length: 254 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    totalMinor: integer('total_minor').notNull(),
    status: orderStatus('status').notNull().default('pending'),
    idempotencyKey: varchar('idempotency_key', { length: 100 }).notNull().unique(),
    /** sha256 of the HttpOnly cookie secret given to the browser that created the order. */
    viewerSecretHash: varchar('viewer_secret_hash', { length: 64 }).notNull(),
    termsAcceptedAt: ts('terms_accepted_at').notNull(),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    paidAt: ts('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('orders_email_idx').on(t.buyerEmail), check('orders_total_positive', sql`${t.totalMinor} > 0`)],
);

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  titleSnapshot: text('title_snapshot').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  fulfillmentVersion: integer('fulfillment_version').notNull(),
});

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id),
    provider: varchar('provider', { length: 20 }).notNull(),
    providerReference: varchar('provider_reference', { length: 200 }),
    status: attemptStatus('status').notNull().default('created'),
    amountMinor: integer('amount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 100 }).notNull().unique(),
    checkoutUrl: text('checkout_url'),
    livemode: boolean('livemode').notNull(),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payment_attempts_provider_ref_uq').on(t.provider, t.providerReference),
    index('payment_attempts_order_idx').on(t.orderId),
    index('payment_attempts_status_idx').on(t.status, t.updatedAt),
  ],
);

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 20 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 250 }).notNull(),
    providerReference: varchar('provider_reference', { length: 200 }),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
    /** verified | rejected_* | unknown_reference | ignored_* */
    verificationStatus: varchar('verification_status', { length: 40 }).notNull(),
    detail: text('detail'),
    receivedAt: ts('received_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payment_events_dedupe_uq').on(t.provider, t.dedupeKey)],
);

export const entitlements = pgTable(
  'entitlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderItemId: uuid('order_item_id').notNull().unique().references(() => orderItems.id),
    productId: uuid('product_id').notNull().references(() => products.id),
    buyerEmail: varchar('buyer_email', { length: 254 }).notNull(),
    status: entitlementStatus('status').notNull().default('active'),
    grantedAt: ts('granted_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('entitlements_email_idx').on(t.buyerEmail, t.status)],
);

export const accessTokens = pgTable(
  'access_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    buyerEmail: varchar('buyer_email', { length: 254 }).notNull(),
    role: sessionRole('role').notNull().default('buyer'),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('access_tokens_email_idx').on(t.buyerEmail, t.createdAt)],
);

export const accessSessions = pgTable('access_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  buyerEmail: varchar('buyer_email', { length: 254 }).notNull(),
  role: sessionRole('role').notNull().default('buyer'),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
});

export const outboxJobs = pgTable(
  'outbox_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uniqueKey: varchar('unique_key', { length: 200 }).notNull().unique(),
    type: varchar('type', { length: 40 }).notNull(),
    /** Never contains raw tokens or access links: links are minted at send time. */
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    status: jobStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(6),
    nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),
    lockedUntil: ts('locked_until'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('outbox_jobs_due_idx').on(t.status, t.nextAttemptAt)],
);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorEmail: varchar('actor_email', { length: 254 }).notNull(),
  action: varchar('action', { length: 60 }).notNull(),
  targetType: varchar('target_type', { length: 40 }).notNull(),
  targetId: varchar('target_id', { length: 100 }).notNull(),
  details: jsonb('details').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

/** State of the DEVELOPMENT-ONLY mock payment provider (acts as the "remote" side). */
export const mockProviderPayments = pgTable('mock_provider_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerReference: varchar('provider_reference', { length: 200 }).notNull().unique(),
  merchantReference: varchar('merchant_reference', { length: 100 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).notNull().unique(),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  state: varchar('state', { length: 20 }).notNull().default('pending'),
  returnUrl: text('return_url').notNull(),
  cancelUrl: text('cancel_url').notNull(),
  callbackUrl: text('callback_url').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
