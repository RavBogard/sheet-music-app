"use client"

import { useParams, useRouter } from "next/navigation"
import { PDFOverlay } from "@/components/performance/PDFOverlay"
import { SetlistTrack } from "@/types/models"
import { useEffect, useMemo, useState } from "react"
import { useLibraryStore } from "@/lib/library-store"
import { AlertTriangle, ArrowLeft, Library, Loader2, RotateCw } from "lucide-react"
import { useLibrary } from "@/hooks/use-library"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { captureMessage } from "@/lib/error-reporting"
import { KeepAwakeAutoArm, useKeepAwake } from "@/components/performance/keep-awake-context"
import Link from "next/link"

const LOAD_TIMEOUT_MS = 15_000

export default function StandalonePerformPage() {
    const params = useParams()
    const router = useRouter()
    const fileId = params?.fileId as string

    const { allFiles, initialized } = useLibraryStore()
    const { user, loading: authLoading } = useAuth()
    const { isError, error: queryError, refetch, isFetching } = useLibrary()

    // Keep-alive for the SINGLE-CHART perform route (2026-08-31).
    //
    // This route rendered <PDFOverlay> with no `wakeLock` prop at all, so the
    // toolbar's "Keep screen on" control never mounted here and nothing held a
    // sentinel: open one chart straight from the library on the bimah iPad and
    // the screen slept on the device idle timer, with no affordance anywhere
    // on screen to stop it. It now shares the /perform layout's single lock,
    // identical to the setlist surface.
    const {
        isSupported: isWakeLockSupported,
        isLocked: isWakeLockActive,
        lastError: wakeLockError,
        requestWakeLock,
        releaseWakeLock,
    } = useKeepAwake()

    const file = useMemo(() => allFiles.find(f => f.id === fileId), [allFiles, fileId])

    // C7I2-002: bound the loading wait. Before this fix, /perform/[fileId]
    // would render the spinner indefinitely when the library never hydrated
    // (auth lapse, query error, network failure). After LOAD_TIMEOUT_MS we
    // surface an actionable error state with retry + back affordances.
    const [timedOut, setTimedOut] = useState(false)
    useEffect(() => {
        if (initialized) return
        const t = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS)
        return () => clearTimeout(t)
    }, [initialized])

    // Once we know it's a failed/empty load, report it once for telemetry.
    const errorReason = useMemo(() => {
        if (isError) {
            return queryError instanceof Error ? queryError.message : "Failed to load library"
        }
        if (!authLoading && !user) return "Sign in required to view this chart"
        if (timedOut && !initialized) return "Chart load timed out"
        if (initialized && !file) return "Chart not found"
        return null
    }, [isError, queryError, authLoading, user, timedOut, initialized, file])

    useEffect(() => {
        if (!errorReason) return
        captureMessage(`/perform/[fileId] error: ${errorReason}`, {
            source: "client",
            location: "/perform/[fileId]",
            extra: { fileId, reason: errorReason },
        })
    }, [errorReason, fileId])

    if (errorReason) {
        const isAuthError = errorReason.startsWith("Sign in")
        return (
            <div className="flex flex-col h-[100dvh] items-center justify-center gap-4 bg-background p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-400" aria-hidden="true" />
                <div>
                    <p className="text-foreground font-semibold text-lg">Couldn&apos;t load chart</p>
                    <p className="mt-1 text-sm text-muted-foreground max-w-md">{errorReason}</p>
                    <p className="mt-1 text-xs text-muted-foreground/70 break-all">File ID: {fileId}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                    {isAuthError ? (
                        <Button asChild variant="default">
                            <Link href={`/login?next=${encodeURIComponent(`/perform/${fileId}`)}`}>
                                Sign in
                            </Link>
                        </Button>
                    ) : (
                        <Button
                            variant="default"
                            onClick={() => {
                                setTimedOut(false)
                                void refetch()
                            }}
                            disabled={isFetching}
                        >
                            <RotateCw className="h-4 w-4 mr-2" />
                            {isFetching ? "Retrying…" : "Retry"}
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                    <Button asChild variant="ghost">
                        <Link href="/library">
                            <Library className="h-4 w-4 mr-2" />
                            Library
                        </Link>
                    </Button>
                </div>
            </div>
        )
    }

    if (!initialized) {
        return (
            <div className="flex flex-col h-[100dvh] items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="mt-4 text-muted-foreground text-sm">Loading chart...</p>
            </div>
        )
    }

    if (!file) return null

    const getFileNameWithExtension = (f: typeof file) => {
        if (!f) return "";
        const name = (f as any).originalName || f.name;
        if (f.mimeType === 'text/plain' && !name.endsWith('.txt')) return `${name}.txt`;
        if (f.mimeType === 'application/xml' && !name.match(/\.(xml|mxl|musicxml)$/i)) return `${name}.musicxml`;
        if (f.mimeType === 'application/pdf' && !name.endsWith('.pdf')) return `${name}.pdf`;
        return name;
    }

    const track: SetlistTrack = {
        id: file.id,
        title: file.name.replace(/\.[^/.]+$/, ""), // remove extension for display
        fileId: file.id,
        fileName: getFileNameWithExtension(file),
        key: file.metadata?.key
    }

    return (
        <>
            {/* Opening a chart to perform is the intent to keep the screen on. */}
            <KeepAwakeAutoArm />
            <PDFOverlay
                track={track}
                tracks={[track]}
                currentIndex={0}
                onClose={() => router.back()}
                onNavigate={() => {}}
                isPublicView={false}
                wakeLock={{
                    isActive: isWakeLockActive,
                    isSupported: isWakeLockSupported,
                    onRequest: requestWakeLock,
                    onRelease: releaseWakeLock,
                    lastError: wakeLockError,
                }}
            />
        </>
    )
}
