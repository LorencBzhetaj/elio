# Deployment notes

Nothing has been deployed. Hosting is an open decision; any platform that runs a Node.js server
(standalone `@astrojs/node`) plus a background process works (e.g. a VPS, Fly.io, Render, Railway).
Serverless hosts need an Astro adapter swap and a cron for the worker tasks.

## Required environment (production)

`APP_ENV=production`, `SITE_URL=https://<final-domain>`, `DATABASE_URL=postgres://…` (managed, TLS),
`APP_SECRET` (32+ random chars), `PAYMENT_PROVIDER=<paysera|pok>` (only after the adapter is done —
config validation refuses `mock` in production), `ADMIN_EMAILS`, `OWNER_ALERT_EMAIL`,
`EMAIL_TRANSPORT=smtp` + `SMTP_URL` + `EMAIL_FROM`, `STORAGE_DRIVER=s3` + `S3_*`, Sanity vars,
`PUBLIC_*` brand vars at **build** time. See `.env.example`.

## Security headers

Middleware sets headers for on-demand routes. Prerendered HTML is served as static files, so configure
the same at the host / reverse proxy for all paths:

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

A Content-Security-Policy is recommended once third-party scripts (analytics, payment widgets) are known.

## Other notes

- **Never expose `npm run dev` publicly** — the Vite dev server serves source files by path. `storage/`,
  `.data/` and `.env` are denied there, but the dev server is for local use only.
- Put `/admin` behind a maintained identity layer (Cloudflare Access, an SSO proxy) in addition to the
  built-in admin email links.
- `/preview/*` requires `PREVIEW_ACCESS_KEY` outside development; share `https://<staging>/preview?key=…`
  with the client once — it sets a cookie and removes the key from the URL.
- CMS publish webhook → `/api/cms/publish-hook` → `BUILD_HOOK_URL`. Use a host whose build pipeline keeps
  the previous deployment live when a build fails.
- Private bucket: block public access, enable versioning, CORS not required (downloads are redirects).
