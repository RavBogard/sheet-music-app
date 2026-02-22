"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useMusicStore, FileType } from "@/lib/store"
import { PerformerView } from "@/components/views/PerformerView"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { useMusicianTransposition } from "@/hooks/use-musician-transposition"
import { prefetchUpcoming } from "@/lib/prefetch"
import { useAnnotationStore } from "@/lib/annotation-store"
import { useAuth } from "@/lib/auth-context"

import { PerformanceIntro, usePerformanceIntro } from "@/components/performance/PerformanceIntro"
import { RehearsalToolbar } from "@/components/performance/RehearsalToolbar"
import { FlowItemView } from "@/components/performance/FlowItemView"
import { SwipeOverlay } from "@/components/performance/SwipeOverlay"

import { parseFileId } from "@/lib/utils"

export default function PerformPage() {
    const router = useRouter()
    const params = useParams()
    const { requestWakeLock, releaseWakeLock } = useWakeLock()
    const { fileUrl, fileType, setFile, playbackQueue, queueIndex, returnPath, currentSetlistId } = useMusicStore()
    const [showIntro, dismissIntro] = usePerformanceIntro()

    // Auto-apply musician profile transposition
    useMusicianTransposition()

    const { user: authUser } = useAuth()
    const { loadAnnotations } = useAnnotationStore()

    const fileId = params?.id as string

    // Pre-mount array
    const indicesToRender = []
    if (queueIndex >= 0 && playbackQueue.length > 0) {
        if (queueIndex > 0) indicesToRender.push(queueIndex - 1)
        indicesToRender.push(queueIndex)
        if (queueIndex < playbackQueue.length - 1) indicesToRender.push(queueIndex + 1)
    } else {
        // Fallback if not playing from queue just render a dummy index for current file
        indicesToRender.push(-1)
    }

    // Helper to get track data for an index
    const getTrackData = (idx: number) => {
        if (idx === -1) {
            return {
                id: fileId,
                url: fileUrl,
                type: fileType,
                isFlowItem: false,
                audioUrl: null,
                track: null
            }
        }
        const track = playbackQueue[idx]
        if (!track) return null

        let url = null
        let isFlowItem = false

        if (track.fileId?.startsWith('flow-') || (track.trackType && track.trackType !== 'song')) {
            isFlowItem = true
        } else {
            url = `/api/drive/file/${track.fileId}`
            // Special handling for musicxml, chordpro types
            if (track.type !== 'pdf') {
                // The viewer component handles fetching the text payload if needed, 
                // or we just pass the ID depending on how viewer is set up.
                // Currently PerformerView accepts `fileUrl` which is typically the drive API endpoint.
            }
        }

        return {
            id: track.fileId,
            url,
            type: track.type,
            isFlowItem,
            audioUrl: track.audioFileId ? `/api/drive/file/${track.audioFileId}` : null,
            track
        }
    }


    // Load annotations for current file
    useEffect(() => {
        if (authUser?.uid && fileId) {
            loadAnnotations(authUser.uid, fileId)
        }
    }, [authUser?.uid, fileId, loadAnnotations])



    // Home navigates back to origin (setlist editor, library, or home)
    const handleHome = () => router.push(returnPath || '/')

    // Sync URL with Store
    useEffect(() => {
        if (fileId && !fileId.startsWith('flow-')) {
            if (fileId === 'undefined' || fileId === 'null') {
                if (fileUrl !== null) {
                    setFile(null, null)
                }
            } else {
                const { apiUrl, defaultType } = parseFileId(fileId)
                // CRITICAL: Only update the store if the URL actually represents a different file
                if (!fileUrl?.includes(fileId)) {
                    setFile(apiUrl, defaultType as FileType)
                }
            }
        }
    }, [fileId, fileUrl, setFile])

    useEffect(() => {
        requestWakeLock()
        return () => {
            releaseWakeLock()
        }
    }, [requestWakeLock, releaseWakeLock])

    // Prefetch next few songs in queue for instant page turns
    useEffect(() => {
        if (playbackQueue.length > 1) {
            prefetchUpcoming(playbackQueue, queueIndex, 3)
        }
    }, [playbackQueue, queueIndex])

    return (
        <div className="relative w-full h-[100dvh] overflow-hidden bg-black text-white">
            {showIntro && <PerformanceIntro onDismiss={dismissIntro} />}

            {indicesToRender.map(idx => {
                const data = getTrackData(idx)
                if (!data) return null

                const isCurrent = idx === queueIndex || (idx === -1 && fileId)
                const isPrev = idx === queueIndex - 1
                const isNext = idx === queueIndex + 1

                // Position logic: hide non-current elements but keep them in DOM
                const posClass = isCurrent
                    ? "opacity-100 z-10 translate-x-0"
                    : isPrev
                        ? "opacity-0 -z-10 -translate-x-full pointer-events-none"
                        : "opacity-0 -z-10 translate-x-full pointer-events-none"

                if (data.isFlowItem && data.track) {
                    return (
                        <div
                            key={`flow-${idx}-${data.id}`}
                            className={`absolute inset-0 transition-opacity duration-0 ${posClass}`}
                            style={{ display: isCurrent ? 'block' : 'none' }}
                        >
                            <FlowItemView onHome={handleHome} />
                        </div>
                    )
                }

                return (
                    <div
                        key={`perf-${idx}-${data.id}`}
                        className={`absolute inset-0 transition-opacity duration-0 ${posClass}`}
                        style={{ display: isCurrent ? 'block' : 'none' }}
                    >
                        <PerformerView
                            fileUrl={data.url}
                            fileType={data.type as FileType}
                            onHome={handleHome}
                        />
                        {isCurrent && data.audioUrl && (
                            <RehearsalToolbar
                                audioUrl={data.audioUrl}
                                title={data.track?.name || 'Audio'}
                                fileId={data.id}
                                onPracticeTime={() => { }}
                            />
                        )}
                    </div>
                )
            })}

            <SwipeOverlay />
        </div>
    )
}
