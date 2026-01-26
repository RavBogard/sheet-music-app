"use client"

import { useEffect, useRef, useState } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { Loader2, Music2 } from 'lucide-react'
import { useMusicStore } from '@/lib/store'
import { Card } from '@/components/ui/card'

// ... imports
import { getOfflineFile } from '@/lib/offline-store'

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
        let objectUrl: string | null = null

        const loadOffline = async () => {
            // Extract File ID from URL: /api/drive/file/[FILE_ID]
            const fileIdMatch = url.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            const fileId = fileIdMatch ? fileIdMatch[1] : null

            if (fileId) {
                const offlineFile = await getOfflineFile(fileId)
                if (active && offlineFile) {
                    console.log("Serving offline file for:", fileId)
                    objectUrl = URL.createObjectURL(offlineFile.blob)
                    setSourceUrl(objectUrl)
                } else if (active) {
                    setSourceUrl(url)
                }
            } else {
                if (active) setSourceUrl(url)
            }
        }
        loadOffline()
        return () => {
            active = false
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [url])

    const { transposition, zoom } = useMusicStore()

    // Initialize OSMD
    useEffect(() => {
        if (!containerRef.current) return

        const osmd = new OpenSheetMusicDisplay(containerRef.current, {
            autoResize: true,
            backend: 'svg',
            drawingParameters: 'compacttight', // optimizes for screen
            drawTitle: true,
        })
        osmdRef.current = osmd

        // Cleanup
        return () => {
            osmdRef.current = null
            if (containerRef.current) containerRef.current.innerHTML = ''
        }
    }, [])

    // Load File
    useEffect(() => {
        const loadScore = async () => {
            if (!osmdRef.current || !sourceUrl) return

            try {
                setLoading(true)
                await osmdRef.current.load(sourceUrl)
                osmdRef.current.render()

                osmdRef.current.render()
                setLoading(false)
            } catch (err) {
                console.error("OSMD Load Error", err)
                setError("Failed to load music XML.")
                setLoading(false)
            }
        }

        loadScore()
    }, [sourceUrl])

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
            console.error("OSMD Update Error", err)
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
