"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { useMusicianTransposition } from "@/hooks/use-musician-transposition"
import { useMusicStore, QueueItem } from "@/lib/store"
import { PerformerView } from "@/components/views/PerformerView"
import { ServiceFlowCard } from "@/components/performance/ServiceFlowCard"
import { Button } from "@/components/ui/button"
import { Home, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { SetlistTrack } from "@/types/models"
import { logger } from "@/lib/logger"

export default function SetlistPerformPage() {
    const router = useRouter()
    const params = useParams()
    const setlistId = params?.id as string
    const { user } = useAuth()
    const { requestWakeLock, releaseWakeLock } = useWakeLock()
    const { setFile, setTransposition, fileUrl, fileType } = useMusicStore()

    const [tracks, setTracks] = useState<SetlistTrack[]>([])
    const [_setlistName, setSetlistName] = useState("")
    const [currentIndex, setCurrentIndex] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Apply musician profile transposition
    useMusicianTransposition()

    // Wake lock for tablet use
    useEffect(() => {
        requestWakeLock()
        return () => { releaseWakeLock() }
    }, [requestWakeLock, releaseWakeLock])

    // Load setlist
    useEffect(() => {
        if (!setlistId || !user) return
        const loadSetlist = async () => {
            try {
                const docRef = doc(db, 'setlists', setlistId)
                const snap = await getDoc(docRef)
                if (!snap.exists()) {
                    setError("Setlist not found")
                    return
                }
                const data = snap.data()
                setTracks(data.tracks || [])
                setSetlistName(data.name || "Setlist")
            } catch (err) {
                logger.error("[SetlistPerform] Load error:", err)
                setError("Failed to load setlist")
            } finally {
                setLoading(false)
            }
        }
        loadSetlist()
    }, [setlistId, user])

    // Navigate to a track
    const goTo = useCallback((index: number) => {
        if (index < 0 || index >= tracks.length) return
        setCurrentIndex(index)

        const track = tracks[index]
        const isSongTrack = !track.type || track.type === 'song'

        if (isSongTrack && track.fileId) {
            const url = `/api/drive/file/${track.fileId}`
            setFile(url, track.fileId.endsWith('.xml') || track.fileId.endsWith('.musicxml') ? 'musicxml' : 'pdf')
            setTransposition(track.transposition || 0)
        }
    }, [tracks, setFile, setTransposition])

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault()
                goTo(currentIndex + 1)
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                goTo(currentIndex - 1)
            } else if (e.key === 'Escape') {
                router.push(`/setlists/${setlistId}`)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [currentIndex, goTo, router, setlistId])

    // Touch swipe navigation
    const [touchStart, setTouchStart] = useState<number | null>(null)
    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStart(e.touches[0].clientX)
    }
    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStart === null) return
        const diff = touchStart - e.changedTouches[0].clientX
        if (Math.abs(diff) > 50) {
            if (diff > 0) goTo(currentIndex + 1)
            else goTo(currentIndex - 1)
        }
        setTouchStart(null)
    }

    // Load initial file when tracks first arrive
    useEffect(() => {
        if (tracks.length > 0 && currentIndex === 0) {
            const first = tracks[0]
            const isSongType = !first.type || first.type === 'song'
            if (isSongType && first.fileId) {
                const url = `/api/drive/file/${first.fileId}`
                setFile(url, 'pdf')
                setTransposition(first.transposition || 0)
            }
        }
    }, [tracks, currentIndex, setFile, setTransposition])

    // Build queue items for ServiceFlowCard
    const queue: QueueItem[] = tracks.map(t => ({
        name: t.title,
        fileId: t.fileId || '',
        type: 'pdf',
        audioFileId: t.audioFileId,
        transposition: t.transposition,
        key: t.key,
        bpm: t.bpm,
        trackType: t.type || 'song',
        performer: t.performer,
        description: t.description,
        estimatedMinutes: t.estimatedMinutes,
    }))

    // Loading / Error states
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-zinc-400">{error}</p>
                <Button variant="outline" onClick={() => router.push('/setlists')}>
                    Back to Setlists
                </Button>
            </div>
        )
    }

    const current = tracks[currentIndex]
    const isSong = !current?.type || current?.type === 'song'
    const currentQueueItem = queue[currentIndex]
    const nextTrack = currentIndex < tracks.length - 1 ? tracks[currentIndex + 1] : null

    return (
        <div
            className="flex flex-col min-h-screen"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Navigation Bar */}
            <div className="flex items-center gap-2 p-2 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800 z-20 shrink-0">
                <Button
                    size="icon"
                    variant="ghost"
                    className="text-zinc-400 hover:text-white"
                    onClick={() => router.push(`/setlists/${setlistId}`)}
                >
                    <Home className="h-4 w-4" />
                </Button>

                <Button
                    size="icon"
                    variant="ghost"
                    className="text-zinc-400 hover:text-white"
                    onClick={() => goTo(currentIndex - 1)}
                    disabled={currentIndex === 0}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex-1 text-center min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                        {current?.title}
                        {isSong && current?.key && (
                            <span className="text-zinc-400 ml-2">— {current.key}</span>
                        )}
                    </p>
                    <p className="text-xs text-zinc-500">
                        {currentIndex + 1} / {tracks.length}
                        {nextTrack && (
                            <span className="ml-2 text-zinc-600">
                                Next: {nextTrack.title}
                            </span>
                        )}
                    </p>
                </div>

                <Button
                    size="icon"
                    variant="ghost"
                    className="text-zinc-400 hover:text-white"
                    onClick={() => goTo(currentIndex + 1)}
                    disabled={currentIndex >= tracks.length - 1}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 relative">
                {isSong && current?.fileId ? (
                    <PerformerView
                        fileType={fileType}
                        fileUrl={fileUrl}
                        onHome={() => router.push(`/setlists/${setlistId}`)}
                        onSetlist={() => router.push(`/setlists/${setlistId}`)}
                    />
                ) : (
                    <ServiceFlowCard
                        item={currentQueueItem}
                        index={currentIndex}
                        total={tracks.length}
                    />
                )}
            </div>
        </div>
    )
}
