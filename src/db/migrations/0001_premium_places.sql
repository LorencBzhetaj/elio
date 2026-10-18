CREATE TABLE "premium_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "premium_places_lat" CHECK ("premium_places"."lat" between -90 and 90),
	CONSTRAINT "premium_places_lng" CHECK ("premium_places"."lng" between -180 and 180)
);
--> statement-breakpoint
ALTER TABLE "premium_places" ADD CONSTRAINT "premium_places_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "premium_places_product_idx" ON "premium_places" USING btree ("product_id");