# Albania travel — website & digital guides

English travel-information site for visitors to Albania (editorial style, Gen Z audience) with optional
digital guides sold as one-time purchases. Built from the brief in [`docs/brief/`](docs/brief/).

> **Status: pre-launch.** Content is sample/placeholder (marked in the UI), photos are illustrations,
> checkout runs on a **mock** payment provider. Nothing is deployed. Brand name “Albania Decoded” and
> the domain are provisional and configurable.

Owner guide in Albanian: [`docs/UDHEZUES-PRONARI.md`](docs/UDHEZUES-PRONARI.md).

## Quick start

Requirements: Node.js ≥ 22.22 (tested on 24.11). No database install needed for local development —
the default `DATABASE_URL=pglite:./.data/pglite` runs real PostgreSQL in-process (PGlite).

```bash
npm install
cp .env.example .env        # then set APP_SECRET (32+ random chars)
npm run db:seed             # migrations + TEST catalogue + placeholder PDFs
npm run dev                 # http://localhost:4321
```

- Hero comparison: <http://localhost:4321/preview> (side by side), `/preview/hero-a`, `/preview/hero-b`
- Mock purchase: open any guide → **Get the guide** → the simulated gateway lets you pay, fail, cancel,
  authorise only, or pay with a delayed callback.
- Emails (dev): written to `.data/mail/*.html` by the worker: `npm run worker` (stop `npm run dev` first
  when using PGlite — an embedded database can only be opened by one process; with PostgreSQL both run together).
- Admin: set `ADMIN_EMAILS`, open `/admin/login`, run the worker, open the link from `.data/mail/`.

With PostgreSQL instead of PGlite: `docker compose up -d db`, set
`DATABASE_URL=postgres://albania:albania@localhost:5432/albania`, then `npm run db:migrate && npm run db:seed`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Astro dev server |
| `npm run build` | Production build **+ scan of the public output for private material** (fails the build on leaks) |
| `npm run preview` | Run the built Node server (`dist/server/entry.mjs`) |
| `npm run check` | Type-check (`astro check`) |
| `npm test` | Unit + integration tests (PGlite; set `TEST_DATABASE_URL` to use real PostgreSQL) |
| `npm run db:generate` | Generate a new SQL migration from `src/db/schema.ts` (drizzle-kit) |
| `npm run db:migrate` | Apply committed migrations to `DATABASE_URL` |
| `npm run db:seed` | Test catalogue + placeholder PDFs (refuses to run in production) |
| `npm run worker` | Outbox emails (15 s), pending-payment reconciliation (5 min), daily refund reconciliation |
| `npm run reconcile [-- --include-paid]` | One-shot reconciliation for cron |
| `cd cms && npm install && npm run dev` | Sanity Studio (content editing) |

## Architecture

Follows `docs/brief/02-ARCHITECTURE.md`:

- **Astro 7 + TypeScript**, `@astrojs/node` (standalone). Content pages are prerendered; commerce,
  account, admin, preview, search, events and guide pages render on demand (`prerender = false`).
- **Sanity CMS** (`cms/`) for editorial content. Without `SANITY_PROJECT_ID` the site uses
  `src/content/fixtures.ts`. Both paths are validated by the same zod schema (`src/features/content/schemas.ts`).
- **PostgreSQL + Drizzle** for products, prices, orders, payment attempts/events, entitlements, access
  tokens/sessions, outbox jobs and audit log. Migrations in `src/db/migrations/`.
- **Private storage**: local directory (dev) or S3-compatible bucket (prod). Files are only reachable via
  an entitlement check and a 60-second signed URL.
- **Transactional email** via an outbox table + worker with retries/backoff and owner alerts on exhaustion.
- **Payments**: provider-neutral contract (`src/features/payments/contract.ts`); `mock` implemented;
  `paysera` and `pok` are deliberate stubs that refuse to run (see `docs/payments-integration-note.md`).

```
src/
  components/      hero/ (HeroCollage, HeroPanorama, Hero), cards/, layout/, media/ (Photo, Scene), content/, trip/
  pages/           public routes, checkout/, order/, access/, my-guides, admin/, preview/, mock-pay/, api/
  features/
    content/       schemas, source (Sanity|fixtures), queries, search, events (Europe/Tirane)
    trip/          model + storage (saved trip, localStorage)
    commerce/      orders, fulfillment (verified-payment state machine), catalog, money
    payments/      contract, mock, paysera (stub), pok (stub), reconcile
    access/        tokens & sessions, downloads (entitlements), private storage
    jobs/          outbox, email transports, job handlers
  db/              schema.ts, migrations/, client (pg | PGlite), migrate
cms/               Sanity Studio + schemas
scripts/           migrate, seed, worker, reconcile, scan-public-build
tests/             unit/, integration/
```

### Purchase flow and guarantees

Product page → `/checkout/[slug]` (email + terms; price read from DB) → order + attempt created, provider
reference stored **before** redirect → hosted payment page → return to `/order/[ref]` which only shows
state from the server. Status becomes *paid* only through `processVerifiedPayment`, fed by the provider's
authenticated API (callbacks are treated as triggers) or by reconciliation. It checks provider reference,
attempt id, exact amount, currency and live/test mode; uses row locks + unique constraints so duplicate or
concurrent events grant **one** entitlement and **one** email; never fulfils on “authorised”; never
reverts a refund. Access: viewer cookie for the buying browser (24 h), otherwise a single-use 15-minute
email link → HttpOnly 7-day session → `/my-guides`. No account is required.

## Deviations from the brief (and why)

| Brief | Implementation | Reason |
|---|---|---|
| “Maintained auth solution” for the admin dashboard | Admin sign-in uses the same passwordless single-use email links + HttpOnly sessions, restricted to `ADMIN_EMAILS` (re-checked on every request) | No passwords are stored or handled. For production, also put `/admin` behind a maintained identity proxy (Cloudflare Access / SSO); documented in `docs/deployment.md`. |
| PostgreSQL everywhere | PGlite (embedded Postgres) allowed for local dev/tests only | Zero-setup development; production config validation rejects it. |
| Prerender public pages | Homepage, guides, events, search, destination/journal **index** pages render on demand (CDN-cacheable) | Prices come from the commerce DB, events filter at request time, query-string filters work without JS, hero variant switches by config without a rebuild. |
| Cormorant Garamond (candidate) | DM Serif Display (headings), DM Sans (UI), Caveat (annotations), self-hosted via Fontsource | Closer match to the heavy editorial serif in the references; doc said not to lock fonts before comparing. |
| Photos | Original SVG illustrations, labelled “Illustration · photo pending” | Reference images are not licensed. Each slot records which photo is needed. |

## Verification (latest run)

See [`docs/test-results.md`](docs/test-results.md). Summary: type-check 0 errors; 60/60 tests;
production build + private-output scan pass; Sanity Studio builds; browser checks at
320/360/390/1024/1440 px and 200 % text; full mock purchase on the production build. Not yet run:
tests against real PostgreSQL, 768 px tablet pass, real devices, Lighthouse.

## Open decisions / missing material

See [`docs/decisions-and-gaps.md`](docs/decisions-and-gaps.md). Most important: hero choice, brand &
domain, payment provider + merchant approval, currency, licensed photos, real guide PDFs and maps,
verified content, reviewed legal policies, hosting and email provider.
