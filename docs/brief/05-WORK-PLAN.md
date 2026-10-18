# Albania travel implementation plan
For Claude Code: execute these deliverables sequentially. This package authorizes preparation of the implementation in the target repository; client design selection and live merchant configuration remain explicit open decisions. Do not publish, charge real cards or fabricate absent assets. Inspect existing repo/AGENTS.md before adapting paths. No requirement to delegate agents.

Goal: launch a useful English Albania information site with optional secure one-time digital guide purchases.
Architecture: Astro public content + server commerce endpoints, Sanity, PostgreSQL, private storage, outbox email, interchangeable gateway.
Spec: 01–04. Global constraints: two preview heroes, responsive HTML content, no raw card storage, server-verified fulfillment, one active provider, English UI.

Review focus: concurrent callbacks; pending payments; exposed premium payloads; broken mobile navigation; expired event dates. Pin each in the task below.

## 1. Repository and visual foundation
Files: package.json, astro.config.*, src/styles/*, src/components/hero/*, src/pages/preview/*.
- [ ] Inspect repo, agree runtime/adapter, install stable compatible dependencies, lock versions, configure lint/typecheck/build and environment validation.
- [ ] Implement shared tokens/header/footer and HeroProps from 03; compare A/B with identical lower content.
- [ ] At 390px and 1440px compare reference images; check no overflow, image crops, title readability and keyboard menu.
- [ ] Keep preview private/noindex and production variant configurable. Commit independently reviewable change.
Deliverable: client can compare both hero concepts without duplicate website implementations.

## 2. Editorial CMS and public pages
Files: cms/schemas/*, src/features/content/*, src/pages/{destinations,essentials,journal,photo-spots,events,guides}/*.
- [ ] Define Destination, Article, Place, Event, GuideMarketing, SiteSettings and media rights/alt fields. Relate products by immutable product ID.
- [ ] Validate slug uniqueness, required title, image alt, canonical, published status, event start/end/timezone/source/lastCheckedAt. Do not publish drafts through the public search feed.
- [ ] Build index/detail templates and server-render event filtering. Test an event ending at midnight in Europe/Tirane and no future events.
- [ ] Build public search; prove it excludes private coordinates and paid asset URLs. CMS publish triggers protected rebuild; test failed build preserves live content.
Deliverable: coherent free navigation with editable real content and product previews.

## 3. Saved trip MVP
Files: src/features/trip/{model,storage}.ts, src/pages/{plan,my-trip}.astro, tests/unit/trip.test.ts.
- [ ] Define SavedTrip {version:1, days:{date?:string,destinationIds:string[]}[]} with schema validation.
- [ ] Implement save/reorder/remove/reset in local storage, keyboard-accessible reorder controls.
- [ ] Test corrupt storage, storage denied, duplicate saves and outdated destination ID; show recovery without crashing.
- [ ] Show explicit on-device storage limitation; omit route optimization and live travel time claims.
Deliverable: usable local itinerary without account dependencies.

## 4. Commerce and mock payment
Files: src/db/schema.ts, migrations, src/features/commerce/*, src/features/payments/{contract,mock}.ts, src/pages/api/checkout.ts.
- [ ] Add schema and constraints from 02, seed test catalogue with explicit test-only prices/currency.
- [ ] Implement createOrder({productId,email,idempotencyKey}) -> {orderId,attemptId}; prices only from DB. Implement createCheckout via shared adapter.
- [ ] Unit/integration tests: price tampering, inactive product, invalid email, repeated request, provider timeout and two attempts for same order.
- [ ] Build checkout pending/cancelled/failed/paid views; confirm redirect cannot unlock anything.
Deliverable: end-to-end mock purchase with no real processing.

## 5. Verified provider and order state
Files: src/features/payments/{paysera|pok,reconcile}.ts, src/pages/api/payments/[provider]/callback.ts, tests/integration/payments.test.ts.
- [ ] Obtain chosen merchant sandbox docs; record exact API family, units, verification algorithm, supported currencies and final status mapping. Implement ONLY selected adapter; leave the other as explicitly unsupported scaffold/config error.
- [ ] Implement processVerifiedPayment(payment:VerifiedPayment) -> {orderStatus,fulfilled:boolean}; transaction + unique constraints + outbox.
- [ ] Tests: concurrent duplicate callbacks yield one entitlement/job; forged notification yields none; amount/currency mismatch yields none; uncaptured yields none; late paid after cancel fulfills once; refunded cannot return to paid.
- [ ] Reconciliation cron uses authenticated provider status; test callback lost and provider API outage. Sandbox payment demonstrates provider → DB final status.
Deliverable: gateway-selected payment implementation proven in sandbox; no live enablement yet.

## 6. Access, private assets and recovery
Files: src/features/access/*, src/features/jobs/*, src/pages/{access,my-guides}/*, src/pages/api/downloads/[assetId].ts.
- [ ] Implement issueAccessLink(email), redeemAccessToken(token), authorizeAsset(session,assetId), enqueue/send purchase email.
- [ ] Store hashed tokens, consume atomically, return generic recovery messages; add rate limits and no-store headers. Avoid tokens in analytics/referrers.
- [ ] Test token replay/expiry, buyer A accessing buyer B product, refunded access, signed URL expiry and email retry exhaustion. Public build/artifact scan contains no private guide links or coordinates.
- [ ] Owner order view/resend and refund reconciliation require authenticated owner role and audit entries.
Deliverable: purchased guide reliably available even after email delivery failure.

## 7. Content, SEO, QA and launch
Files: src/components/SEO.astro, sitemap/robots config, tests/e2e/*, docs/runbook.md.
- [ ] Real title/description/canonical per public page, Article/Breadcrumb/Product markup only for supported actual content. No invented ratings. Private/preview/search-result pages noindex as appropriate; never list them in sitemap.
- [ ] Configure contact/support, final seller policies, currency, licensed photos, 3 real guides and real map destinations; test recovery on a phone.
- [ ] Run documented npm scripts for lint, typecheck, unit/integration tests, production build and Playwright; use isolated test DB. Review 360/390/768/1440px, safe areas, zoom, keyboard, reduced motion.
- [ ] Performance targets: CLS <=0.1, mobile lab LCP aim <=2.5s under documented conditions; field results depend on real traffic. Optimize images/fonts/JS based on measurement.
- [ ] Restore test DB backup, simulate pending payment + email outage, verify alerts/retry/reconciliation. Confirm CMS publish and past-event filtering.
- [ ] Obtain final hero/brand selection and live merchant readiness, then owner-authorized production launch. Document rollback and first real payment/refund verification under owner supervision.
Deliverable: launch checklist with evidence, not merely “tests passed”.

Planning estimate: 4–6 development weeks with approved assets/content and one gateway. New routing engine, offline maps, accounts, translations and second live gateway are separately estimated. Content and merchant approval are external dependencies.
