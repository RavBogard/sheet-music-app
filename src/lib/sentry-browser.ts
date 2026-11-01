/**
 * The browser Sentry client, trimmed (perf audit P2-6).
 *
 * The old client config did `import("@sentry/nextjs")` and used the namespace,
 * which defeats tree-shaking: a 378-392 KB chunk on every first load, /login
 * and Perform included. This module takes only what the app uses from
 * `@sentry/browser` (the SDK `@sentry/nextjs` wraps on the client), so the
 * lazily loaded chunk is a fraction of that. It is only ever reached through
 * `loadSentryBrowser()` in `sentry-lazy.ts`.
 *
 * `@sentry/browser` and `@sentry/nextjs` are pinned to the SAME exact version
 * in package.json, so both share one `@sentry/core` and one client: server
 * code and the sync engine's `@sentry/nextjs` captures land on the client
 * started here. Bump them together; `sentry-version-lockstep.test.ts` fails
 * if they differ.
 *
 * What the Next wrapper added and this drops: route-named navigation spans
 * (traces are named by URL instead) and its SDK metadata tag. Error capture,
 * breadcrumbs, release, environment and the bearer-token scrubber are the same.
 */
import { browserTracingIntegration, captureException, captureMessage, init } from "@sentry/browser"
import { redactBearerTokens } from "@/lib/sentry-redact"

let started = false

/** Start the client once. False when no DSN is configured. */
export function startSentryBrowser(): boolean {
    if (started) return true
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
    if (!dsn) return false
    started = true
    init({
        dsn,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
        release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "dev",
        integrations: [browserTracingIntegration()],
        tracesSampleRate: 0.1,
        // Session replay stays off (privacy and bandwidth on the band iPads);
        // no replay integration is loaded, so no replay sample rates either.
        ignoreErrors: [
            // React streaming hydration internals — fires when browser extensions
            // or rapid navigation remove DOM nodes before React can swap Suspense
            // fallbacks. Not actionable; does not affect functionality.
            "Cannot read properties of null (reading 'parentNode')",
        ],
        beforeSend: redactBearerTokens,
    })
    return true
}

export { captureException, captureMessage }
