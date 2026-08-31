import type { SetlistTrack } from "@/types/models"
import type { MusicState } from "@/lib/store"
import type { ViewerKind } from "./resolveViewerKind"
import { estimateKey, transposeChord, keyUsesFlats } from "@/lib/music-math"
import { generatePdfBlob, type GeneratePrintPayload } from "@/lib/print-generation"

/**
 * "Print this chart" — desktop-only PDFOverlay toolbar action. Prints ONLY
 * the chart currently open, in the key/capo currently displayed, and never
 * touches the whole-setlist `PrintModal` packet.
 *
 * Routes on `resolveViewerKind` — PDFOverlay's canonical classifier — same
 * shortest-correct-path table as the render branch in PDFOverlay.tsx:
 *   - `pdf`, untransposed → original bytes, hidden-iframe print (vector, all
 *     pages, no server round trip).
 *   - `pdf`, transposed   → POST /api/setlist/print (`omitCover: true`,
 *     single track), then the same hidden-iframe print, so paper matches the
 *     transposed screen.
 *   - `image`             → original bytes, hidden-iframe print.
 *   - `text` / `chordpro` → POST /api/setlist/print always. Unlike `pdf`
 *     there's no "just print the original bytes" shortcut — the on-screen
 *     render for these kinds is already a server-shaped chord-over-lyric
 *     layout, not the raw file.
 *   - `musicxml`          → browser-native print of the live OSMD SVG. This
 *     is the ONLY MusicXML print path today — print-pipeline.ts has no
 *     MusicXML branch at all.
 *   - `audio` / `unknown` → callers must not invoke this; the toolbar hides
 *     the control for these kinds.
 */

/**
 * Derive the flat/sharp spelling the toolbar's transpose button is CURRENTLY
 * showing, so a printed chord chart matches the screen instead of silently
 * reverting to sharps. This is the identical formula already computed
 * independently in `PerformanceToolbar`'s `detectedKey`/`buttonLabel` and in
 * `useSmartTransposer`'s chord-overlay `preferFlats` — a third, deliberate
 * application of an existing convention, not a new classifier.
 */
export function currentDisplayedPreferFlats(
    aiState: MusicState["aiState"],
    musicXmlKey: string | null,
    transposition: number,
): boolean | undefined {
    const chords = Object.values(aiState.pageData).flatMap((p) =>
        p.chords.map((c) => c.originalText || c.text),
    )
    const aiEstimate = chords.length === 0 ? null : estimateKey(chords)
    const detectedKey = aiEstimate ?? musicXmlKey ?? null
    const targetKey =
        detectedKey && transposition !== 0 ? transposeChord(detectedKey, transposition) : detectedKey
    return keyUsesFlats(targetKey || "C")
}

export type PrintCurrentChartTrack = Pick<
    SetlistTrack,
    "fileId" | "fileName" | "mimeType" | "title" | "key" | "tune" | "notes" | "leadMusician" | "type"
>

export interface PrintCurrentChartParams {
    viewerKind: ViewerKind
    track: PrintCurrentChartTrack
    /** `/api/drive/file/<id>` — the network fallback used when the file
     *  isn't cached in offline-idb. Mirrors PDFOverlay's own `networkUrl`. */
    networkUrl: string
    transposition: number
    preferFlats?: boolean
    capoFret: number
}

/** IDB-first original-bytes fetch — mirrors PDFOverlay's own `fileUrl`
 *  resolution, but re-run fresh at print time instead of trusting render
 *  state that might be mid-resolution. */
async function fetchOriginalChartBlob(fileId: string, networkUrl: string): Promise<Blob> {
    const { getFile } = await import("@/lib/offline-idb")
    const cached = await getFile(fileId)
    if (cached) return cached
    const res = await fetch(networkUrl)
    if (!res.ok) {
        throw new Error(`Couldn't load the chart to print (server said ${res.status}).`)
    }
    return await res.blob()
}

/** POST /api/setlist/print for a single track, `omitCover: true`, carrying
 *  the live transposition/capo/preferFlats so paper matches the screen. */
async function fetchServerPrintBlob(params: {
    track: PrintCurrentChartTrack
    transposition: number
    preferFlats?: boolean
    capoFret: number
}): Promise<Blob> {
    const { track, transposition, preferFlats, capoFret } = params
    const title = track.title || "Chart"
    const payload: GeneratePrintPayload = {
        title,
        date: "",
        coverOnly: false,
        omitCover: true,
        tracks: [
            {
                title,
                key: track.key || "",
                tune: track.tune || "",
                notes: track.notes || "",
                leadMusician: track.leadMusician || "",
                fileId: track.fileId,
                fileName: track.fileName,
                mimeType: track.mimeType,
                transposition,
                preferFlats: !!preferFlats,
                capoFret,
                omitPdf: false,
                type: track.type,
            },
        ],
    }
    return generatePdfBlob(payload)
}

/**
 * Print a Blob (PDF or image) by loading it into a hidden `<iframe>` and
 * calling the frame's native `print()` — vector quality, every page, no
 * server round trip once the bytes are in hand.
 *
 * Resolves once `print()` has been issued (not once the OS dialog closes —
 * that part is the browser's business and the caller's busy state should
 * clear once the file is ready, not stay spinning behind a modal dialog the
 * user can already see).
 */
export function printBlobInHiddenIframe(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob)
        const iframe = document.createElement("iframe")
        iframe.setAttribute("aria-hidden", "true")
        iframe.style.position = "fixed"
        iframe.style.right = "0"
        iframe.style.bottom = "0"
        iframe.style.width = "0"
        iframe.style.height = "0"
        iframe.style.border = "0"

        let settled = false
        let fallbackTimer: ReturnType<typeof setTimeout> | undefined
        const onAfterPrint = () => {
            cleanup()
        }
        const cleanup = () => {
            if (settled) return
            settled = true
            clearTimeout(loadTimeout)
            if (fallbackTimer) clearTimeout(fallbackTimer)
            try {
                iframe.contentWindow?.removeEventListener("afterprint", onAfterPrint)
            } catch {
                /* cross-origin or already torn down — nothing to remove */
            }
            // Give the print dialog a beat before the frame (and its blob
            // URL) disappear out from under it.
            setTimeout(() => {
                try {
                    document.body.removeChild(iframe)
                } catch {
                    /* already gone */
                }
                URL.revokeObjectURL(url)
            }, 1000)
        }

        const loadTimeout = setTimeout(() => {
            cleanup()
            reject(new Error("Timed out preparing the chart for print."))
        }, 20000)

        iframe.onload = () => {
            clearTimeout(loadTimeout)
            try {
                const win = iframe.contentWindow
                if (!win) throw new Error("Couldn't open the print preview.")
                win.addEventListener("afterprint", onAfterPrint)
                win.focus()
                win.print()
                resolve()
                // Some browsers never fire afterprint reliably on a
                // cross-document iframe — clean up regardless once the
                // dialog has had time to run its course.
                fallbackTimer = setTimeout(cleanup, 60000)
            } catch (err) {
                cleanup()
                reject(err instanceof Error ? err : new Error(String(err)))
            }
        }
        iframe.onerror = () => {
            clearTimeout(loadTimeout)
            cleanup()
            reject(new Error("Couldn't load the chart for print."))
        }

        document.body.appendChild(iframe)
        iframe.src = url
    })
}

/** The data attribute SmartScoreViewer stamps on its OSMD container — the
 *  print stylesheet (`globals.css` `body.printing-chart`) isolates exactly
 *  this element. */
export const MUSICXML_PRINT_TARGET_SELECTOR = '[data-print-target="musicxml-score"]'

/**
 * Print the live-rendered MusicXML (OSMD SVG) — the only print path for
 * MusicXML today (print-pipeline.ts has no MusicXML branch). Toggles a
 * body-level class the `@media print` block in globals.css keys off of, so
 * only the score container survives onto paper.
 */
export function printMusicXmlChart(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!document.querySelector(MUSICXML_PRINT_TARGET_SELECTOR)) {
            reject(new Error("The score hasn't finished rendering yet."))
            return
        }
        document.body.classList.add("printing-chart")

        let settled = false
        let fallbackTimer: ReturnType<typeof setTimeout> | undefined
        const onAfterPrint = () => {
            cleanup()
            resolve()
        }
        const cleanup = () => {
            if (settled) return
            settled = true
            document.body.classList.remove("printing-chart")
            window.removeEventListener("afterprint", onAfterPrint)
            if (fallbackTimer) clearTimeout(fallbackTimer)
        }

        window.addEventListener("afterprint", onAfterPrint)
        try {
            window.print()
            fallbackTimer = setTimeout(() => {
                cleanup()
                resolve()
            }, 60000)
        } catch (err) {
            cleanup()
            reject(err instanceof Error ? err : new Error(String(err)))
        }
    })
}

/** Entry point wired from PDFOverlay into the toolbar's "Print this chart"
 *  button. Throws (never silently no-ops) on any kind/state it can't print,
 *  so the caller can surface a visible error. */
export async function printCurrentChart(params: PrintCurrentChartParams): Promise<void> {
    const { viewerKind, track, networkUrl, transposition, preferFlats, capoFret } = params

    if (viewerKind === "musicxml") {
        await printMusicXmlChart()
        return
    }

    if (viewerKind === "audio" || viewerKind === "unknown") {
        throw new Error("Printing isn't available for this chart type.")
    }

    if (!track.fileId) {
        throw new Error("This chart has no file to print.")
    }

    if (viewerKind === "image") {
        const blob = await fetchOriginalChartBlob(track.fileId, networkUrl)
        await printBlobInHiddenIframe(blob)
        return
    }

    if (viewerKind === "text" || viewerKind === "chordpro") {
        const blob = await fetchServerPrintBlob({ track, transposition, preferFlats, capoFret })
        await printBlobInHiddenIframe(blob)
        return
    }

    // viewerKind === "pdf"
    if (transposition !== 0) {
        const blob = await fetchServerPrintBlob({ track, transposition, preferFlats, capoFret })
        await printBlobInHiddenIframe(blob)
        return
    }
    const blob = await fetchOriginalChartBlob(track.fileId, networkUrl)
    await printBlobInHiddenIframe(blob)
}
