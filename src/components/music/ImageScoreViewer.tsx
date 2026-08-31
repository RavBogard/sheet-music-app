"use client"

import { useEffect, useState } from "react"
import { Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMusicStore } from "@/lib/store"

interface ImageScoreViewerProps {
    url: string
    alt?: string
}

export function ImageScoreViewer({ url, alt }: ImageScoreViewerProps) {
    const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading")
    // WS-15: bump to remount the <img> and re-attempt the load. Remount (NOT a
    // cache-bust query param) keeps signed Storage URLs valid — their signature
    // covers the query string, so appending `?_r=` would 403. The browser owns
    // the request here (unlike PDFViewer, which fetches bytes itself and can
    // cache-bust safely).
    const [reloadNonce, setReloadNonce] = useState(0)
    // WS-06: honor the toolbar/store zoom (restored per-device from chartZoom on
    // queue transition, exactly like PDF). CSS `zoom` scales the element's LAYOUT
    // box, so the `overflow-auto` container can scroll/pan a zoomed image to its
    // edges — `transform: scale()` would not grow the scroll area. Supported on
    // the target browsers (iPad WebKit + desktop Chrome; Firefox 126+). zoom 1
    // keeps the current object-contain fit-to-container baseline.
    const zoom = useMusicStore((s) => s.zoom)

    useEffect(() => {
        setStatus("loading")
        setReloadNonce(0)
    }, [url])

    if (!url) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <p className="text-muted-foreground">No chart to display</p>
            </div>
        )
    }

    return (
        // WAVE1 Bug 1 (2026-08-31) — same centring-crop as PDFViewer, but on
        // BOTH axes: `items-center justify-center` on an `overflow-auto` flex
        // container places an oversized child's start edges at a negative offset
        // from the scroll origin, so a zoomed image rests with its left AND top
        // edges off-screen (unrecoverable in Chromium, backwards-swipe-only in
        // WebKit). Centring moves to `m-auto` on the <img>: auto margins absorb
        // only POSITIVE free space (CSS Flexbox L1 §9.5 main axis / §9.6 cross
        // axis), so the image still centres when it fits and anchors to the
        // top-left when it does not. See e2e/flex-scroll-reachability.spec.ts.
        <div
            data-image-scroll=""
            className="relative flex h-full w-full items-start justify-start overflow-auto bg-background"
        >
            {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}
            {status === "error" && (
                <div
                    role="alert"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground"
                >
                    <AlertCircle className="h-8 w-8" aria-hidden="true" />
                    <p>Couldn&apos;t load this image.</p>
                    <Button
                        variant="secondary"
                        className="h-11"
                        onClick={() => {
                            setStatus("loading")
                            setReloadNonce((n) => n + 1)
                        }}
                    >
                        <RefreshCw className="h-4 w-4" />
                        Retry
                    </Button>
                </div>
            )}
            {/* WS-06: CSS `zoom` scales the image + its layout box (pannable inside
                the overflow-auto parent); native pinch-zoom still works on touch.
                WS-15: `key={reloadNonce}` remounts on Retry → the browser
                re-requests the same url (signature-safe). */}
            <img
                key={reloadNonce}
                src={url}
                alt={alt ?? "Chart"}
                style={{ zoom }}
                className={
                    // `m-auto` is the centring mechanism (see the container
                    // comment above) — it must NOT be paired with
                    // items-center/justify-center on the scroller.
                    "m-auto max-h-full max-w-full object-contain transition-opacity duration-200 motion-reduce:transition-none " +
                    (status === "loaded" ? "opacity-100" : "opacity-0")
                }
                onLoad={() => setStatus("loaded")}
                onError={() => setStatus("error")}
                draggable={false}
            />
        </div>
    )
}
