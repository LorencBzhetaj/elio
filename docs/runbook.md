# Operations runbook

## Processes

| Process | Command | Notes |
|---|---|---|
| Web | `node dist/server/entry.mjs` (`HOST`, `PORT`) | Stateless; scale horizontally |
| Worker | `npm run worker` (or compiled equivalent) | Outbox every 15 s, pending reconciliation every 5 min, refund pass daily. Safe to run more than one (SKIP LOCKED) |
| Cron alternative | `npm run reconcile` every 5 min, `npm run reconcile -- --include-paid` daily | If the host can't run a long-lived worker |
| Migrations | `npm run db:migrate` | Run before deploying new code |

## Alerts (to `OWNER_ALERT_EMAIL`)

- `payment_mismatch` — provider reported a different amount/currency/reference/mode. No access granted.
  Check the provider dashboard; refund or contact the buyer; the attempt is marked `needs_review`.
- `double_payment` — a second attempt for an already paid order was captured. Refund the duplicate.
- `job_failed` — an email failed 6 times (≈ 7.5 h of retries). The purchase remains valid; fix email
  configuration and use *Resend access email*.
- Monitor also: worker liveness, `payment_attempts` stuck in `pending` > 1 h, 5xx on
  `/api/payments/*/callback`.

## Incidents

| Symptom | Action |
|---|---|
| Email provider down | Nothing is lost; jobs retry with backoff. Buyers can still use the “Open my guides” button in the buying browser and `/access` once email is back. |
| Payment provider down | Checkout shows “payment page could not be opened, not charged”. Pending attempts reconcile automatically later. |
| Callback endpoint failing | Reconciliation every 5 min fulfils paid orders anyway. |
| Attempt `needs_review` after a timeout | Check provider dashboard for that merchant reference (= attempt id); use *Sync* if a reference exists, otherwise contact the buyer. Never re-charge blindly. |
| Leaked signed URL | Expires in 60 s. If a PDF is widely shared, publish a new version (new object key). |
| Compromised admin email | Remove it from `ADMIN_EMAILS` (effective immediately), then revoke sessions: `UPDATE access_sessions SET revoked_at=now() WHERE buyer_email='…'`. |
| Rotate `APP_SECRET` | Invalidates outstanding signed download URLs only (sessions are DB-backed). |

## Backups and restore

- Managed PostgreSQL with daily automated backups + point-in-time recovery (≥ 7 days).
- Private bucket with object versioning enabled; no public access policy.
- **Restore drill** (do before launch and quarterly):
  1. Restore the latest backup into a new database.
  2. `DATABASE_URL=<restored> npm run db:migrate` (should be a no-op).
  3. Start the app against it in staging, sign in to `/admin/orders`, open a recent order and a buyer's
     `/my-guides` via a fresh access link, download a file.
  4. Record date and outcome below.

| Date | Restored from | Result |
|---|---|---|
| | | |

## Deploy / rollback

1. `npm ci && npm run check && npm test && npm run build` (build fails if private material leaks).
2. Apply migrations (backward-compatible changes only; drop columns in a later release).
3. Deploy web + worker. Smoke test: `/`, a guide page with price, `/preview` returns 404 without the key,
   mock disabled in production (`/mock-pay/x` → 404).
4. Rollback: redeploy the previous build. Migrations are additive, so the previous build keeps working.

## Go-live checklist

- [ ] Hero selected; brand, domain, `SITE_URL`, `PUBLIC_*` set; draft banner off (`PUBLIC_SHOW_DRAFT_BANNER=false`), placeholder labels off only after real photos.
- [ ] Licensed photos uploaded with alt text; all published content `verified`.
- [ ] Real guide PDFs/maps uploaded; test products replaced (`is_test_product=false`), prices + currency confirmed.
- [ ] Policies reviewed; support email live; invoicing/tax decided.
- [ ] Provider adapter implemented and documented; sandbox scenarios passing; `APP_ENV=production`, `PAYMENT_PROVIDER=<provider>`.
- [ ] Tests passing against real PostgreSQL; backup restore drill done.
- [ ] SMTP verified (SPF/DKIM/DMARC); owner alert address receives a test alert.
- [ ] `/admin` behind identity proxy; `PREVIEW_ACCESS_KEY` set on staging.
- [ ] First real purchase + full refund under owner supervision.
