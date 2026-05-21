"use client"

import { useEffect } from "react"
import { PerformanceOfflineIndicator } from "@/components/performance/PerformanceOfflineIndicator"

/**
 * Pre-warm the PDF.js worker on Perform-route mount so the worker module is
 * already cached + executed by the time the first chart's <Document> mounts.
 *
 * Cowork CF1 UAT (2026-05-15, §7.1) flagged a 30s+ event-loop wedge when
 * opening Perform mode for the first chart: the worker URL stayed "pending"
 * for the duration, and PDF.js fell back to main-thread parsing — that's
 * what locked the renderer (and timed out the Playwright screenshot call).
 *
 * Lazy worker init is fine in theory, but `<Document file={src}>` mounts
 * the same tick the user navigates into Perform, so the worker fetch races
 * with PDF parsing. Pre-warming on the layout (which mounts the route
 * boundary BEFORE the chart's bytes are fetched) gives the worker a head
 * start.
 */
function PdfWorkerPreload() {
    useEffect(() => {
        if (typeof document === "undefined") return
        let cancelled = false
        let link: HTMLLinkElement | null = null
        let scheduledHandle: number | null = null
        let scheduledFallback: ReturnType<typeof setTimeout> | null = null

        // UNAUTH-009 (cycle-4 supplement, 2026-05-18): on slow-3G the
        // 1.05MB react-pdf + worker chunk competing with initial page
        // hydration drove TTFC to 44s. Defer the preload until the
        // browser is idle so it can't steal bandwidth from the SSR'd
        // setlist's hydration + first-paint critical path. The CF1
        // UAT 2026-05-15 wedge this preload was designed to fix still
        // gets the warm-up (PDFOverlay's `<Document>` mounts only on
        // user tap, by which point idle has fired on every realistic
        // network); we just stop hogging the pre-hydration window.
        const startPreload = () => {
            if (cancelled) return
            // Dynamic import — react-pdf pulls in pdfjs, which touches
            // DOMMatrix at module-evaluation time. If we import at the
            // top, Next's static-prerender for `/perform` (the route is
            // statically exported) fails with `ReferenceError: DOMMatrix
            // is not defined`.
            void import("react-pdf").then(({ pdfjs }) => {
                if (cancelled) return
                const href = `/pdf.worker.min.${pdfjs.version}.mjs`

                // Force-set workerSrc — react-pdf's barrel module assigns a
                // bare-string placeholder (`'pdf.worker.mjs'`) at its own
                // module-load time, so a `!workerSrc` guard would skip the
                // override and fake-worker would later try to `import()` that
                // unresolvable specifier. See PDFViewer.tsx for the full
                // post-mortem on the 2026-05-15 prod incident.
                pdfjs.GlobalWorkerOptions.workerSrc = href

                // `modulepreload` tells the browser to fetch + compile + cache
                // without executing — exactly the warm-up we want.
                link = document.createElement("link")
                link.rel = "modulepreload"
                link.href = href
                link.crossOrigin = "anonymous"
                document.head.appendChild(link)

                // Belt-and-suspenders: kick off a fetch so the response sits in
                // HTTP cache even if the browser ignores modulepreload.
                fetch(href, { cache: "force-cache" }).catch(() => {
                    /* fallback path in PDFViewer handles a real worker failure */
                })
            })

            // F1 offline-precache: warm the lazily-imported overlay + per-format
            // viewer chunks so a chart still OPENS offline even if it was never
            // tapped while online. PDFOverlay + the viewers are dynamic-imported,
            // so their JS can't be fetched once WiFi drops — without this a band
            // member who hits "Save offline" then loses WiFi before tapping a
            // chart hits a chunk-load error instead of the cached chart. The
            // chart BYTES are cached separately in IndexedDB (SaveOfflineButton);
            // this warms the CODE. Fire-and-forget; non-fatal (online tap still
            // lazy-loads on demand).
            void import("@/components/performance/PDFOverlay").catch(() => {})
            void import("@/components/music/PDFViewer").catch(() => {})
            void import("@/components/music/TextScoreViewer").catch(() => {})
            void import("@/components/music/SmartScoreViewer").catch(() => {})
            void import("@/components/music/ImageScoreViewer").catch(() => {})
        }

        // Use requestIdleCallback where available with a 2s deadline (long
        // enough for slow-3G FCP + first hydration tick; short enough that
        // the preload always runs well before the user could realistically
        // tap a chart). Fall back to setTimeout(2s) on Safari iOS, which
        // omits rIC. Both honor the visibility of the tab — if the user
        // hasn't focused us yet we don't bother warming.
        const ric: typeof window.requestIdleCallback | undefined =
            typeof window !== "undefined" ? window.requestIdleCallback : undefined
        if (typeof ric === "function") {
            scheduledHandle = ric(() => {
                scheduledHandle = null
                startPreload()
            }, { timeout: 2000 })
        } else {
            scheduledFallback = setTimeout(() => {
                scheduledFallback = null
                startPreload()
            }, 2000)
        }

        return () => {
            cancelled = true
            if (scheduledHandle !== null && typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
                try { window.cancelIdleCallback(scheduledHandle) } catch { /* noop */ }
            }
            if (scheduledFallback !== null) {
                clearTimeout(scheduledFallback)
            }
            if (link && link.parentNode) {
                try {
                    link.parentNode.removeChild(link)
                } catch {
                    /* link already gone — fine */
                }
            }
        }
    }, [])
    return null
}

export default function PerformLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // P2-011 (WCAG 1.3.1): /perform routes live outside the (main) route group
    // and thus don't inherit (main)/layout.tsx's <main id="main-content"> wrapper.
    // Without a real <main> landmark the global "Skip to main content" link
    // (in AppNavigation — though AppNavigation is also outside this tree) has
    // nothing to target, and axe flags landmark-main on every /perform surface.
    // Using <main> instead of <div> here gives the landmark + keeps the id stable
    // for any callers wiring skip-link/anchor links to #main-content.
    return (
        <main id="main-content" className="min-h-screen">
            <PdfWorkerPreload />
            <PerformanceOfflineIndicator />
            {children}
        </main>
    )
}
