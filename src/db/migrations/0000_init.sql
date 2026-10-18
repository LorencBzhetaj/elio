CREATE TYPE "public"."attempt_status" AS ENUM('created', 'creating', 'pending', 'authorized', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."entitlement_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."session_role" AS ENUM('buyer', 'admin');--> statement-breakpoint
CREATE TABLE "access_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"buyer_email" varchar(254) NOT NULL,
	"role" "session_role" DEFAULT 'buyer' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"buyer_email" varchar(254) NOT NULL,
	"role" "session_role" DEFAULT 'buyer' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" varchar(254) NOT NULL,
	"action" varchar(60) NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" varchar(100) NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"buyer_email" varchar(254) NOT NULL,
	"status" "entitlement_status" DEFAULT 'active' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "entitlements_order_item_id_unique" UNIQUE("order_item_id")
);
--> statement-breakpoint
CREATE TABLE "mock_provider_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_reference" varchar(200) NOT NULL,
	"merchant_reference" varchar(100) NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"state" varchar(20) DEFAULT 'pending' NOT NULL,
	"return_url" text NOT NULL,
	"cancel_url" text NOT NULL,
	"callback_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_provider_payments_provider_reference_unique" UNIQUE("provider_reference"),
	CONSTRAINT "mock_provider_payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"title_snapshot" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"fulfillment_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_reference" varchar(40) NOT NULL,
	"buyer_email" varchar(254) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"total_minor" integer NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"viewer_secret_hash" varchar(64) NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_public_reference_unique" UNIQUE("public_reference"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_total_positive" CHECK ("orders"."total_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unique_key" varchar(200) NOT NULL,
	"type" varchar(40) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 6 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_jobs_unique_key_unique" UNIQUE("unique_key")
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_reference" varchar(200),
	"status" "attempt_status" DEFAULT 'created' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"checkout_url" text,
	"livemode" boolean NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"dedupe_key" varchar(250) NOT NULL,
	"provider_reference" varchar(200),
	"payload_hash" varchar(64) NOT NULL,
	"verification_status" varchar(40) NOT NULL,
	"detail" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"label" text NOT NULL,
	"private_object_key" text,
	"external_url" text,
	"filename" text,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_assets_kind" CHECK ("product_assets"."kind" in ('pdf', 'map_link')),
	CONSTRAINT "product_assets_target" CHECK (("product_assets"."kind" = 'pdf' and "product_assets"."private_object_key" is not null) or ("product_assets"."kind" = 'map_link' and "product_assets"."external_url" is not null))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"currency" varchar(3) NOT NULL,
	"price_minor" integer NOT NULL,
	"fulfillment_version" integer DEFAULT 1 NOT NULL,
	"is_test_product" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_price_positive" CHECK ("products"."price_minor" > 0),
	CONSTRAINT "products_currency_upper" CHECK ("products"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_assets" ADD CONSTRAINT "product_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_tokens_email_idx" ON "access_tokens" USING btree ("buyer_email","created_at");--> statement-breakpoint
CREATE INDEX "entitlements_email_idx" ON "entitlements" USING btree ("buyer_email","status");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("buyer_email");--> statement-breakpoint
CREATE INDEX "outbox_jobs_due_idx" ON "outbox_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_ref_uq" ON "payment_attempts" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "payment_attempts_order_idx" ON "payment_attempts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_status_idx" ON "payment_attempts" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_dedupe_uq" ON "payment_events" USING btree ("provider","dedupe_key");--> statement-breakpoint
CREATE INDEX "product_assets_product_idx" ON "product_assets" USING btree ("product_id","version");