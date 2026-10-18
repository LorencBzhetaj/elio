# Open decisions and missing material

## Decisions for the owner

| Decision | Where it is configured | Current interim value |
|---|---|---|
| Homepage hero: A (collage) or B (panorama) | `HOMEPAGE_HERO_VARIANT` env or CMS *Site settings → Homepage hero* | `panorama` (both remain on `/preview`) |
| Brand name and domain | `PUBLIC_BRAND_NAME`, `SITE_URL`, CMS *Site settings* | “Albania Decoded” (provisional) |
| Payment provider: Paysera or POK | `PAYMENT_PROVIDER` + adapter implementation | `mock` |
| Charge/display currency and final prices | `products` table (`currency`, `price_minor`) | Test prices $5 / $9 / $15, flagged as test |
| Hosting platform + transactional email vendor | env vars; see `deployment.md` | none |
| CMS editors (who gets Sanity access) | Sanity project members | none |
| Admin users | `ADMIN_EMAILS` | `owner@example.com` placeholder |

## Missing material (blocking launch)

1. **Licensed photography** — every image slot shows an illustration and records the photo needed
   (`needed` field). The reference mockups are not licensed and are not used.
2. **Verified content** — all destinations, essentials, places, articles and pages are `verified: false`
   and contain “Content to come” blocks where facts are needed. No facts, prices, times, ratings or
   reviews were invented.
3. **Events** — none published. Each needs organiser URL, source URL and last-checked date.
4. **Real guide PDFs and map links** — seed creates one-page placeholder PDFs saying “TEST PLACEHOLDER”.
   Upload final files to private storage and add `product_assets` rows (see `admin-guide.md`).
5. **Seller policies** — privacy, terms, refund policy are outlines marked “Draft — not legally reviewed”.
   Must be written/reviewed (incl. EU consumer rules for digital content if selling to EU buyers) before
   real payments.
6. **Merchant approval** and the provider's current API documentation (see `payments-integration-note.md`).
7. **Support email** — `PUBLIC_SUPPORT_EMAIL` placeholder.
8. **Invoicing / tax** — separate decision; gateway receipts may not satisfy local requirements.

## Deliberately not built (scope)

Route optimisation, travel times, offline maps, account sync, AI itineraries, bookings, subscriptions,
reviews/ratings, a second live payment gateway, theme picker for visitors.

## Known limitations

- Saved trip lives in the visitor's browser only (stated on the page).
- A downloaded PDF and a shared map link cannot be recalled; signed URLs can be shared for 60 s.
- In-memory IP rate limiter is per process; add a proxy/WAF limit when running several instances.
- Static (prerendered) pages get security headers from the host, not from Astro middleware.
- `drizzle-kit` (dev-only) pulls an `esbuild` version with a moderate advisory affecting its dev server;
  not used at runtime.
