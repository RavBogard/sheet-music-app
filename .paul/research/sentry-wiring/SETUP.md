# Sentry wiring — setup notes

Status as of `feat/sentry-wiring` (cut from `559c6c84d`, 2026-05-23).

## What was already there

The Sentry skeleton has been in the repo since the early "Sessions 5+6"
commit (`525028727`).  When this lane started, origin/master already had:

- `@sentry/nextjs@^10.39.0` in `package.json`
- `sentry.client.config.ts` — DSN-gated dynamic-import init, `tracesSampleRate: 0.1`,
  `replaysSessionSampleRate: 0`, hydration noise filter
- `sentry.server.config.ts` — DSN-gated init, `tracesSampleRate: 0.1`
- `instrumentation.ts` — `register()` that loads the server config when DSN
  is set, plus the cycle-3 AI-enrichment subscriber binding
- `next.config.ts` — `withSentryConfig` wrap (DSN-gated), `silent: true`,
  `disableLogger: true`, `sourcemaps: { disable: false }`

The whole skeleton was dormant: every codepath was guarded on
`NEXT_PUBLIC_SENTRY_DSN`, which wasn't set in production.  Provisioning
the Sentry Vercel Marketplace integration populated the env vars and
flipped the gate on.

## What this lane added

| Change | File | Why |
|---|---|---|
| `sentry.edge.config.ts` (new) | repo root | Was missing — Middleware + Edge Functions errors were going nowhere. |
| Edge branch in `register()` | `instrumentation.ts` | Loads the edge config when `NEXT_RUNTIME === "edge"`. |
| `onRequestError` export | `instrumentation.ts` | Forwards Server Component / route-handler / middleware errors thrown outside the normal request pipeline to Sentry. |
| `environment` + `release` | all three Sentry configs | Derived from `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA[:8]`; matches the SHA convention used in `master-tip.md`. |
| `beforeSend` redact | all three configs + `src/lib/sentry-redact.ts` | Defense-in-depth scrub of `crl_live_*` MCP bearer tokens that might appear in URLs, request bodies, breadcrumbs, or arbitrary `extra` payloads.  Sentry's defaults already strip the `Authorization` header. |
| `org` / `project` / `authToken` / `widenClientFileUpload` | `next.config.ts` | Required for the Vercel build to upload source maps; with these set, Sentry stack traces resolve to real file:line in our code instead of mangled chunk paths. |
| `src/lib/__tests__/sentry-redact.test.ts` (new) | tests | Regression coverage for the bearer scrubber. |
| `src/app/api/sentry-test/route.ts` (new) | api | Deploy-verify throw route — gated on `?confirm=yes`. **Delete this route after auditor verifies capture works.** |

## Environment variables (Vercel Marketplace)

The Sentry Vercel Marketplace integration provisions these.  Pull them
locally with `vercel env pull .env.local` (the values themselves stay
out of git; the names are below for reference).

| Var | Required | Used by |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | yes | Client + server + edge init (also gates whether Sentry runs at all) |
| `SENTRY_ORG` | build | `next.config.ts` → source map upload; falls back to `centralreform` |
| `SENTRY_PROJECT` | build | `next.config.ts` → source map upload; falls back to `sentry-orange-island` |
| `SENTRY_AUTH_TOKEN` | build | Source map upload auth.  Build silently skips upload if missing. |
| `SENTRY_VERCEL_LOG_DRAIN_URL` | log drain | Vercel Log Drain target.  See "Log drain" below. |
| `NEXT_PUBLIC_VERCEL_ENV` / `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | client release/env | Auto-populated by Vercel.  Used by `sentry.client.config.ts`. |
| `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA` | server release/env | Auto-populated by Vercel.  Used by `sentry.server.config.ts` + `sentry.edge.config.ts`. |

## Log drain

The Vercel Marketplace integration *may* have already registered a Log
Drain pointing at `SENTRY_VERCEL_LOG_DRAIN_URL`.  Verify on every fresh
deploy:

1. Vercel dashboard → `centralreform.live` project → **Settings → Log
   Drains**.
2. If a "Sentry" drain is listed and active, no action needed.  Hit
   `/api/sentry-test?confirm=yes` once after deploy and check the Sentry
   Issues feed.
3. If no Sentry drain is listed, click **Add Log Drain**, select
   "Custom", and paste the value of `SENTRY_VERCEL_LOG_DRAIN_URL` from
   the Vercel project env vars.  Choose "All sources" so function logs
   plus build logs both stream.

The drain is the only path that captures pure `console.error` lines and
non-thrown 500s — the SDK only sees thrown exceptions.  This was the
exact gap the auditor hit while investigating the storage-phase2 500
(`19:15Z msg-from-auditor-v1004-LIVE-ACCEPT`).

## Bundle size impact

Sentry on the client is dynamically imported, so the SDK weight (~40 KB
gzipped) only loads after the first render when `NEXT_PUBLIC_SENTRY_DSN`
is set.  Pre-existing trade-off from the original wiring — errors thrown
in the first ~500 ms of page load aren't captured.  Acceptable for our
LCP-sensitive surfaces (band iPads).

## How to find an issue in the Sentry UI

For someone who's never used Sentry:

1. Go to `https://centralreform.sentry.io/issues/`.
2. The default filter is "Unresolved · 14d · All environments".  Issues
   are grouped by stack-trace fingerprint, so one production bug = one
   row regardless of how many users hit it.
3. Click an issue → "Details" tab shows the full stack trace with
   source-map-resolved file:line.  "Breadcrumbs" tab shows what
   navigations / API calls / console messages happened before the
   error.  "Events" tab shows every individual occurrence.
4. The `release` field on each event matches our git SHA's first 8
   chars (`559c6c84` style), so you can correlate with `master-tip.md`
   entries.

## Test route — REMEMBER TO DELETE

`src/app/api/sentry-test/route.ts` is a deliberate `throw` route gated
on `?confirm=yes`.  It exists for the auditor's deploy-verify step:

```
curl -i 'https://centralreform.live/api/sentry-test?confirm=yes'
```

After the auditor confirms the resulting event appears in Sentry, the
file should be deleted before this branch merges.  Per the lane prompt
("DELETE the test route after verify (don't ship a thrown-on-demand
endpoint to prod)").

## Daniel-action follow-ups (post-merge)

- Rotate `SENTRY_AUTH_TOKEN` (the lane's transcript surfaced the value
  via the marketplace install — standard secret-rotation hygiene).
- Optionally enable Sentry's "Alerts" → notify on first occurrence of
  any unresolved issue in production.  Not configured by this lane.
- Consider a custom dashboard for the `/perform` route group (highest
  band-impact surface) once you have a week of baseline data.
