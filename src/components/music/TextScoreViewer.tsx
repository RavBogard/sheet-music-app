"use client"

import { useState, useEffect } from "react"
import { useMusicStore } from "@/lib/store"
import { transposeChord, keyUsesFlats } from "@/lib/music-math"
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
    const { transposition } = useMusicStore()
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [wrapMode, setWrapMode] = useState(false)
    const [zoomLevel, setZoomLevel] = useState(1.0)

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

    // Calculate max length to scale font-size so it fits in the container without scrolling
    const maxLineLength = Math.max(...parsedGroups.map(g => g.type === 'text-only' ? g.textLength : 40), 40)
    // 0.605 is roughly the aspect ratio (width/height) of a typical monospace character
    const baseFontSizeCalc = `min(15px, calc(100cqi / ${(maxLineLength + 2) * 0.605}))`
    const fontSizeStyle = wrapMode ? `${14 * zoomLevel}px` : `calc(${baseFontSizeCalc} * ${zoomLevel})`

    return (
        <div className="min-h-full bg-background text-foreground overflow-auto relative">
            {/* Control Bar */}
            <div className="fixed bottom-24 right-4 sm:right-8 z-20 flex gap-2 bg-card border border-border p-1.5 rounded-lg shadow-lg">
                <Button 
                    variant={wrapMode ? "default" : "outline"} 
                    size="sm" 
                    className={`gap-2 h-8 ${wrapMode ? 'bg-brand text-white hover:bg-brand/90' : ''}`}
                    onClick={() => setWrapMode(!wrapMode)}
                >
                    {wrapMode ? <WrapText className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    {wrapMode ? "Wrap" : "Fit"}
                </Button>
                <div className="w-px bg-border my-1" />
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))}>
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <div className="flex items-center justify-center w-12 text-xs font-medium">
                    {Math.round(zoomLevel * 100)}%
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoomLevel(z => Math.min(3.0, z + 0.1))}>
                    <ZoomIn className="h-4 w-4" />
                </Button>
            </div>

            {/* Chart Container */}
            <div className="max-w-4xl mx-auto bg-card sm:my-8 sm:rounded-xl shadow-sm sm:border border-border min-h-[850px] p-4 sm:p-12">
                <div className="@container w-full">
                    <div 
                        className="font-mono leading-relaxed overflow-x-hidden"
                        style={{ fontSize: fontSizeStyle }}
                    >
                        {parsedGroups.map((group) => {
                            if (group.type === 'text-only') {
                                return group.content;
                            }
                            
                            // Render Chord-Lyric chunks
                            return (
                                <div key={group.id} className={`flex ${wrapMode ? 'flex-wrap' : 'flex-nowrap w-max'} mb-1`}>
                                    {group.chunks.map((chunk, idx) => (
                                        <div key={idx} className="flex flex-col">
                                            <div className={`whitespace-pre h-[1.5em] ${chunk.isChord ? 'text-brand font-bold' : ''}`}>
                                                {chunk.chord}
                                            </div>
                                            <div className="whitespace-pre min-h-[1.5em]">
                                                {chunk.lyric}
                                            </div>
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
