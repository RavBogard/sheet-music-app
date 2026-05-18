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

        // Dynamic import — react-pdf pulls in pdfjs, which touches DOMMatrix
        // at module-evaluation time. If we import at the top, Next's
        // static-prerender for `/perform` (the route is statically exported)
        // fails with `ReferenceError: DOMMatrix is not defined`.
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

        return () => {
            cancelled = true
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
