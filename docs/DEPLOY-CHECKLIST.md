# Deploy checklist

Authoritative reference for deploying code that depends on server configuration. Supersedes `docs/deploy-checklist-v3.1.md` for all auth/secret-related changes.

## Before deploying code that depends on a new server secret

1. **Add the secret in Vercel first.**
   Dashboard → Project → Settings → Environment Variables → Production (and Preview if needed).
2. **Verify it's in scope.**
   ```
   vercel env ls production
   ```
3. **Only now push the code or promote the deployment.**

Shipping code first and secret second has caused at least one production lockout (v4.3 Plan 09-02, 2026-04-14). As of P10-01 the app fails fast at boot if required secrets are missing, so out-of-order deploys now break builds instead of silently degrading — but the ordering above is still the intended flow.

## Current required production secrets (v4.3)

These are enforced at build time by `src/env.mjs` **when `VERCEL_ENV=production`** (i.e., Vercel's Production builds). Missing any of them breaks the Vercel Production build. Local `npm run build` and Preview deploys are not affected.

| Variable | Purpose | Consequence if missing |
|---|---|---|
| `SESSION_ROLE_SECRET` | HMAC-sign the `__session_role` companion cookie | `/api/auth/session` throws; auth is unusable |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK credentials | All server auth / API routes return `FIREBASE_NOT_INITIALIZED` 500 |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK credentials | Same |

## Optional-but-important secrets

Declared in `env.mjs` as optional; the app starts without them but specific features silently degrade.

| Variable | Purpose | Degrade mode |
|---|---|---|
| `CRON_SECRET` | Vercel cron job auth | Cron routes return 401; backups/enrichment won't run. Fine if no cron is scheduled. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Rate limiting | Limiter opens (permits all requests) — see `src/lib/rate-limit.ts` |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Outbound email | Setlist email packets and admin notifications silently drop |
| `RESEND_WEBHOOK_SECRET` | Resend delivery webhook verification | Webhook rejects all inbound deliverability events |
| `GOOGLE_GENERATIVE_AI_API_KEY` | AI chat + key detection | Chat endpoints return errors; OMR key detection falls back |
| `BRIDGE_ALERT_EMAIL` | Bridge-credential security audit alerts | Admin receives no alert on setup-code redemption |
| `BACKUP_BUCKET` | Firestore backup destination | Cron backup route fails at write time |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Library Drive sync root | Sync stops |
| `SUPER_ADMIN_UID` | Bootstrap super-admin identity | Affects `/admin` bootstrap only |

## Rollback

Production auto-deploys from `master`.

- **Code-only rollback:** `git revert HEAD && git push origin master`
- **Deployment rollback:** Vercel dashboard → Deployments → select a prior deployment → "Promote to production"

Do not force-push to `master`; Vercel's deployment history becomes misleading.

## Local dev

- `.env.local` provides everything above for local work. If secrets go missing, `npm run build` still succeeds because env.mjs gates required-ness on `VERCEL_ENV=production` (which is unset locally).
- The test runner sets `SKIP_ENV_VALIDATION=1`, so Vitest never needs real credentials.

## Related

- `src/env.mjs` — the source of truth for what is required where.
- `src/lib/firebase-admin.ts` — `initAdmin()` returns `false` when creds are missing; every `/api/**` route guards this and returns `FIREBASE_NOT_INITIALIZED` 500.
- `src/lib/session-role.ts` — throws in production when `SESSION_ROLE_SECRET` is missing; warns and returns null in dev.
