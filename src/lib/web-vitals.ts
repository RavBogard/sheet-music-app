/**
 * Cycle-3.5 P2-017 — web-vitals client.
 *
 * Registers the standard CWV metric observers via the `web-vitals` library
 * and POSTs each entry to `/api/web-vitals`, which persists the observation
 * into `webVitalsObservations/{auto}` for later analysis.
 *
 * Daniel-ratified 2026-05-18T20:15Z (decisions.md). The cowork cycle-3.5
 * §P2-017 finding was that no surface emitted an LCP entry into the
 * post-load buffer — the observer attached too late. The product-side
 * fix is to ship the observer before-first-paint via the web-vitals
 * library, which internally uses PerformanceObserver with the
 * `buffered: true` option so it captures historical entries even if the
 * script loads after the metric fires.
 *
 * Five metrics:
 *   LCP (Largest Contentful Paint) — load performance
 *   CLS (Cumulative Layout Shift)  — visual stability
 *   INP (Interaction to Next Paint) — input responsiveness
 *   FCP (First Contentful Paint)    — perceived load
 *   TTFB (Time to First Byte)       — server + edge response
 *
 * Transport: `navigator.sendBeacon` so the payload survives `pagehide`
 * (web-vitals fires the final metric on unload). Falls back to
 * `fetch({ keepalive: true })` if sendBeacon is unavailable.
 */

export interface WebVitalReport {
    metric: "LCP" | "CLS" | "INP" | "FCP" | "TTFB"
    value: number
    rating: "good" | "needs-improvement" | "poor"
    id: string
    navigationType?: string
    surface: string
    deviceType: "mobile" | "tablet" | "desktop" | "unknown"
}

function detectDeviceType(): WebVitalReport["deviceType"] {
    if (typeof navigator === "undefined") return "unknown"
    const ua = navigator.userAgent
    if (/iPad|tablet/i.test(ua)) return "tablet"
    if (/Mobi|Android|iPhone/i.test(ua)) return "mobile"
    return "desktop"
}

function getSurface(): string {
    if (typeof window === "undefined") return "(server)"
    const path = window.location.pathname
    // Normalize dynamic segments so cardinality of `surface` stays bounded.
    // /setlists/abc123 → /setlists/[id]
    // /perform/setlist/xyz → /perform/setlist/[id]
    return path
        .replace(/\/setlists\/[^/]+/g, "/setlists/[id]")
        .replace(/\/perform\/setlist\/[^/]+/g, "/perform/setlist/[id]")
        .replace(/\/manage\/library-review\/[^/]+/g, "/manage/library-review/[id]")
}

function send(report: WebVitalReport): void {
    const body = JSON.stringify(report)
    try {
        if (
            typeof navigator !== "undefined" &&
            typeof navigator.sendBeacon === "function"
        ) {
            const blob = new Blob([body], { type: "application/json" })
            if (navigator.sendBeacon("/api/web-vitals", blob)) return
        }
        // Fallback path — keepalive lets the request survive page unload.
        void fetch("/api/web-vitals", {
            method: "POST",
            body,
            headers: { "Content-Type": "application/json" },
            keepalive: true,
        }).catch(() => {
            /* Web-vitals reporting is fail-open by design. */
        })
    } catch {
        /* Never let metric reporting break the page. */
    }
}

let registered = false

/**
 * Idempotent. Called from `<WebVitalsReporter>` on mount. The web-vitals
 * library registers PerformanceObservers internally and emits a single
 * report per metric per page-load.
 */
export async function registerWebVitals(): Promise<void> {
    if (typeof window === "undefined") return
    if (registered) return
    registered = true

    try {
        const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import(
            "web-vitals"
        )

        const handle = (
            metric:
                | { name: "LCP" | "CLS" | "INP" | "FCP" | "TTFB"; value: number; rating: "good" | "needs-improvement" | "poor"; id: string; navigationType?: string }
        ) => {
            const report: WebVitalReport = {
                metric: metric.name,
                value: Math.round(metric.value * 100) / 100,
                rating: metric.rating,
                id: metric.id,
                navigationType: metric.navigationType,
                surface: getSurface(),
                deviceType: detectDeviceType(),
            }
            send(report)
        }

        onLCP(handle)
        onCLS(handle)
        onINP(handle)
        onFCP(handle)
        onTTFB(handle)
    } catch {
        /* Library load failed — fail open, no metrics emitted. */
    }
}
