# Admin & editor guide

## 1. Content (Sanity Studio)

Setup once: create a Sanity project, then

```bash
cd cms
npm install
SANITY_STUDIO_PROJECT_ID=<id> SANITY_STUDIO_DATASET=production npm run dev   # local studio
npm run deploy                                                                 # hosted studio
```

Set `SANITY_PROJECT_ID` / `SANITY_DATASET` on the website. Until then the site shows local sample content.

### Editing rules

- **Facts verified** — tick only after checking every factual statement (times, prices, access, seasons)
  against a reliable source. Unticked pages show “Draft · facts to verify”.
- **Content to come** blocks are visible to readers; replace them with verified text.
- **Images** need alt text and usage rights. Only upload photos you own or have licensed. Set the hotspot
  (focal point) — it controls the crop on phone and desktop. Hero B uses one panorama; keep the sky area
  calm on the left for the headline.
- **Events** require organiser URL, source URL and *Last checked*. Dates are Albanian time
  (Europe/Tirane). Past events disappear from listings automatically at local midnight.
- **Places** are free/public only. Premium-only spots and their coordinates belong in the paid guide.
- **Guide pages** contain marketing copy only. *Commerce product slug* links to the price and files in
  the database and cannot be changed after creation.
- **Other spellings** (aliases) help search: e.g. *Thethi*, *Shkodra*. Common variants are also built in.
- **Map location**: add only checked coordinates; tick *Location verified*. Use precision *town-centre*
  for a town pin. Never enter locations that belong to a paid guide.
- **Site settings → Suggested searches**: 4–8 editorial picks shown when the search box is empty
  (they are not usage statistics).
- **Site settings → Homepage hero** switches the public homepage between A and B.
- Drafts never appear on the site. Publishing triggers a rebuild (webhook → `BUILD_HOOK_URL`); if the
  build fails, the previous version stays live — check the hosting dashboard.

Webhook setup (Sanity → API → Webhooks): URL `https://<site>/api/cms/publish-hook`, trigger on
create/update/delete of published documents, HTTP POST, secret = `SANITY_WEBHOOK_SECRET`.

## 2. Products, prices and guide files (database)

Prices and files are **not** in the CMS. Until a small product admin exists, use SQL (or a DB console):

```sql
-- price in minor units (e.g. 900 = 9.00), ISO currency
INSERT INTO products (slug, title, active, currency, price_minor, fulfillment_version, is_test_product)
VALUES ('theth-guide', 'Theth Guide', true, 'EUR', 900, 1, false)
ON CONFLICT (slug) DO UPDATE SET price_minor = EXCLUDED.price_minor, currency = EXCLUDED.currency,
  is_test_product = false, updated_at = now();

-- New guide version: upload the PDF to PRIVATE storage first (never /public), then:
INSERT INTO product_assets (product_id, version, kind, label, private_object_key, filename, checksum)
SELECT id, 2, 'pdf', 'Theth Guide PDF', 'guides/theth-guide/v2.pdf', 'theth-guide-v2.pdf', '<sha256>' FROM products WHERE slug='theth-guide';
UPDATE products SET fulfillment_version = 2 WHERE slug = 'theth-guide';

-- Online map link (shown only to buyers; needs internet)
INSERT INTO product_assets (product_id, version, kind, label, external_url)
SELECT id, 2, 'map_link', 'Online map', 'https://…' FROM products WHERE slug='theth-guide';
```

Exact locations that are part of a paid guide (shown only to its buyers on the map):

```sql
INSERT INTO premium_places (product_id, title, note, lat, lng)
SELECT id, 'Viewpoint name', 'Short note', 42.0, 19.0 FROM products WHERE slug = 'theth-guide';
-- remove the seeded TEST points before launch:
DELETE FROM premium_places WHERE title LIKE 'TEST premium point%';
```

Buyers always see the files of the product's current `fulfillment_version`. Set `active=false` to stop
selling a guide (existing buyers keep access).

## 3. Orders admin (`/admin/orders`)

Sign in at `/admin/login` with an address listed in `ADMIN_EMAILS`; you receive a single-use link.

- **Search** by buyer email or reference (`AL-…`), filter by status.
- Banner warns about attempts needing review (amount/currency mismatch, ambiguous provider result,
  double payment) and emails that failed after all retries.
- **Order page**: attempts, entitlements, email jobs, provider events and the audit log.
  - *Sync status / refunds from provider* — re-reads the provider API; use after refunding in the
    provider dashboard (records the refund and revokes access).
  - *Resend access email* — queues a fresh link (the old one stays single-use).
  - *Revoke access* — requires a reason; audited.
- Refunds: full refunds only, issued in the provider dashboard, then *Sync*. A downloaded PDF cannot be
  recalled.

Customer support script: ask for the checkout email (never card details). If they cannot find the email,
send them to `/access`; if that fails, use *Resend access email*.
