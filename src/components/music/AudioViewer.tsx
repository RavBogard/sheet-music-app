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
 * Source-resolution mirrors PDFViewer's pattern: try the offline-idb
 * cached blob first (so a Save-Offline'd setlist plays during a network
 * blackout), fall back to the same `/api/drive/file/<id>` network path
 * the other viewers use. We hand the resolved URL straight to
 * `<audio src>` — there's no special bytes loader needed; the native
 * element handles HTTP range requests + buffering itself.
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

    // Resolve src: IDB-first, network fallback. Mirrors PDFOverlay's
    // own resolve() pattern for the non-PDF viewers. Cleans up the
    // object URL on unmount / fileId change to avoid leaks.
    useEffect(() => {
        let cancelled = false
        let objectUrl: string | null = null

        async function resolve() {
            if (!fileId) {
                setSrc("")
                setStatus("error")
                return
            }
            try {
                const { getFile } = await import("@/lib/offline-idb")
                const blob = await getFile(fileId)
                if (cancelled) return
                if (blob) {
                    objectUrl = URL.createObjectURL(blob)
                    setSrc(objectUrl)
                } else {
                    setSrc(`/api/drive/file/${fileId}`)
                }
                setStatus("loading")
            } catch {
                if (cancelled) return
                // IDB unavailable (private-mode Safari etc.) — try the
                // network path anyway so we don't strand the viewer.
                setSrc(`/api/drive/file/${fileId}`)
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
