# Verification results

Run on 18 October 2026, Windows 11, Node 24.11.1, Astro 7.4.0, local PGlite database.

## Automated

| Check | Command | Result |
|---|---|---|
| Type-check | `npm run check` | 0 errors, 0 warnings |
| Unit + integration tests | `npm test` | **60 / 60 passed** (6 files) |
| Production build | `npm run build` | OK; 31 static pages + on-demand routes |
| Public output scan | runs inside `npm run build` | Passed. Self-test: a planted `.pdf` and a private key string in `dist/client` made it fail as intended |
| Sanity Studio | `cd cms && npx tsc --noEmit && npx sanity build` | OK |

### What the tests cover (`tests/`)

- **Orders**: price always from DB (tampered amount ignored), inactive/unknown product, invalid email,
  missing terms, repeated idempotency key returns the same order, reused key with different data rejected,
  provider reference persisted before redirect, ambiguous provider timeout parked as `needs_review`,
  second attempt only after the first is final, order view needs viewer cookie or buyer session.
- **Payments**: 5 concurrent duplicate “paid” → 1 entitlement + 1 email job; forged callback changes
  nothing; signed callback is only a trigger (payload status/amount ignored); amount / currency /
  merchant-reference / live-mode mismatch → no entitlement + owner alert; unknown reference ignored;
  authorised-not-captured not fulfilled; late paid after cancel fulfilled once; refunded never returns to
  paid and revokes access; refund-before-duplicate-paid wins; failed after paid doesn't undo; lost
  callback recovered by reconciliation; provider API outage survives; daily pass picks up late refunds.
- **Access**: single-use tokens (replay + concurrent redemption), expiry, only hashes stored, generic
  link requests rate-limited per address, admin links only for `ADMIN_EMAILS`, buyer A cannot get buyer
  B's file, refunded loses access, sessions expire/revoke, signed URL expiry/tamper, path traversal.
- **Outbox**: purchase email link works once and is not stored in the job, email outage → retries →
  failed after 6 attempts → owner alert; paid state and access unaffected; no email for an order refunded
  before sending; enqueue idempotent.
- **Content**: Europe/Tirane midnight across DST, all-day event ending today disappears at local
  midnight, timed event ending 00:00, no future events → empty list, event requires source/lastChecked
  and end ≥ start, fixtures validate with zero events, duplicate slugs and missing alt rejected, search
  accent-insensitive, results expose only whitelisted fields (no keys, coordinates, prices).
- **Trip**: no duplicates, reorder within/across days, move to day, remove day keeps places, sequential
  dates, day-count change, outdated IDs, corrupt JSON / wrong shapes / denied storage / quota errors.

> Concurrency note: PGlite serialises transactions, so concurrency tests prove logical idempotency.
> Re-run against real PostgreSQL before go-live:
> `docker compose up -d testdb && TEST_DATABASE_URL=postgres://albania:albania@localhost:5433/albania_test npm test`
> (Docker was not running on the build machine, so this was **not** run yet.)

## Manual / browser

- Hero A and Hero B at 1440, 1024 and 390 px: compositions as designed; mobile uses its own crops.
- No horizontal overflow on 19 routes at **320 px** and at **390 px with 200 % text size**
  (after fixes to header wrapping, grid min-widths and section headers).
- Accessibility sweep on 18 routes: every link/button has a name, every form control a label, one `h1`,
  no heading-level skips, `lang="en"`. Menu is a native `<dialog>` (focus moves in, Esc closes, focus
  returns). Trip reorder is keyboard-operable and keeps focus on the moved item.
- Full mock purchase in the browser (dev) and over HTTP on the **production build** (staging mode):
  checkout → simulated gateway (“paid, callback delayed”) → return page confirmed via server-side status
  fetch → claim → My guides → entitlement-checked 60 s signed PDF download. Same order URL without the
  cookie shows “Order not found”.
- Worker delivered queued emails (logs show masked recipients only).
- Admin: orders list, provider sync, resend email and audit log work; non-admin is redirected to login.
- Security probes on the production server: `/preview` 404 without key in staging, cross-site form POST
  403, forged/unknown-provider callback rejected, unsigned/traversal file URLs 403, private files and
  `.env` not served (404). Dev server: `storage/` and `.data/` denied (403).

## Not verified yet

- Real PostgreSQL concurrency run (see above), real SMTP delivery, S3 presigned URLs against a real bucket.
- Lighthouse/LCP measurements (no real photos yet — measure after licensed images are added).
- Tablet 768 px and real devices / safe-area insets on iOS.
- Any real payment provider (none selected).

---

## Update — search, filters, interactive map (18 October 2026)

| Check | Result |
|---|---|
| `npm run check` | 0 errors |
| `npm test` | **85 / 85** (9 files; +25 for search, filters, map, premium access) |
| `npm run build` + public scan | OK; scan now also fails on premium-location strings |
| Sanity Studio `tsc` | OK |
| Browser checks (Playwright, headless Chromium, real keyboard/touch) | **15 / 15** — see `docs/screenshots/results.txt` |

New automated coverage:
- **Search**: ë/e, ç/c, case; name variants (Thethi→Theth, Shkodra→Shkodër, Gjirokastra→Gjirokastër);
  ranking exact → prefix → title → content; 2-letter minimum; type + region filters with text; results
  show linked destination; payload whitelist; no coordinates/prices/keys/premium; empty state =
  editorial picks; **out-of-order responses** (older slow request never overwrites newer; previous
  request aborted).
- **Filters**: OR within a group, AND across groups and with text; sorting; URL round-trip; unknown
  values rejected; summary text; groups only when ≥2 real values; events with no data → no filters.
- **Map**: no invented pins (places without coordinates listed separately); unverified pins hidden when
  configured; map-area + text + category combined; public payload has no premium/private fields.
- **Premium map**: only buyers of that guide get the points; refund removes them; public preview is a count.
- **Trip**: `place:` ids, no duplicates, invalid ids rejected.

Browser (Playwright 1.64, 1440×900 and 390×844 touch):
keyboard ArrowDown/Escape/Enter in the hero combobox; mobile full-screen search; closing restores
scroll; filter panel Escape discards draft; "Show N" count; refresh keeps filters; desktop map renders
with selected card; mobile card stays above the bottom navigation.

Manual (in-app browser): suggestions overlay the next section (not clipped); dialog focus returns to the
opener; search error state + retry; Apply/close-without-apply/Back on Destinations; map pan shows
"Search this area" only after a user move; area filter + "show all places"; save/remove sync between
card, list and My trip without duplicates; buyer-only guide places after a mock purchase (listed even if
the map fails); map with an unreachable tile server shows the fallback and the list still works.
No horizontal overflow at 320, 360, 390, 768, 1280 px and at 390 px with 200 % text.

Not verified: real iOS/Android devices (on-screen keyboard behaviour is handled via `visualViewport`
but only emulated), a paid tile provider, Lighthouse.
