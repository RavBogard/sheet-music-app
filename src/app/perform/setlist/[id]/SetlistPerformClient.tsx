"use client"

/**
 * Setlist Performance — Client Surface
 *
 * Extracted from page.tsx as part of UNAUTH-009 (cycle-4 supplement, slow-3G
 * TTFC fix). The parent server component fetches setlist + tracks via Admin
 * SDK and passes them in as `initialSetlist` + `initialTracks`. We seed the
 * `useSetlistPerformance` hook with that frame so the SSR markup contains
 * the full track list — the band member sees songs on FCP without waiting
 * for hydration + Firestore + Dexie to settle.
 *
 * Once mounted, the realtime subscription drives updates as before
 * (snapshot listener writes Firestore deliveries into Dexie via the
 * sync-engine; useLiveQuery picks up the change and replaces `initialTracks`
 * with the live frame transparently).
 *
 * PDFOverlay stays dynamic-imported with `ssr: false` so the react-pdf
 * + worker chunk (1.05MB on cycle-4 supplement's bundle audit) does NOT
 * ship in the initial setlist-page bundle. It lazy-loads on first song tap.
 */

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Loader2, ArrowLeft, Music, Users, Pencil, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSetlistPerformance } from "@/hooks/use-setlist-performance"
import { usePerformEntryPrecache } from "@/hooks/use-perform-entry-precache"
import { useAuth } from "@/lib/auth-context"
import { useLibrary } from "@/hooks/use-library"
import { SetlistView } from "@/components/performance/SetlistView"
import { PerformanceOfflineIndicator } from "@/components/performance/PerformanceOfflineIndicator"
import { SaveOfflineButton } from "@/components/performance/SaveOfflineButton"
import { KeepAwakeToggle } from "@/components/performance/KeepAwakeToggle"
import { shouldShowFatalSetlistError } from "./perform-error-gate"
import type { Setlist, SetlistTrack } from "@/types/models"

const PrintModal = dynamic(
    () => import("@/components/setlist/PrintModal").then(m => m.PrintModal),
    { ssr: false },
)

// UNAUTH-009: PDFOverlay was previously a static import on the page, which
// pulled react-pdf + the 1.05MB PDF worker chunk into the initial bundle
// before any chart was tapped. PDFOverlay itself already lazy-loads its
// viewer modules (PDFViewer/SmartScoreViewer/TextScoreViewer/ImageScoreViewer)
// via dynamic(), but the overlay module's react-pdf import path needs the
// page-level import to be dynamic too to keep the chunk out of the initial
// graph. `ssr: false` matches the other dynamic viewer imports — PDFOverlay
// reads `window.location` and Dexie at mount; no SSR value to gain.
const PDFOverlay = dynamic(
    () => import("@/components/performance/PDFOverlay").then(m => m.PDFOverlay),
    { ssr: false },
)

export interface SetlistPerformClientProps {
    setlistId: string
    initialSetlist: Setlist | null
    initialTracks: SetlistTrack[]
    /**
     * c11-fix-perform-track-position-in-url (M3-009): when the page is
     * entered via `/perform/setlist/<id>/track/<trackId>`, seed
     * `activeSongIndex` to that track on first render so reload /
     * bookmark / PWA app-resume lands on the right song instead of the
     * list. Unknown trackId → falls back to bare-path behavior (no
     * overlay).
     */
    initialTrackId?: string | null
}

export function SetlistPerformClient({
    setlistId,
    initialSetlist,
    initialTracks,
    initialTrackId,
}: SetlistPerformClientProps) {
    const {
        tracks,
        name,
        serviceNotes,
        loading,
        error,
        currentTrackIndex,
        defaultTransposition,
        isLeader,
        isPublicView,
        setCurrentPosition,
        musicians,
        rabbi,
        isWakeLockActive,
        isWakeLockSupported,
        wakeLockError,
        requestWakeLock,
        releaseWakeLock,
    } = useSetlistPerformance(setlistId, {
        initial: initialSetlist ? { setlist: initialSetlist, tracks: initialTracks } : null,
    })

    const [activeSongIndex, setActiveSongIndex] = useState<number | null>(() => {
        if (!initialTrackId) return null
        const idx = initialTracks.findIndex((t) => t.id === initialTrackId)
        if (idx < 0) return null
        // c12-fix-section-divider-url-behavior (F-C12-R2-010, decision (b)):
        // section-divider rows (`type === 'header' | 'section'`) are labels,
        // not chart destinations. Bookmarking `/track/<sectionId>` falls back
        // to the bare path `/perform/setlist/<id>` — the URL-sync effect below
        // sees `activeSongIndex === null` and `replaceState`s to the bare path.
        // Without this gate the seed would be a section index, PDFOverlay would
        // mount, its queue would filter to `type === 'song'`, queueStart would
        // resolve to -1 → Math.max(0,-1) = 0, then the queue→setlist sync
        // effect at PDFOverlay.tsx:148-162 would fire `onNavigate(0)` and the
        // URL would silently rewrite to track-0 (deterministic; cycle-12
        // run-2 F-C12-R2-010 saw all 4 section bookmarks rewrite to "Fiddley
        // Tune"). Treating `'header' | 'section'` matches the canonical
        // `isSectionRow` check in `SetlistGrid.tsx:168` (both values appear in
        // the wild — TrackType union uses 'header'; TypeCell picker writes
        // 'section').
        const t = initialTracks[idx]
        // Cast through `string` because the SetlistGrid editor's TypeCell
        // picker writes `'section'` for the "Section header" option (see
        // `TypeCell.tsx:42` + `SetlistGrid.tsx:168`'s `isSectionRow`), while
        // the canonical `TrackType` union in `types/models.ts:34` only lists
        // `'header'`. Both literals appear in real setlist data.
        const tt = t.type as string | undefined
        if (tt === "header" || tt === "section") return null
        return idx
    })
    const [showPrintModal, setShowPrintModal] = useState(false)

    // c11-fix-perform-track-position-in-url (M3-009): mirror `activeSongIndex`
    // into the URL via `window.history.replaceState` so an iPad refresh /
    // wifi-blip / PWA background-resume lands on the same song. We use
    // `replaceState` (not `pushState` and not `router.replace`) deliberately:
    // (1) Next.js App Router would re-run the server component on
    // `router.replace`, throwing away client state we want to preserve;
    // (2) every track tap shouldn't add a back-button entry — back should
    // exit the setlist, not walk through every song. Reload via the browser
    // re-enters either `/track/[trackId]/page.tsx` (URL has the track) or
    // the bare `[id]/page.tsx` (no track) — both go through the same SSR
    // fetch and seed `activeSongIndex` accordingly.
    useEffect(() => {
        if (typeof window === "undefined") return
        const basePath = `/perform/setlist/${setlistId}`
        let desiredPath = basePath
        if (activeSongIndex !== null) {
            const track = tracks[activeSongIndex]
            if (track?.id) {
                desiredPath = `${basePath}/track/${encodeURIComponent(track.id)}`
            }
        }
        const currentPath = window.location.pathname
        if (currentPath !== desiredPath) {
            window.history.replaceState(null, "", desiredPath + window.location.search + window.location.hash)
        }
    }, [activeSongIndex, setlistId, tracks])

    const { isMusician, isBandLeader, isAdmin } = useAuth()
    const canPrint = isMusician || isBandLeader || isAdmin

    // live-director-gesture: the swap-chart / insert-song modals consume
    // `useLibraryStore.allFiles`. Perform routes don't otherwise hydrate
    // the library, so we drive `useLibrary` ONLY for the leader role
    // (`band_leader || admin`) via a child component — musician + public
    // iPads stay on the lean Perform payload.
    const isLeaderRole = isBandLeader || isAdmin

    // Song fileIds for the offline indicator's IDB ground-truth count.
    const songFileIds = tracks
        .filter(t => (!t.type || t.type === "song") && t.fileId)
        .map(t => t.fileId as string)

    // F1 (perform-entry-precache): warm Dexie with every bonded chart the
    // moment the overlay mounts — `requestIdleCallback` (the SaveOfflineButton
    // path) only fires on browser idle, which leaves a window where a band
    // member on weak shul WiFi can lose connectivity before the rIC pass
    // ever runs. This hook fires via `queueMicrotask`, deferred only past
    // the current render tick, idempotent with the rIC + explicit-tap paths
    // via `prefetchSetlistPDFs`'s `hasFile` short-circuit. Best-effort;
    // failures are swallowed.
    usePerformEntryPrecache(songFileIds)

    // Song count for header
    const songCount = tracks.filter((t) => !t.type || t.type === "song").length
    const totalCount = tracks.filter((t) => t.type !== "header").length

    // Back link: authenticated users go to /setlists, public users go to /perform (public listing)
    const backHref = isPublicView ? "/perform" : "/setlists"

    // Error messages based on error type
    const errorMessage = (() => {
        if (!error) return null
        const code = (error as { code?: string })?.code
        if (code === "permission-denied") {
            return "This setlist hasn't been published yet, or you don't have access."
        }
        if (code === "not-found") {
            return "Setlist not found -- it may have been deleted."
        }
        return "Couldn't load setlist -- check your connection and try again."
    })()

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] md:pt-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-medium">Loading setlist...</p>
                </div>
            </div>
        )
    }

    // WS-12: only blank the view with the fatal error when there's no loaded
    // content to fall back on. An already-hydrated set (SSR seed / Dexie cache /
    // prior live frame) survives a transient offline onSnapshot error — the
    // PerformanceOfflineIndicator below signals offline non-blockingly.
    if (shouldShowFatalSetlistError(errorMessage, tracks.length > 0)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] md:pt-20 gap-4">
                <p className="text-muted-foreground">{errorMessage}</p>
                <Button asChild variant="outline">
                    <Link href={backHref}>Back to {isPublicView ? "Home" : "Setlists"}</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-[calc(100dvh-5rem)] md:pt-20 bg-background text-foreground overflow-hidden">
            {/* Header — compact for maximum setlist visibility */}
            <div className="flex items-center gap-2 px-4 py-2 glass border-b-0 z-20 relative">
                <Link
                    href={backHref}
                    aria-label={isPublicView ? "Back to home" : "Back to setlists"}
                    className="h-11 w-11 flex items-center justify-center rounded-xl hover:bg-muted transition-colors shrink-0"
                >
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-base font-bold truncate">{name}</h1>
                    <p className="text-[11px] text-muted-foreground">
                        {songCount} song{songCount !== 1 ? "s" : ""}
                        {totalCount > songCount ? ` · ${totalCount} items` : ""}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {/* ipad-wake-lock-fix: gesture-gated "Keep screen on" toggle.
                        iOS Safari refuses navigator.wakeLock.request without a
                        user gesture; the prior auto-on-mount path silently failed
                        through the Yizkor service 2026-05-23. Daniel taps once at
                        the start of service → visibilitychange-rebind in the hook
                        re-acquires across iOS lock-screen / app-switch for the
                        rest of the session. */}
                    <KeepAwakeToggle
                        isActive={isWakeLockActive}
                        isSupported={isWakeLockSupported}
                        onRequest={requestWakeLock}
                        onRelease={releaseWakeLock}
                        lastError={wakeLockError}
                    />
                    {/* F1: pre-arm the whole setlist for offline use (idle auto-precache
                        runs on mount; this CTA force-caches with progress). Shown to
                        everyone performing — offline resilience isn't role-gated. */}
                    {songFileIds.length > 0 && <SaveOfflineButton fileIds={songFileIds} />}
                    {canPrint && (
                        <Button onClick={() => setShowPrintModal(true)} size="sm" variant="ghost" aria-label="Open gig packet" className="h-11 min-w-11 gap-1.5 text-muted-foreground">
                            <Printer className="h-4 w-4" />
                            <span className="text-xs hidden sm:inline">Gig Packet</span>
                        </Button>
                    )}
                    {isLeader && (
                        <Button asChild size="sm" variant="ghost" className="h-11 min-w-11 gap-1.5 text-muted-foreground">
                            <Link href={`/setlists/${setlistId}`} aria-label="Edit setlist">
                                <Pencil className="h-4 w-4" />
                                <span className="text-xs hidden sm:inline">Edit</span>
                            </Link>
                        </Button>
                    )}
                </div>
            </div>

            {/* Offline indicator — IDB ground truth for N/M charts ready */}
            <PerformanceOfflineIndicator setlistFileIds={songFileIds} />


            {/* Who's playing */}
            {musicians.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 overflow-x-auto scrollbar-hide">
                    <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {musicians.map((m, i) => (
                        <span
                            key={m.uid || i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground whitespace-nowrap shrink-0"
                        >
                            <span className="font-medium text-foreground">{(m.name || '').split(' ')[0] || 'Unknown'}</span>
                            {m.instrument && (
                                <span className="text-muted-foreground/70">{m.instrument}</span>
                            )}
                        </span>
                    ))}
                </div>
            )}

            {/* live-director-gesture library hydration (leader-only) */}
            {isLeaderRole && <LibraryHydrator />}

            {/* Setlist content */}
            <SetlistView
                tracks={tracks}
                currentTrackIndex={currentTrackIndex}
                defaultTransposition={defaultTransposition}
                isPublicView={isPublicView}
                isLeader={isLeader}
                onSongTap={(index) => setActiveSongIndex(index)}
                onLeaderSetPosition={setCurrentPosition}
                serviceNotes={serviceNotes}
                setlistId={setlistId}
            />

            {/* PDF overlay: renders on top of setlist when a song is tapped */}
            {activeSongIndex !== null && tracks[activeSongIndex] && (
                <PDFOverlay
                    track={tracks[activeSongIndex]}
                    tracks={tracks}
                    currentIndex={activeSongIndex}
                    onClose={() => setActiveSongIndex(null)}
                    onNavigate={(index) => setActiveSongIndex(index)}
                    isPublicView={isPublicView}
                    isLeader={isLeader}
                    setlistId={setlistId}
                    wakeLock={{
                        isActive: isWakeLockActive,
                        isSupported: isWakeLockSupported,
                        onRequest: requestWakeLock,
                        onRelease: releaseWakeLock,
                        lastError: wakeLockError,
                    }}
                />
            )}

            {/* Empty state */}
            {tracks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Music className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-lg font-medium">No tracks yet</p>
                    {!isPublicView && (
                        <Button asChild variant="outline" className="mt-4">
                            <Link href={`/setlists/${setlistId}`}>Add tracks</Link>
                        </Button>
                    )}
                </div>
            )}

            {showPrintModal && (
                <PrintModal
                    setlistName={name}
                    tracks={tracks}
                    setlistId={setlistId}
                    assignedMusicians={musicians}
                    rabbi={rabbi}
                    onClose={() => setShowPrintModal(false)}
                />
            )}
        </div>
    )
}

/**
 * Tiny child that triggers `useLibrary()` so the live-director swap-chart /
 * insert-song modals have `useLibraryStore.allFiles` populated. Rendered
 * only for `band_leader || admin` so non-leader iPads stay off the
 * `/api/library/list` fetch path entirely (perf-frugal on the band's
 * shared 6-iPad fleet over a single NAT'd WiFi budget — same constraint
 * coder-4 surfaced in exec-system-stress).
 */
function LibraryHydrator() {
    useLibrary(false, "all")
    return null
}
