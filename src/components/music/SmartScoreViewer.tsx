"use client"

import { useEffect, useRef, useState } from 'react'
import { OpenSheetMusicDisplay, TransposeCalculator } from 'opensheetmusicdisplay'
import { Loader2, Music2 } from 'lucide-react'
import { useMusicStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { logger } from "@/lib/logger"

interface SmartScoreViewerProps {
    url: string
}

// Fit-to-screen tuning. fitBase is an OSMD zoom multiplier (1 unit = 10px @ zoom 1).
const FIT_MARGIN = 0.98      // leave a sliver of horizontal breathing room
const FIT_MIN = 0.6          // never shrink a score into illegibility
const FIT_MAX = 3.5          // cap so a 1-2 measure chart doesn't become cartoonish
const FIT_NOOP_EPSILON = 0.04 // skip a re-render when the fit zoom is ~1 (long scores already fill width)
const TRANSPOSE_DEBOUNCE_MS = 140 // collapse rapid +/- taps into a single re-render
const RESIZE_DEBOUNCE_MS = 200

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function SmartScoreViewer({ url }: SmartScoreViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
    const [loading, setLoading] = useState(true)
    const [transposing, setTransposing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Offline / Source URL Logic
    const [sourceUrl, setSourceUrl] = useState<string>(url)

    const { transposition, zoom, aiXmlContent } = useMusicStore()

    // Fit-to-screen baseline: the OSMD zoom (at user zoom = 1) that makes the
    // rendered score fill the container width. The store `zoom` stays the user's
    // manual override and multiplies on top, so the persisted store is never
    // polluted with a computed value.
    const fitBaseRef = useRef<number>(1)
    // Latest store values, read from non-reactive callbacks (ResizeObserver).
    const zoomRef = useRef(zoom)
    const transpositionRef = useRef(transposition)
    useEffect(() => { zoomRef.current = zoom }, [zoom])
    useEffect(() => { transpositionRef.current = transposition }, [transposition])

    // Score is loaded and the initial fit has been applied.
    const readyRef = useRef(false)
    // Last (transposition, zoom) actually pushed to OSMD — lets the update effect
    // skip the redundant render that would otherwise fire on mount.
    const appliedRef = useRef<{ transposition: number; zoom: number } | null>(null)
    const transposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastWidthRef = useRef<number>(0)

    useEffect(() => {
        let active = true
        const loadOffline = async () => {
            if (active) {
                if (url.startsWith('blob:')) {
                    setSourceUrl(url)
                } else {
                    const bustUrl = url.includes('?') ? `${url}&_v=2` : `${url}?_v=2`
                    setSourceUrl(bustUrl)
                }
            }
        }
        loadOffline()
        return () => { active = false }
    }, [url])

    // Measure the rendered content width and compute the fit-to-width zoom
    // baseline (normalized to user zoom = 1). Returns null when measurement is
    // unavailable (jsdom / pre-render), so callers fall back to no scaling.
    const computeFitBase = (): number | null => {
        const container = containerRef.current
        const osmd = osmdRef.current
        if (!container || !osmd) return null
        const svg = container.querySelector('svg') as SVGGraphicsElement | null
        if (!svg || typeof svg.getBBox !== 'function') return null

        let contentWidth = 0
        try {
            contentWidth = svg.getBBox().width
        } catch {
            return null
        }
        const containerWidth = container.clientWidth
        const currentZoom = osmd.Zoom || 1
        if (contentWidth <= 0 || containerWidth <= 0) return null

        // Content width back-projected to zoom 1, then the zoom that fills width.
        const contentAtUnitZoom = contentWidth / currentZoom
        const fit = (containerWidth * FIT_MARGIN) / contentAtUnitZoom
        return clamp(fit, FIT_MIN, FIT_MAX)
    }

    // Load + initial render + fit. Re-runs only when the source changes.
    useEffect(() => {
        let cancelled = false

        const loadScore = async () => {
            if (!osmdRef.current) {
                if (!containerRef.current) return
                osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
                    autoResize: false, // we own resize via ResizeObserver so we can refit
                    backend: 'svg',
                    drawingParameters: 'compacttight',
                    drawTitle: true,
                })
                osmdRef.current.TransposeCalculator = new TransposeCalculator()
            }
            const osmd = osmdRef.current

            // PRIORITY: AI Content > Source URL
            const contentToLoad = aiXmlContent || sourceUrl
            if (!contentToLoad) return

            logger.info("OSMD Loading:", aiXmlContent ? "AI Content (xml string)" : "Source URL")

            try {
                readyRef.current = false
                setLoading(true)
                setError(null)

                // Yield so React can paint the "Rendering Score…" overlay before the
                // synchronous OSMD parse/render locks the main thread.
                await sleep(50)

                let finalContent: string | Blob = contentToLoad

                // If contentToLoad is a URL (not an AI XML string), fetch it manually.
                // OSMD's internal fetcher relies on file extensions (.xml/.mxl) which
                // our API routes and Blob URLs lack, leading to parse errors.
                if (typeof contentToLoad === 'string' && (contentToLoad.startsWith('http') || contentToLoad.startsWith('blob:') || contentToLoad.startsWith('/'))) {
                    const res = await fetch(contentToLoad)
                    if (!res.ok) throw new Error("Failed to fetch score file from URL")

                    const buffer = await res.arrayBuffer()
                    const text = new TextDecoder('utf-8').decode(buffer)

                    if (text.trim().startsWith('<?xml') || text.trim().startsWith('<score-partwise') || text.trim().startsWith('<!DOCTYPE')) {
                        finalContent = text
                    } else {
                        finalContent = new Blob([buffer])
                    }
                }

                if (cancelled) return
                await osmd.load(finalContent)
                if (cancelled) return

                // Yield again before the heavy render loop.
                await sleep(50)

                // First (measuring) render at zoom 1 with the current transposition.
                osmd.Zoom = 1
                if (osmd.Sheet) osmd.Sheet.Transpose = transposition
                osmd.render()

                // Compute the fit baseline and enlarge to fill width. Short scores
                // (small content, fast render) get a second render; long scores
                // (already fill width, slow render) compute ~1 and skip it.
                fitBaseRef.current = computeFitBase() ?? 1
                const finalZoom = clamp(fitBaseRef.current * zoom, FIT_MIN, FIT_MAX)
                if (Math.abs(finalZoom - 1) > FIT_NOOP_EPSILON) {
                    osmd.Zoom = finalZoom
                    osmd.updateGraphic()
                    osmd.render()
                }

                appliedRef.current = { transposition, zoom }
                lastWidthRef.current = containerRef.current?.clientWidth ?? 0
                readyRef.current = true
                if (!cancelled) setLoading(false)
            } catch (err) {
                logger.error("OSMD Load Error", err)
                if (!cancelled) {
                    setError("Failed to load music XML.")
                    setLoading(false)
                }
            }
        }

        loadScore()
        return () => { cancelled = true }
    }, [sourceUrl, aiXmlContent]) // Re-run if either changes

    // Transposition + manual-zoom updates — debounced, with a "working" overlay
    // so a live key change never shows a stale frame mid-render.
    useEffect(() => {
        if (!readyRef.current) return
        const osmd = osmdRef.current
        if (!osmd || !osmd.Sheet) return

        const applied = appliedRef.current
        if (applied && applied.transposition === transposition && applied.zoom === zoom) {
            return // nothing changed since load / last apply
        }

        // Overlay is set now (synchronously) and paints during the debounce window,
        // so it already covers the score before the blocking render starts.
        setTransposing(true)

        if (transposeTimerRef.current) clearTimeout(transposeTimerRef.current)
        transposeTimerRef.current = setTimeout(() => {
            try {
                osmd.Sheet.Transpose = transposition
                osmd.Zoom = clamp(fitBaseRef.current * zoom, FIT_MIN, FIT_MAX)
                osmd.updateGraphic()
                osmd.render()
                appliedRef.current = { transposition, zoom }
            } catch (err) {
                logger.error("OSMD Update Error", err)
            } finally {
                setTransposing(false)
            }
        }, TRANSPOSE_DEBOUNCE_MS)

        return () => {
            if (transposeTimerRef.current) clearTimeout(transposeTimerRef.current)
        }
    }, [transposition, zoom])

    // Re-fit on container resize (orientation change) since we disabled OSMD autoResize.
    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') return
        const el = containerRef.current
        if (!el) return

        const observer = new ResizeObserver(() => {
            if (!readyRef.current || !osmdRef.current) return
            const width = el.clientWidth
            if (!width || Math.abs(width - lastWidthRef.current) < 4) return

            if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
            resizeTimerRef.current = setTimeout(() => {
                const osmd = osmdRef.current
                if (!osmd || !osmd.Sheet) return
                try {
                    osmd.Zoom = 1
                    osmd.render()
                    fitBaseRef.current = computeFitBase() ?? fitBaseRef.current
                    osmd.Zoom = clamp(fitBaseRef.current * zoomRef.current, FIT_MIN, FIT_MAX)
                    osmd.Sheet.Transpose = transpositionRef.current
                    osmd.updateGraphic()
                    osmd.render()
                    lastWidthRef.current = el.clientWidth
                } catch (err) {
                    logger.error("OSMD Resize Error", err)
                }
            }, RESIZE_DEBOUNCE_MS)
        })

        observer.observe(el)
        return () => {
            observer.disconnect()
            if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
        }
    }, [])

    const showOverlay = loading || transposing

    return (
        <div className="relative flex flex-col items-center w-full" aria-label="Sheet music score">
            <Card className="w-full bg-white dark:bg-zinc-100 p-4">
                {/* OSMD renders dark text by default, so we enforce a light background to ensure contrast */}
                <div ref={containerRef} className="w-full text-black min-h-[400px]" />
            </Card>

            {showOverlay && !error && (
                <div
                    className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-white/70 dark:bg-zinc-100/70 backdrop-blur-[1px]"
                    role="status"
                    aria-live="polite"
                >
                    <div className="flex flex-col items-center text-zinc-600">
                        <Loader2 className="h-10 w-10 animate-spin motion-reduce:animate-none mb-3" aria-hidden="true" />
                        <p className="text-sm font-medium">Rendering Score…</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="flex flex-col items-center justify-center p-12 text-destructive">
                    <Music2 className="h-10 w-10 mb-4" aria-hidden="true" />
                    <p>{error}</p>
                </div>
            )}
        </div>
    )
}
