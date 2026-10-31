"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { registerWebVitals, reportPageView } from "@/lib/web-vitals"

/**
 * Cycle-3.5 P2-017 — Mounts the web-vitals registrar on first client
 * render. The library buffers historical entries via PerformanceObserver
 * `buffered: true`, so even though useEffect fires after first paint we
 * still capture the LCP/FCP/TTFB entries that fired earlier.
 *
 * Lives inside layout.tsx body so every route picks it up.
 */
export function WebVitalsReporter() {
    const pathname = usePathname()
    useEffect(() => {
        void registerWebVitals()
    }, [])
    useEffect(() => {
        if (pathname) reportPageView(pathname)
    }, [pathname])
    return null
}
