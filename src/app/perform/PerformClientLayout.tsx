"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { AuthedQueryProvider } from "@/components/authed-query-provider"
import { PerformanceOfflineIndicator } from "@/components/performance/PerformanceOfflineIndicator"
import { registerPerformShellSW } from "@/components/performance/perform-shell-sw-register"
import { KeepAwakeProvider } from "@/components/performance/keep-awake-context"
import { KeepAwakeBanner } from "@/components/performance/KeepAwakeBanner"
import { primeOfflineWorker } from "@/lib/pdf-worker-offline"
import { CHART_RENDERED_SELECTOR, createOpeningTracker, isChartOpenPath, warmViewerCode } from "@/lib/perform-warm"
import { loadPDFOverlay } from "@/lib/perform-chart-loaders"
import { AppNavigation } from "@/components/nav/AppNavigation"

/**
 * Perform warm-up: cache the chart code and the pdf.js worker for offline use,
 * without running any of it (perf audit P1-2 / P2-1).
 *
 * History: the CF1 UAT (2026-05-15) wedge came from the worker fetch racing
 * the first chart's parse, so the worker is warmed ahead of the first tap; F1
 * offline-precache warms PDFOverlay and the viewers so a chart still opens
 * after WiFi drops. Both goals stay. What changed:
 *
 * - pdf.js and OSMD are never evaluated ahead of a tap. The viewers' chunks
 *   are fetched into the caches (`warmViewerCode`), not `import()`ed; the old
 *   warm-up evaluated OSMD (1.2 MB) and pdf.js and cost about 1.5 s of long
 *   tasks at 4x CPU. Only the overlay shell is evaluated, once quiet.
 * - The worker is fetched ONCE (`primeOfflineWorker`, which also copies it to
 *   IndexedDB for offline opens). The old `modulepreload` plus a second
 *   `fetch` downloaded the 295 KB file twice. The version comes from the build
 *   (`NEXT_PUBLIC_PDFJS_VERSION`) so react-pdf isn't imported to read it;
 *   PDFViewer still sets `workerSrc` itself when a chart opens.
 * - It starts when the browser is idle (`requestIdleCallback`), or where
 *   that's missing (iPad Safari) after the first interaction or about 8 s
 *   without input — never on a fixed short timer.
 * - It waits while a chart is OPENING, and cancels an in-flight fetch so the
 *   chart's own requests have the network. Once the chart has painted, the
 *   fetches carry on (one at a time) so every format is cached mid-service.
 */
const IDLE_FALLBACK_MS = 8000
const AFTER_INTERACTION_MS = 1500
const INTERACTION_EVENTS = ["pointerdown", "keydown", "touchstart"] as const

/** Resolves when the page is quiet: an idle callback where the browser has
 *  one, else IDLE_FALLBACK_MS since the last input with no chart open. */
async function whenQuiet(signal: AbortSignal, lastInput: () => number): Promise<void> {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    if (typeof window.requestIdleCallback === "function") {
        while (!signal.aborted && chartIsOpen()) await sleep(1000)
        await new Promise<void>((r) => window.requestIdleCallback(() => r()))
        return
    }
    while (!signal.aborted) {
        const quietFor = performance.now() - lastInput()
        if (quietFor >= IDLE_FALLBACK_MS && !chartIsOpen()) return
        await sleep(Math.max(500, IDLE_FALLBACK_MS - quietFor))
    }
}

function chartIsOpen(): boolean {
    try {
        return isChartOpenPath(window.location.pathname)
    } catch {
        return false
    }
}

function PerformWarmUp() {
    useEffect(() => {
        if (typeof window === "undefined") return
        const ac = new AbortController()
        let started = false
        const chartOpening = createOpeningTracker(chartIsOpen, () => {
            try {
                return document.querySelector(CHART_RENDERED_SELECTOR) !== null
            } catch {
                return true
            }
        })
        let lastInput = performance.now()
        const markInput = () => { lastInput = performance.now() }
        for (const ev of INTERACTION_EVENTS) window.addEventListener(ev, markInput, { capture: true, passive: true })
        let idleHandle: number | null = null
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null

        const clearTriggers = () => {
            if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
                try { window.cancelIdleCallback(idleHandle) } catch { /* noop */ }
            }
            idleHandle = null
            if (fallbackTimer !== null) clearTimeout(fallbackTimer)
            fallbackTimer = null
            for (const ev of INTERACTION_EVENTS) window.removeEventListener(ev, onInteraction, true)
        }

        const start = () => {
            if (started || ac.signal.aborted) return
            started = true
            clearTriggers()
            void (async () => {
                while (!ac.signal.aborted && chartOpening()) {
                    await new Promise((r) => setTimeout(r, 1000))
                }
                if (ac.signal.aborted) return
                // The overlay SHELL only (toolbar, stores, gestures; no pdf.js,
                // no OSMD) is evaluated ahead of the first tap, as the old
                // warm-up did, so a first open doesn't pay for it. Only when
                // the page is really quiet: an idle callback, or (iPad Safari)
                // 8 s with no input, never while a chart is open.
                void whenQuiet(ac.signal, () => lastInput).then(() => {
                    if (!ac.signal.aborted && !chartIsOpen()) void loadPDFOverlay().catch(() => {})
                })
                // Worker first: it is what the first PDF needs soonest.
                await primeOfflineWorker()
                // Pauses only while a chart is opening; once it has painted the
                // fetches resume (fetch only, one at a time) so every format is
                // cached during a service (review S2).
                await warmViewerCode({ signal: ac.signal, isPaused: chartOpening, pollMs: 500 })
            })()
        }

        // Fallback (no requestIdleCallback): after the first interaction has
        // settled, or after IDLE_FALLBACK_MS with no input at all.
        const armIdleTimer = (ms: number) => {
            if (fallbackTimer !== null) clearTimeout(fallbackTimer)
            fallbackTimer = setTimeout(start, ms)
        }
        function onInteraction() {
            armIdleTimer(AFTER_INTERACTION_MS)
        }

        if (typeof window.requestIdleCallback === "function") {
            idleHandle = window.requestIdleCallback(() => {
                idleHandle = null
                start()
            }, { timeout: IDLE_FALLBACK_MS })
        } else {
            armIdleTimer(IDLE_FALLBACK_MS)
            for (const ev of INTERACTION_EVENTS) {
                window.addEventListener(ev, onInteraction, { capture: true, passive: true })
            }
        }

        return () => {
            ac.abort()
            clearTriggers()
            for (const ev of INTERACTION_EVENTS) window.removeEventListener(ev, markInput, true)
        }
    }, [])
    return null
}

/**
 * Register the perform-shell service worker on /perform/* mount.
 *
 * Fire-and-forget; the helper is idempotent (sessionStorage one-shot per
 * tab) and never throws. Lives as a sibling island next to <PerformWarmUp/>
 * so registration kicks in alongside the other perform-route bootstraps.
 *
 * See docs/superpowers/specs/2026-05-28-perform-shell-sw-design.md for the
 * F-C12-R2-009 design rationale + cycle-9 recovery-loop constraints this
 * helper deliberately avoids.
 */
function PerformShellSWBootstrap() {
    useEffect(() => {
        void registerPerformShellSW()
        // PERF-18: ask the browser not to evict the offline charts. Once per
        // session; Safari may decline outside the Home-Screen app. Errors are
        // swallowed.
        try {
            if (sessionStorage.getItem("perform-persist-asked") !== "1") {
                sessionStorage.setItem("perform-persist-asked", "1")
                if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {})
            }
        } catch {
            // storage unavailable
        }
    }, [])
    return null
}

export function PerformClientLayout({
    children,
    branding,
}: {
    children: React.ReactNode
    /** Host-org branding, resolved server-side, for the shell on the listing. */
    branding?: { shortName?: string; logoUrl?: string; wordmarkUrl?: string }
}) {
    // One shell on every route: the /perform listing gets the same top bar and
    // tab bar as the rest of the app. The setlist page renders it from its own
    // layout; the open chart viewer (/perform/[fileId]) stays full-screen.
    const pathname = usePathname()
    const isListing = pathname === "/perform"
    // P2-011 (WCAG 1.3.1): /perform routes live outside the (main) route group
    // and thus don't inherit (main)/layout.tsx's <main id="main-content"> wrapper.
    // Without a real <main> landmark the global "Skip to main content" link
    // (in AppNavigation — though AppNavigation is also outside this tree) has
    // nothing to target, and axe flags landmark-main on every /perform surface.
    // Using <main> instead of <div> here gives the landmark + keeps the id stable
    // for any callers wiring skip-link/anchor links to #main-content.
    // KeepAwakeProvider (2026-08-31): ONE WakeLockSentinel for the whole
    // /perform tree. Both chart surfaces (`/perform/setlist/[id]` and
    // `/perform/[fileId]`) plus the toolbar toggle and the status banner now
    // read the same lock — previously each `useWakeLock()` call site owned a
    // separate sentinel, so "turn it off" released one and the screen stayed
    // on. The provider does NOT arm by itself; the chart surfaces ask via
    // <KeepAwakeAutoArm/>, which keeps FU-c12-3's "the anonymous /perform
    // landing never touches the WakeLock API" property intact.
    return (
        <AuthedQueryProvider>
            <KeepAwakeProvider>
                {isListing && (
                    <AppNavigation
                        serverOrgShortName={branding?.shortName}
                        serverLogoUrl={branding?.logoUrl}
                        serverWordmarkUrl={branding?.wordmarkUrl}
                    />
                )}
                <main
                    id="main-content"
                    className={isListing ? "min-h-screen pt-14" : "min-h-screen"}
                    style={isListing ? { paddingBottom: "var(--tabbar-h)" } : undefined}
                >
                    <PerformWarmUp />
                    <PerformShellSWBootstrap />
                    <LayoutOfflineIndicator />
                    {children}
                    <KeepAwakeBanner />
                </main>
            </KeepAwakeProvider>
        </AuthedQueryProvider>
    )
}

/**
 * PERF-16: the setlist page renders its own indicator (with the "N/M charts
 * ready" count). Rendering this one there too stacked two pills at the same
 * fixed position, so the layout's plain pill steps aside on setlist routes.
 */
function LayoutOfflineIndicator() {
    const pathname = usePathname()
    if (pathname?.startsWith("/perform/setlist/")) return null
    return <PerformanceOfflineIndicator />
}
