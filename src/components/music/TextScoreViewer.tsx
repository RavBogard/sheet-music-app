"use client"

import { useState, useEffect } from "react"
import { useMusicStore } from "@/lib/store"
import { transposeChord, keyUsesFlats } from "@/lib/music-math"
import { maxRenderedLineLength, fitFontSize } from "./text-score-layout"
import { Loader2, WrapText, Maximize2, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Text-bonded chart viewer (chord-over-lyrics monospace .txt charts).
 *
 * Source-resolution mirrors `AudioViewer` (`audio-viewer-f7`, 912ea2c3d):
 * try the offline-idb cached blob first, fall back to `/api/drive/file/<id>`
 * on miss. Closes ipad-sweep FINDINGS §F-1 — before
 * `ipad-text-viewer-fetch-fix` the viewer took a URL prop and was handed
 * `PDFOverlay`'s resolved `fileUrl`, which is a `blob:` object URL when
 * the chart is IDB-cached. iPad WebKit intermittently fails a `fetch()`
 * against a freshly-created object URL with "Load failed" — the same
 * race that bit the PDF path on 2026-05-22 (R1 Finding B, fixed by
 * `webkit-pdf-reload-fix` `575bc47ae`). We dodge it the same way: when
 * we have the blob in hand from `getFile()`, read it via `blob.text()`
 * (a direct Blob API read — no fetch round-trip), and only `fetch()` for
 * the network fallback path.
 *
 * Surfaces the C5D-001 XSS regression behavior unchanged — the fetched
 * bytes are rendered through React text children, never via raw HTML.
 */
interface TextScoreViewerProps {
    /** Library fileId — used to look up the offline blob and as the
     *  `/api/drive/file/<id>` fallback path. */
    fileId: string
}

export function TextScoreViewer({ fileId }: TextScoreViewerProps) {
    const transposition = useMusicStore((s) => s.transposition)
    /**
     * WAVE1 Bug 4 (2026-08-31) — the toolbar's zoom buttons used to do NOTHING
     * on a text chart. `PerformanceToolbar` renders them for every viewer kind
     * (only the fit toggle is gated on `isPdfChart`) and binds its "%" readout
     * to store `zoom`, but this component kept its zoom in component-local
     * `useState`. So a musician on one of the 66 text charts tapped +, watched
     * the percentage climb, and the chart did not move — the obvious recovery
     * action silently no-opped, on exactly the charts that need it most (the
     * fit-mode font is clamped to 11-15px, ~8.7-11.9pt at music-stand distance).
     *
     * Store `zoom` is now the single source of truth, matching PDFViewer
     * (`s.zoom` -> computeFitPageWidth), ImageScoreViewer (`s.zoom` -> CSS zoom)
     * and SmartScoreViewer (`s.zoom` -> OSMD fitBase * zoom). Going through
     * `setZoom` also means text charts finally get `chartZoom` write-through, so
     * a text chart's zoom is restored per chart instead of resetting to 100% on
     * every open.
     */
    const zoomLevel = useMusicStore((s) => s.zoom)
    const setZoom = useMusicStore((s) => s.setZoom)
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [wrapMode, setWrapMode] = useState(false)

    // Auto-enable wrap mode on small screens on initial load
    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setWrapMode(true)
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        async function loadText() {
            setLoading(true)
            setError(null)
            if (!fileId) {
                if (!cancelled) {
                    setError("Failed to load chart")
                    setLoading(false)
                }
                return
            }
            try {
                // IDB-first: read cached bytes directly through the Blob
                // API (`blob.text()`) — NO `fetch(blob:url)` round-trip,
                // which is the WebKit failure mode that surfaced as F-1.
                // `getFile` swallows its own IDB errors and returns null,
                // but we still wrap the import + call in try/catch so any
                // future change there can't strand the viewer.
                let text: string | null = null
                try {
                    const { getFile } = await import("@/lib/offline-idb")
                    const blob = await getFile(fileId)
                    if (cancelled) return
                    if (blob) {
                        text = await blob.text()
                    }
                } catch {
                    // IDB unavailable (Private-mode Safari, etc.) — fall
                    // through to the network path. Don't surface to UI.
                }
                if (cancelled) return
                if (text === null) {
                    const res = await fetch(`/api/drive/file/${fileId}`)
                    if (cancelled) return
                    if (!res.ok) throw new Error("Failed to load text file")
                    text = await res.text()
                    if (cancelled) return
                }
                setContent(text)
                setLoading(false)
            } catch (err: unknown) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load chart")
                    setLoading(false)
                }
            }
        }
        loadText()
        return () => { cancelled = true }
    }, [fileId])

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error || !content) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <p className="text-muted-foreground">{error || "Failed to load chart"}</p>
            </div>
        )
    }

    // Split content into lines and optionally Title/Artist header
    const lines = content.split(/\r?\n/)
    
    // Simple heuristic for chord lines
    const isChordToken = (token: string) => {
        const chordRegex = /^([A-G][b#]?)(m|maj|dim|aug|sus|add|\d)*(?:\/[A-G][b#]?)?$/i
        if (/^[|()\[\]\-,]+$/.test(token)) return true
        if (/^x\d$/i.test(token)) return true
        if (token.toUpperCase() === "N.C.") return true
        return chordRegex.test(token)
    }

    const isChordLine = (line: string): boolean => {
        const tokens = line.trim().split(/\s+/)
        if (tokens.length === 0 || tokens[0] === "") return false
        
        const validChords = tokens.filter(t => isChordToken(t)).length
        return (validChords / tokens.length) >= 0.75
    }

    // Attempt to guess if we should prefer flats based on the first chord we transpose
    // A better approach would be to estimateKey on the whole document, but this is simple and fast
    const preferFlats = transposition !== 0 ? undefined : undefined // default music-math behavior

    // --- PARSER LOGIC ---
    
    // Chunk parser for wrap mode
    const parseIntoChunks = (chordLine: string, lyricLine: string) => {
        const chunks: { chord: string, lyric: string, isChord: boolean }[] = []
        let match
        const chordPositions: { index: number, word: string }[] = []
        
        // Find all non-space tokens in the chord line
        const tokenRegex = /(\S+)/g
        while ((match = tokenRegex.exec(chordLine)) !== null) {
            chordPositions.push({ index: match.index, word: match[1] })
        }
        
        if (chordPositions.length > 0 && chordPositions[0].index > 0) {
            // Initial chunk for lyrics before the first chord
            chunks.push({
                chord: '',
                lyric: lyricLine.substring(0, chordPositions[0].index).padEnd(chordPositions[0].index, ' '),
                isChord: false
            })
        }
        
        for (let i = 0; i < chordPositions.length; i++) {
            const chordPos = chordPositions[i]
            const nextPos = chordPositions[i + 1]
            
            const isActualChord = isChordToken(chordPos.word)
            let displayChord = chordPos.word
            if (isActualChord) {
                displayChord = transposeChord(chordPos.word, transposition, preferFlats)
            }
            
            const endIdx = nextPos ? nextPos.index : Math.max(chordLine.length, lyricLine.length)
            const lyricChunk = lyricLine.substring(chordPos.index, endIdx)
            const paddedLyricChunk = lyricChunk.padEnd(endIdx - chordPos.index, ' ')
            
            chunks.push({
                chord: displayChord,
                lyric: paddedLyricChunk,
                isChord: isActualChord
            })
        }
        return chunks
    }

    // v11.2-05-01 (BUG-7): group chord/lyric chunks into WORD-ATOMIC units so
    // flex-wrap never breaks a single lyric word across lines (the prior bug:
    // chords over "Hallelujah" split it into "Hall"/"eluj"/"ah"). A break is
    // allowed only AFTER a chunk whose lyric ends at a word boundary (trailing
    // whitespace) or is empty; otherwise the word continues into the next chunk
    // and the two stay in the same non-breaking group. Fit mode is unaffected —
    // it renders chunks directly in a flex-nowrap row (alignment preserved).
    type Chunk = { chord: string; lyric: string; isChord: boolean }
    const groupChunksIntoWords = (chunks: Chunk[]): Chunk[][] => {
        const groups: Chunk[][] = []
        let current: Chunk[] = []
        for (const chunk of chunks) {
            current.push(chunk)
            const endsAtWordBoundary = chunk.lyric.length === 0 || /\s$/.test(chunk.lyric)
            if (endsAtWordBoundary) {
                groups.push(current)
                current = []
            }
        }
        if (current.length) groups.push(current)
        return groups
    }

    // Group lines
    type LineGroup =
        | { type: 'chord-lyric', id: number, chunks: { chord: string, lyric: string, isChord: boolean }[] }
        | { type: 'text-only', id: number, content: React.ReactNode, textLength: number }

    const parsedGroups: LineGroup[] = []
    
    for (let i = 0; i < lines.length; i++) {
        const current = lines[i]
        
        if (isChordLine(current)) {
            // It's a chord line
            if (i + 1 < lines.length) {
                const next = lines[i + 1]
                if (!isChordLine(next) && next.trim().length > 0) {
                    // It's a chord-lyric pair!
                    parsedGroups.push({
                        type: 'chord-lyric',
                        id: i,
                        chunks: parseIntoChunks(current, next)
                    })
                    i++ // skip next line
                    continue
                }
            }
            // Chord line without lyrics
            parsedGroups.push({
                type: 'chord-lyric',
                id: i,
                chunks: parseIntoChunks(current, '')
            })
        } else {
            // Text-only line. Chart .txt files are user-uploaded plain monospace;
            // render verbatim via React text children so any embedded markup is
            // escaped (C5D-001 — prior unsafe HTML injection allowed stored XSS).
            parsedGroups.push({
                type: 'text-only',
                id: i,
                textLength: current.trimEnd().length,
                content: <div key={i} className="whitespace-pre min-h-[1.5em]">{current || ' '}</div>
            })
        }
    }

    // Fit-mode auto-fit: measure the TRUE widest rendered line (chord-lyric
    // lines included — not a constant 40, the WS-03 clip bug) and size the
    // font with a legibility FLOOR (>=11px @ zoom 1.0). When the font bottoms
    // out at the floor and content still overflows, the `overflow-x-auto`
    // container below lets the player scroll to the right edge.
    const maxLineLength = maxRenderedLineLength(parsedGroups)
    const fontSizeStyle = wrapMode
        ? `${14 * zoomLevel}px`
        : fitFontSize({ maxLen: maxLineLength, zoom: zoomLevel, minPx: 11, maxPx: 15 })

    return (
        <div className="min-h-full bg-background text-foreground overflow-auto relative">
            {/* Control Bar */}
            <div className="fixed bottom-24 right-4 sm:right-8 z-20 flex gap-2 bg-card border border-border p-1.5 rounded-lg shadow-lg">
                <Button
                    variant={wrapMode ? "default" : "outline"}
                    size="sm"
                    className={`gap-2 h-11 px-4 ${wrapMode ? 'bg-brand text-white hover:bg-brand/90' : ''}`}
                    onClick={() => setWrapMode(!wrapMode)}
                >
                    {wrapMode ? <WrapText className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    {wrapMode ? "Wrap" : "Fit"}
                </Button>
                <div className="w-px bg-border my-1" />
                {/* WAVE1 Bug 4: these write the SAME store slot the toolbar
                    reads, so the two controls can no longer disagree. This bar
                    keeps its wider 0.5-3.0 range (the 11-15px font clamp means
                    text charts genuinely need more than the toolbar's 2.0 cap);
                    the toolbar clamps to 2.0 but is guarded against dragging a
                    higher value back down. */}
                <Button variant="outline" size="icon" aria-label="Zoom out" className="h-11 w-11" onClick={() => setZoom(Math.max(0.5, zoomLevel - 0.1))}>
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <div className="flex items-center justify-center w-12 text-xs font-medium tabular-nums">
                    {Math.round(zoomLevel * 100)}%
                </div>
                <Button variant="outline" size="icon" aria-label="Zoom in" className="h-11 w-11" onClick={() => setZoom(Math.min(3.0, zoomLevel + 0.1))}>
                    <ZoomIn className="h-4 w-4" />
                </Button>
            </div>

            {/* Chart Container */}
            <div className="max-w-4xl mx-auto bg-card sm:my-8 sm:rounded-xl shadow-sm sm:border border-border min-h-[850px] p-4 sm:p-12">
                <div className="@container w-full">
                    <div
                        className="font-mono leading-relaxed overflow-x-auto"
                        style={{ fontSize: fontSizeStyle }}
                    >
                        {parsedGroups.map((group) => {
                            if (group.type === 'text-only') {
                                return group.content;
                            }
                            
                            // Render Chord-Lyric chunks. One stacked column per
                            // chunk: chord row above, lyric row below.
                            //
                            // WS-04 (v11.6-02-02): in Fit mode the column width must
                            // be governed by the LYRIC slice. A transposed chord wider
                            // than its lyric (C→Db, G→F#m) used to stretch the flex
                            // column and shove every later column right → cumulative
                            // chord drift off the syllables. `widthNeutralChord` renders
                            // the chord row at zero layout width with visible overflow,
                            // so a wide chord crowds visually but never expands the
                            // column. Wrap mode passes false (unchanged — its
                            // word-atomic grouping relies on the chord contributing width).
                            const renderChunkCol = (chunk: Chunk, idx: number, widthNeutralChord = false) => (
                                <div key={idx} className="flex flex-col">
                                    <div className={`whitespace-pre h-[1.5em] ${widthNeutralChord ? 'w-0 overflow-visible' : ''} ${chunk.isChord ? 'text-brand font-bold' : ''}`}>
                                        {chunk.chord}
                                    </div>
                                    <div className="whitespace-pre min-h-[1.5em]">
                                        {chunk.lyric}
                                    </div>
                                </div>
                            )

                            // Fit mode: single non-wrapping row; lyric-governed columns
                            // keep alignment stable under transpose (WS-04).
                            if (!wrapMode) {
                                return (
                                    <div key={group.id} className="flex flex-nowrap w-max mb-1">
                                        {group.chunks.map((chunk, idx) => renderChunkCol(chunk, idx, true))}
                                    </div>
                                )
                            }

                            // Wrap mode: the row wraps BETWEEN word units, never
                            // inside one — each word group is a non-breaking inline-flex.
                            return (
                                <div key={group.id} className="flex flex-wrap mb-1">
                                    {groupChunksIntoWords(group.chunks).map((wordChunks, wi) => (
                                        <div key={wi} className="inline-flex flex-nowrap">
                                            {wordChunks.map((chunk, idx) => renderChunkCol(chunk, idx, false))}
                                        </div>
                                    ))}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
            {/* Bottom padding for toolbar */}
            <div className="h-24"></div>
        </div>
    )
}
