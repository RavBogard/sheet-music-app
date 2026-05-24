"use client"

import { useEffect, useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"

/**
 * Audio-bond first-class viewer (F7 — audio-viewer-f7, 2026-05-24).
 *
 * Renders an `<audio controls>` element for tracks bonded to an audio
 * fileId (e.g. Yizkor "Adon Olam" mp3 at `12JfLCHy…`). Before F7 those
 * tracks fell through PDFOverlay's dispatch into PDFViewer and surfaced
 * as a "Failed to load PDF" 404 — see lane prompt for the full story.
 *
 * Source-resolution: **online → network URL first; offline → IDB blob:
 * fallback.** Mirrors `webkit-pdf-reload-fix` (`575bc47ae`, R1 Finding B):
 * iPad WebKit rejects `<audio src="blob:…">` even for well-formed cached
 * MP3 blobs, firing the audio element's `onError` immediately and
 * landing the viewer in the `status='error'` "Audio file not found"
 * state — exactly the F-2 mis-classified stuck-spinner mechanism that
 * coder-5's `ipad-stuck-spinner-characterization` Tier-0 research
 * (`1aea77464`) caught at step-12 of the Shavuot Yizkor walk. So
 * `/api/drive/file/<id>` (which serves `audio/mpeg` with `Range:`
 * support + s-maxage CDN cache) is the safe default. The IDB blob:
 * path is still attempted when `navigator.onLine === false` as a
 * best-effort offline-play branch — still subject to WebKit's
 * blob:-rejection, but no worse than today's always-broken offline
 * state.
 *
 * Touch sizing follows iPad band hardware (820×1180 WebKit) — the
 * native controls are sized large enough that finger taps don't
 * mis-fire on the scrub bar; we don't restyle them.
 */
export interface AudioViewerProps {
    /** Library fileId — used to fetch the IDB-cached blob and as the
     *  `/api/drive/file/<id>` fallback path. */
    fileId: string
    /** Track title shown to screen readers via `aria-label`. */
    title?: string
}

export function AudioViewer({ fileId, title }: AudioViewerProps) {
    const [src, setSrc] = useState<string>("")
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

    // Resolve src: network URL by default (the only path that survives
    // iPad WebKit's `<audio src="blob:…">` rejection), with an IDB
    // blob: fallback attempted ONLY when the browser reports offline.
    // Mirrors webkit-pdf-reload-fix (R1 Finding B). Object URL is
    // revoked on unmount / fileId change to avoid leaks.
    useEffect(() => {
        let cancelled = false
        let objectUrl: string | null = null

        async function resolve() {
            if (!fileId) {
                setSrc("")
                setStatus("error")
                return
            }
            const networkUrl = `/api/drive/file/${fileId}`

            // Online (default + SSR — navigator may be undefined): hand
            // the network URL to <audio>. The route serves audio/mpeg
            // with Range support; native element handles streaming.
            const online =
                typeof navigator === "undefined" || navigator.onLine !== false
            if (online) {
                setSrc(networkUrl)
                setStatus("loading")
                return
            }

            // Offline best-effort: try the IDB blob (may still be
            // rejected by WebKit; no worse than the always-broken
            // state pre-fix). Fall back to the network URL on miss /
            // IDB unavailability so we at least surface a clean
            // network-error state when connectivity returns.
            try {
                const { getFile } = await import("@/lib/offline-idb")
                const blob = await getFile(fileId)
                if (cancelled) return
                if (blob) {
                    objectUrl = URL.createObjectURL(blob)
                    setSrc(objectUrl)
                } else {
                    setSrc(networkUrl)
                }
                setStatus("loading")
            } catch {
                if (cancelled) return
                setSrc(networkUrl)
                setStatus("loading")
            }
        }

        resolve()
        return () => {
            cancelled = true
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [fileId])

    if (!fileId) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <p className="text-muted-foreground">No audio to play</p>
            </div>
        )
    }

    return (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-6">
            {status === "loading" && !src && (
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                    <span>Loading audio…</span>
                </div>
            )}
            {status === "error" && (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <AlertCircle className="h-8 w-8" aria-hidden="true" />
                    <p>Audio file not found</p>
                </div>
            )}
            {src && status !== "error" && (
                <>
                    {title && (
                        <p className="max-w-full truncate text-center text-lg font-medium text-foreground">
                            {title}
                        </p>
                    )}
                    {/* Native controls: WebKit sizes the scrub bar / play
                        button at finger-tap sizes by default. We don't
                        restyle so accessibility behavior + iOS lockscreen
                        media-session integration stay native. */}
                    <audio
                        key={src}
                        src={src}
                        controls
                        preload="metadata"
                        aria-label={title ? `Audio: ${title}` : "Audio"}
                        className="w-full max-w-2xl"
                        onLoadedMetadata={() => setStatus("ready")}
                        onError={() => setStatus("error")}
                    />
                </>
            )}
        </div>
    )
}
