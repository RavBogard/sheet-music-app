import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

// v4.3 P10-01: secrets the app cannot run without on Vercel Production
// are required there, optional everywhere else (local builds, preview
// deploys, tests). We key on VERCEL_ENV (set only on Vercel) rather than
// NODE_ENV (which is "production" during any local `next build`) so
// `npm run build` on a developer machine still works without prod secrets.
const isVercelProd = process.env.VERCEL_ENV === "production"
const prodRequired = (name) =>
    isVercelProd
        ? z.string().min(1, `${name} is required on Vercel Production`)
        : z.string().optional()

export const env = createEnv({
    server: {
        FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
        FIREBASE_CLIENT_EMAIL: prodRequired("FIREBASE_CLIENT_EMAIL"),
        FIREBASE_PRIVATE_KEY: prodRequired("FIREBASE_PRIVATE_KEY"),
        GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
        GOOGLE_PRIVATE_KEY: z.string().optional(),
        // Schema hygiene (storage-phase2, Lane A §4): these are read via raw
        // process.env in DriveClient / firebase-storage today. Declaring them
        // here surfaces a misconfig at boot instead of at first backup run.
        GOOGLE_CREDENTIALS_JSON: z.string().optional(),
        GOOGLE_PROJECT_ID: z.string().optional(),
        FIREBASE_STORAGE_BUCKET: z.string().optional(),
        GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
        UPSTASH_REDIS_REST_URL: z.string().optional(),
        UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
        // The same REST url and token under the names the Vercel marketplace
        // integration provisions them as. See `src/lib/upstash-env.ts`.
        KV_REST_API_URL: z.string().optional(),
        KV_REST_API_TOKEN: z.string().optional(),
        RESEND_API_KEY: z.string().optional(),
        RESEND_FROM_EMAIL: z.string().email().optional(),
        RESEND_WEBHOOK_SECRET: z.string().optional(),
        BRIDGE_ALERT_EMAIL: z.string().email().optional(),
        // Optional — cron routes reject with 401 when missing, which is
        // fine if no Vercel cron is configured. Not required-in-prod.
        CRON_SECRET: z.string().optional(),
        SUPER_ADMIN_UID: z.string().optional(),
        SESSION_ROLE_SECRET: prodRequired("SESSION_ROLE_SECRET"),
        BACKUP_BUCKET: z.string().optional(),
        GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),
        // Cycle-3 NEW-1 (drive-sync importer). Parent folder David Lazaroff
        // drops chart files into; the /api/cron/drive-sync cron watches this
        // folder + its direct subfolders every 5 min. Optional — when unset,
        // the cron is a graceful no-op so the route ships dormant until
        // Daniel configures it. Distinct from GOOGLE_DRIVE_ROOT_FOLDER_ID
        // (which the admin-triggered /api/library/sync mirror uses).
        DAVID_DRIVE_DROP_FOLDER_ID: z.string().optional(),
        // Chart Inbox (2026-09-11). The shared Drive folder music directors and
        // admins drop chart files into from any device; the drive-sync cron
        // watches it (5 min) and the MCP `sync_chart_inbox` tool ticks it on
        // demand. Takes precedence over DAVID_DRIVE_DROP_FOLDER_ID, which
        // remains a fallback. See docs/CHART-INBOX.md.
        CHART_INBOX_DRIVE_FOLDER_ID: z.string().optional(),
        // storage-phase2 (Storage→Drive byte-mirror). Dedicated Drive folder
        // (a Workspace Shared Drive) the nightly /api/cron/storage-backup
        // mirrors chart bytes into. MUST be distinct from
        // GOOGLE_DRIVE_ROOT_FOLDER_ID and DAVID_DRIVE_DROP_FOLDER_ID (and not
        // a child of the latter) to avoid a re-import loop. Optional — when
        // unset the cron is a graceful no-op so the route ships dormant until
        // Daniel sets it in Vercel env.
        CRC_BACKUP_DRIVE_FOLDER_ID: z.string().optional(),
        // Cycle-3 NEW-3 (a3, swapped 2026-05-18 a3-gemini-swap) — Gemini 3.1 Pro
        // for AI library enrichment. Optional: when unset the enrichment
        // subscriber is dormant and every library_index row stays at
        // enrichmentStatus:'pending'. No prod requirement until Daniel sets
        // the key in Vercel env. Distinct from GOOGLE_GENERATIVE_AI_API_KEY
        // which the legacy /api/cron/enrich path reads via src/lib/gemini.ts;
        // the two surfaces are intentionally disjoint.
        GEMINI_API_KEY: z.string().optional(),
        // Harness-only admin test-session gate (Daniel-ratified 2026-05-27).
        // The /api/auth/admin-test-session endpoint mints a short-lived
        // admin session ONLY when this secret is presented in the
        // x-admin-test-secret header. Optional everywhere — the endpoint is
        // dormant (503) until Daniel sets it in Vercel prod. Deliberately
        // NOT prodRequired: an unset value disables the surface, which is
        // the safe default. Never reaches the MCP tool registry surface.
        MCP_ADMIN_TEST_SESSION_SECRET: z.string().optional(),

        // ── Declared by the 2026-09-19 audit, item (e) ──────────────────────
        // Each of these was read from raw `process.env` in `src/` and declared
        // nowhere. All have a safe fallback, which is exactly the problem: a
        // misconfiguration used to surface as quiet wrong behaviour at first
        // use rather than as a failure at boot. Optional, because the fallback
        // is legitimate — declaring them buys the boot-time check and one
        // honest list of what this app reads.

        /** CORS allow-list for the Drive/library file routes. Falls back to the two CRC origins. */
        ALLOWED_ORIGINS: z.string().optional(),
        /** Origin added to the MCP dropzone's CSP `connect-src`. Unset: only storage.googleapis.com is allowed. */
        MCP_PUBLIC_URL: z.string().optional(),
        /** Local Chrome binary for chart rendering in dev. Unset: the bundled @sparticuz/chromium is used. */
        CHART_RENDER_CHROME_PATH: z.string().optional(),
        /** Which Overlays workspace the cue log must report. Unset: "crc". A mismatch refuses the reconcile. */
        OVERLAYS_WORKSPACE: z.string().optional(),
        /** Overlays API base for the performed-history client. */
        OVERLAYS_BASE_URL: z.string().optional(),
        /** Bearer for the Overlays history API. Unset: history reads are unauthenticated and will fail. */
        OVERLAYS_HISTORY_TOKEN: z.string().optional(),
        /** Org whose charts the public reader endpoint serves. Unset: DEFAULT_ORG_ID. */
        READER_MUSIC_ORG_ID: z.string().optional(),
        /** Master switch for the public reader chart endpoint. Unset: off. */
        READER_PUBLIC_CHARTS_ENABLED: z.string().optional(),
        /** CORS allow-list for the public reader chart endpoint. */
        READER_MUSIC_ALLOWED_ORIGINS: z.string().optional(),
        /** Brothers Lazaroff's own From address. Unset: the CRC address is used for both tenants. */
        RESEND_FROM_EMAIL_BROSLAZ: z.string().optional(),
        /** Twilio credentials for setlist SMS. Unset: SMS degrades to a no-op. */
        TWILIO_ACCOUNT_SID: z.string().optional(),
        TWILIO_AUTH_TOKEN: z.string().optional(),
        TWILIO_PHONE_NUMBER: z.string().optional(),
        /** Monitor-bridge service account. Unset: the bridge cannot mint its own credentials. */
        BRIDGE_SA_CLIENT_EMAIL: z.string().optional(),
        BRIDGE_SA_PRIVATE_KEY: z.string().optional(),
        BRIDGE_SA_PRIVATE_KEY_ID: z.string().optional(),
    },
    client: {
        NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1, "Firebase API key is required"),
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1, "Firebase auth domain is required"),
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1, "Firebase project ID is required"),
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
        NEXT_PUBLIC_GOOGLE_API_KEY: z.string().optional(),

        // ── Declared by the 2026-09-19 audit, item (e) ──────────────────────
        /** Absolute base for links in push/email. Unset: the prod domain is hardcoded, which is wrong on a preview deploy. */
        NEXT_PUBLIC_BASE_URL: z.string().optional(),
        /** Web-push VAPID key. Unset: push enrollment silently no-ops and no device ever registers. */
        NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().optional(),
        /** Sentry browser DSN. Unset: no client-side error reporting. */
        NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    },
    runtimeEnv: {
        FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
        GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
        GOOGLE_CREDENTIALS_JSON: process.env.GOOGLE_CREDENTIALS_JSON,
        GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID,
        FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        NEXT_PUBLIC_GOOGLE_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
        KV_REST_API_URL: process.env.KV_REST_API_URL,
        KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
        BRIDGE_ALERT_EMAIL: process.env.BRIDGE_ALERT_EMAIL,
        CRON_SECRET: process.env.CRON_SECRET,
        SUPER_ADMIN_UID: process.env.SUPER_ADMIN_UID,
        SESSION_ROLE_SECRET: process.env.SESSION_ROLE_SECRET,
        RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
        BACKUP_BUCKET: process.env.BACKUP_BUCKET,
        GOOGLE_DRIVE_ROOT_FOLDER_ID: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
        DAVID_DRIVE_DROP_FOLDER_ID: process.env.DAVID_DRIVE_DROP_FOLDER_ID,
        CHART_INBOX_DRIVE_FOLDER_ID: process.env.CHART_INBOX_DRIVE_FOLDER_ID,
        CRC_BACKUP_DRIVE_FOLDER_ID: process.env.CRC_BACKUP_DRIVE_FOLDER_ID,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        MCP_ADMIN_TEST_SESSION_SECRET: process.env.MCP_ADMIN_TEST_SESSION_SECRET,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
        MCP_PUBLIC_URL: process.env.MCP_PUBLIC_URL,
        CHART_RENDER_CHROME_PATH: process.env.CHART_RENDER_CHROME_PATH,
        OVERLAYS_WORKSPACE: process.env.OVERLAYS_WORKSPACE,
        OVERLAYS_BASE_URL: process.env.OVERLAYS_BASE_URL,
        OVERLAYS_HISTORY_TOKEN: process.env.OVERLAYS_HISTORY_TOKEN,
        READER_MUSIC_ORG_ID: process.env.READER_MUSIC_ORG_ID,
        READER_PUBLIC_CHARTS_ENABLED: process.env.READER_PUBLIC_CHARTS_ENABLED,
        READER_MUSIC_ALLOWED_ORIGINS: process.env.READER_MUSIC_ALLOWED_ORIGINS,
        RESEND_FROM_EMAIL_BROSLAZ: process.env.RESEND_FROM_EMAIL_BROSLAZ,
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
        BRIDGE_SA_CLIENT_EMAIL: process.env.BRIDGE_SA_CLIENT_EMAIL,
        BRIDGE_SA_PRIVATE_KEY: process.env.BRIDGE_SA_PRIVATE_KEY,
        BRIDGE_SA_PRIVATE_KEY_ID: process.env.BRIDGE_SA_PRIVATE_KEY_ID,
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
        NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    },
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
})
