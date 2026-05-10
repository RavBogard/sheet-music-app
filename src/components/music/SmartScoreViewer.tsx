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

export function SmartScoreViewer({ url }: SmartScoreViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Offline / Source URL Logic
    const [sourceUrl, setSourceUrl] = useState<string>(url)

    useEffect(() => {
        let active = true
        const objectUrl: string | null = null

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
        return () => {
            active = false
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [url])

    const { transposition, zoom, aiXmlContent } = useMusicStore()

    // Initialize OSMD
    useEffect(() => {
        if (!containerRef.current) return

        // Wait to init?
        // OSMD needs container.
    }, [])

    // Logic to handle source vs content
    useEffect(() => {
        const loadScore = async () => {
            if (!osmdRef.current) {
                // Try init if not yet (sometimes ref logic is racing)
                if (containerRef.current) {
                    osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
                        autoResize: true,
                        backend: 'svg',
                        drawingParameters: 'compacttight',
                        drawTitle: true,
                    })
                    osmdRef.current.TransposeCalculator = new TransposeCalculator()
                } else {
                    return
                }
            }

            // PRIORITY: AI Content > Source URL
            const contentToLoad = aiXmlContent || sourceUrl
            if (!contentToLoad) return

            logger.info("OSMD Loading:", aiXmlContent ? "AI Content (xml string)" : "Source URL")

            try {
                setLoading(true)

                // Yield the main thread so React can paint the Loader2 spinner and empty Card.
                // OSMD does not support true background Web Workers because it requires synchronous 
                // SVGElement.getBBox() measurements on attached DOM nodes. 
                // Yielding is the only way to prevent application lockup during parsing.
                await new Promise(resolve => setTimeout(resolve, 50))

                let finalContent: string | Blob = contentToLoad;

                // If contentToLoad is a URL (not an AI XML string), we fetch it manually.
                // OSMD's internal fetcher relies on file extensions (e.g. .xml, .mxl) which
                // our API routes (/api/drive/file/[id]) and Blob URLs lack, leading to parse errors.
                if (typeof contentToLoad === 'string' && (contentToLoad.startsWith('http') || contentToLoad.startsWith('blob:') || contentToLoad.startsWith('/'))) {
                    const res = await fetch(contentToLoad)
                    if (!res.ok) throw new Error("Failed to fetch score file from URL")
                    
                    const buffer = await res.arrayBuffer()
                    const text = new TextDecoder('utf-8').decode(buffer)
                    
                    // Check if it's uncompressed MusicXML
                    if (text.trim().startsWith('<?xml') || text.trim().startsWith('<score-partwise') || text.trim().startsWith('<!DOCTYPE')) {
                        finalContent = text
                    } else {
                        // Compressed MXL file
                        finalContent = new Blob([buffer])
                    }
                }

                await osmdRef.current.load(finalContent)

                // Yield again before the heavy render loop
                await new Promise(resolve => setTimeout(resolve, 50))

                osmdRef.current.render()
                setLoading(false)
            } catch (err) {
                logger.error("OSMD Load Error", err)
                setError("Failed to load music XML.")
                setLoading(false)
            }
        }

        loadScore()
    }, [sourceUrl, aiXmlContent]) // Re-run if either changes

    // Handle Transposition & Zoom
    useEffect(() => {
        if (!osmdRef.current || !osmdRef.current.Sheet) return

        try {
            osmdRef.current.Sheet.Transpose = transposition

            // Basic zoom handling via container transform or OSMD scaling
            // OSMD zoom is set via Zoom property
            osmdRef.current.Zoom = zoom

            osmdRef.current.updateGraphic()
            osmdRef.current.render()
        } catch (err) {
            logger.error("OSMD Update Error", err)
        }
    }, [transposition, zoom])

    return (
        <div className="flex flex-col items-center w-full">
            {loading && (
                <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin mb-4" />
                    <p>Rendering Score...</p>
                </div>
            )}

            {error && (
                <div className="flex flex-col items-center justify-center p-12 text-destructive">
                    <Music2 className="h-10 w-10 mb-4" />
                    <p>{error}</p>
                </div>
            )}

            <Card className={`w-full bg-white dark:bg-zinc-100 p-4 transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}>
                {/* OSMD renders dark text by default, so we enforce a light background for now to ensure contrast */}
                <div ref={containerRef} className="w-full text-black min-h-[400px]" />
            </Card>
        </div>
    )
}
