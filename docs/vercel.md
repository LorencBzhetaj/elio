# Deploy to Vercel (client preview)

The repository is ready to import; no Vercel CLI is needed. On Vercel the build automatically uses
the Vercel adapter and runs `npm run vercel-build` (migrations/seed when a database is connected, then
the normal build + private-output scan). Locally and on other hosts nothing changes.

## 1. Import

1. vercel.com → **Add New… → Project** → import the GitHub repository `LorencBzhetaj/elio`.
2. Framework preset: **Astro** (detected). Leave build/output settings at their defaults.
3. Node.js version (Project Settings → General): **22.x or 24.x**.

## 2. Environment variables (before the first deploy)

| Name | Value | Why |
|---|---|---|
| `APP_ENV` | `staging` | Preview mode: noindex everywhere, mock payments allowed, `/preview` protected |
| `APP_SECRET` | 32+ random characters | Required (signing). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `PREVIEW_ACCESS_KEY` | a long random word | Unlocks the hero comparison for the client |
| `HOMEPAGE_HERO_VARIANT` | `panorama` or `collage` | Which hero the normal homepage shows |
| `PUBLIC_SHOW_DRAFT_BANNER` | `true` | Keeps the "pre-launch" note |

Leave `SITE_URL` empty: the deployment URL is used automatically. Set it once a real domain exists.

## 3. Show the client both heroes

Send one link (it sets a cookie and removes the key from the address bar):

```
https://<project>.vercel.app/preview?key=<PREVIEW_ACCESS_KEY>
```

That page shows Hero A and Hero B side by side at phone / tablet / desktop width, with links to open
each one full screen (`/preview/hero-a`, `/preview/hero-b`). After the choice, set
`HOMEPAGE_HERO_VARIANT` and redeploy — the public homepage then shows only that hero.

## 4. Optional: working test shop (mock checkout, admin)

Without a database the site is a **design preview**: everything public works; checkout, My guides and
admin show "Shop not connected in this preview".

To demo the shop:
1. Project → **Storage → Create Database → Neon (Postgres)** → connect it to the project. This adds
   `DATABASE_URL`.
2. Add `ADMIN_EMAILS` (your email) and `CRON_SECRET` (random, 16+ chars).
3. Redeploy. The build applies migrations and the TEST catalogue (test prices, placeholder guides).

Notes for this demo:
- Payments are the **mock** gateway; no real money.
- No real email is sent (`EMAIL_TRANSPORT=console`). Sign-in links appear in **Vercel → Logs**
  (`DEV sign-in link …`). For real email set `EMAIL_TRANSPORT=smtp` and `SMTP_URL`.
- PDF downloads need private object storage on Vercel (`STORAGE_DRIVER=s3` + `S3_*`); without it the
  download shows "isn't available".
- `vercel.json` schedules `/api/cron/run` once a day (Hobby plan limit) for email retries and payment
  reconciliation; emails are also sent immediately when a purchase or sign-in happens.

## Not for production yet

Production needs `APP_ENV=production`, a real payment provider, SMTP, S3 storage, licensed photos and
reviewed policies — see `decisions-and-gaps.md` and `runbook.md`.
