/**
 * Sentry edge-runtime configuration (Middleware, Edge Functions).
 * Activate by setting NEXT_PUBLIC_SENTRY_DSN in your environment.
 */
import * as Sentry from "@sentry/nextjs"
import { redactBearerTokens } from "@/lib/sentry-redact"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
        release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "dev",
        tracesSampleRate: 0.1,
        beforeSend: redactBearerTokens,
    })
}
