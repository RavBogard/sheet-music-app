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
import { LiveNotification } from "@/components/performance/LiveNotification"
import { RehearsalToolbar } from "@/components/performance/RehearsalToolbar"
import { FlowItemView } from "@/components/performance/FlowItemView"

import { parseFileId } from "@/lib/utils"

export default function PerformPage() {
    const router = useRouter()
    const params = useParams()
    const { requestWakeLock, releaseWakeLock } = useWakeLock()
    const { fileUrl, fileType, setFile, playbackQueue, queueIndex, returnPath, currentSetlistId } = useMusicStore()
    const [showIntro, dismissIntro] = usePerformanceIntro()

    // Current track from queue (for audio/rehearsal)
    const currentTrack = queueIndex >= 0 && queueIndex < playbackQueue.length
        ? playbackQueue[queueIndex]
        : null
    const audioUrl = currentTrack?.audioFileId
        ? `/api/drive/file/${currentTrack.audioFileId}`
        : null

    // Auto-apply musician profile transposition
    useMusicianTransposition()

    const { user: authUser } = useAuth()
    const { loadAnnotations } = useAnnotationStore()

    const fileId = params?.id as string

    // Load annotations for current file
    useEffect(() => {
        if (authUser?.uid && fileId) {
            loadAnnotations(authUser.uid, fileId)
        }
    }, [authUser?.uid, fileId, loadAnnotations])

    // Track chart view for preparation progress
    useEffect(() => {
        if (authUser?.uid && fileId) {
            import("firebase/firestore").then(({ doc, setDoc, serverTimestamp }) => {
                import("@/lib/firebase").then(({ db: clientDb }) => {
                    const ref = doc(clientDb, 'users', authUser.uid, 'songPreferences', fileId)
                    setDoc(ref, { lastViewedAt: serverTimestamp() }, { merge: true })
                        .catch(() => {/* silent */})
                })
            })
        }
    }, [authUser?.uid, fileId])

    // Home navigates back to origin (setlist editor, library, or home)
    const handleHome = () => router.push(returnPath || '/')

    // Sync URL with Store
    useEffect(() => {
        if (fileId) {
            const { apiUrl, defaultType } = parseFileId(fileId)

            // CRITICAL: Only update the store if the URL actually represents a different file
            // than what is currently loaded.
            if (!fileUrl?.includes(fileId)) {
                setFile(apiUrl, defaultType as FileType)
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

    // Detect if current queue item is a non-song flow item (reading, prayer, header, etc.)
    const isFlowItem = currentTrack?.trackType && currentTrack.trackType !== 'song'

    return (
        <>
            {showIntro && <PerformanceIntro onDismiss={dismissIntro} />}
            <LiveNotification setlistId={currentSetlistId} />
            {isFlowItem && currentTrack ? (
                <FlowItemView
                    onHome={handleHome}
                />
            ) : (
                <PerformerView
                    fileUrl={fileUrl}
                    fileType={fileType}
                    onHome={handleHome}
                />
            )}
            {audioUrl && (
                <RehearsalToolbar
                    audioUrl={audioUrl}
                    title={currentTrack?.name || 'Audio'}
                    fileId={fileId}
                    onPracticeTime={(seconds) => {
                        // Track practice time in Firestore
                        if (authUser?.uid && fileId && seconds > 5) {
                            import("firebase/firestore").then(({ doc, setDoc, increment }) => {
                                import("@/lib/firebase").then(({ db: clientDb }) => {
                                    const ref = doc(clientDb, 'users', authUser.uid, 'songPreferences', fileId)
                                    setDoc(ref, {
                                        practiceSeconds: increment(seconds),
                                        practiceSessionCount: increment(1),
                                        lastPracticedAt: new Date().toISOString(),
                                    }, { merge: true }).catch(() => {})
                                })
                            })
                        }
                    }}
                />
            )}
        </>
    )
}
