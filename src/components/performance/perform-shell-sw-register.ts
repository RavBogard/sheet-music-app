/**
 * Register the perform-shell service worker.
 *
 * Idempotent: guarded by a sessionStorage one-shot flag so a single tab
 * only fires `register()` once per page-load lifecycle. The flag pattern
 * mirrors `src/lib/firebase.ts`'s recovery-flag — survives reloads,
 * scoped to the tab, never reset by a `load` event (the cycle-9
 * recovery-loop fingerprint).
 *
 * The SW is scoped to `/perform/` only. Other surfaces (admin, library,
 * dashboard) never see the SW. See
 * `docs/superpowers/specs/2026-05-28-perform-shell-sw-design.md`.
 *
 * Hard rules enforced here (NOT just by the SW file):
 *   - No `controllerchange` listener (would re-introduce the cycle-9
 *     auto-reload fingerprint).
 *   - No `updatefound` listener that auto-reloads.
 *   - No `unregister()` calls — the SW lives as long as the browser
 *     keeps it. Users can clear it manually via DevTools if ever needed.
 *   - All errors swallowed with `logger.warn`. SW registration failures
 *     MUST NOT break the page.
 */

import { logger } from "@/lib/logger"

const SESSION_FLAG = "perform-shell-sw-registered"
const SW_PATH = "/perform-shell-sw.js"
const SW_SCOPE = "/perform/"

/**
 * Get the version string injected into the SW URL.
 *
 * Vercel sets `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` at build time on every
 * deploy. Local builds (no Vercel env) fall back to `'dev'` — that means
 * local-build caches all share one namespace, which is fine because
 * local-build cache hygiene isn't a real concern (DevTools → Application
 * → Clear storage if it ever matters).
 */
function getSwVersion(): string {
    const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    if (sha && sha.length >= 7) return sha.slice(0, 10)
    return "dev"
}

export async function registerPerformShellSW(): Promise<void> {
    // Browser support gate.
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return

    // One-shot per tab. Survives reloads (sessionStorage), scoped to tab
    // (not localStorage). Set BEFORE the async work to make the flag
    // genuinely one-shot even under double-mount (React StrictMode) or
    // rapid navigation.
    try {
        if (sessionStorage.getItem(SESSION_FLAG) === "1") return
        sessionStorage.setItem(SESSION_FLAG, "1")
    } catch {
        // sessionStorage unavailable (private mode, embedded webview, etc.).
        // Proceed without the guard — register() itself is idempotent at
        // the browser level (same URL + same scope = same registration).
    }

    try {
        const version = getSwVersion()
        const swUrl = `${SW_PATH}?v=${encodeURIComponent(version)}`
        await navigator.serviceWorker.register(swUrl, { scope: SW_SCOPE })
        logger.info("[perform-shell-sw] registered", { version, scope: SW_SCOPE })
    } catch (err) {
        // Registration failures must not break the page. Log and move on.
        logger.warn("[perform-shell-sw] registration failed:", err)
    }
}
