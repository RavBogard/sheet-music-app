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

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Loader2, ArrowLeft, Music, Users, Pencil, Printer, ListCollapse, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSetlistPerformance } from "@/hooks/use-setlist-performance"
import { PERFORM_PRECACHE_DONE_EVENT, usePerformEntryPrecache } from "@/hooks/use-perform-entry-precache"
import { loadPDFOverlay } from "@/lib/perform-chart-loaders"
import { requestPerformCacheUrl } from "@/components/performance/perform-shell-sw-register"
import { useAuth } from "@/lib/auth-context"
import { useLibrary } from "@/hooks/use-library"
import { SetlistView } from "@/components/performance/SetlistView"
import { SetlistFamilyHead } from "@/components/family/SetlistFamilyHead"
import { PerformanceOfflineIndicator } from "@/components/performance/PerformanceOfflineIndicator"
import { SaveOfflineButton } from "@/components/performance/SaveOfflineButton"
import { setChartOpen, type SaveFailureReason } from "@/lib/prefetch"
import { KeepAwakeToggle } from "@/components/performance/KeepAwakeToggle"
import { KeepAwakeAutoArm } from "@/components/performance/keep-awake-context"
import { bookTitle } from "@/lib/books/titles"
import { useLiturgyCollapse } from "@/hooks/use-liturgy-collapse"
import { liturgyRuns } from "@/components/performance/liturgy-runs"
import { shouldShowFatalSetlistError } from "./perform-error-gate"
import type { Setlist, SetlistTrack } from "@/types/models"
import type { OverridesDoc } from "@/lib/performance/tonight"
import { commitTonightReset } from "@/lib/performance/tonight-client"
import { logger } from "@/lib/logger"
import { TonightSwapSheet } from "@/components/performance/TonightSwapSheet"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { formatUpdatedWhen } from "@/lib/format/updated-when"
import { cn } from "@/lib/utils"
import { PAGE_WIDTH_CLASS } from "@/components/layout/Page"

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
    // Shared import site with the Perform warm-up (perf audit P1-2).
    () => loadPDFOverlay().then(m => m.PDFOverlay),
    { ssr: false },
)

export interface SetlistPerformClientProps {
    setlistId: string
    initialSetlist: Setlist | null
    initialTracks: SetlistTrack[]
    /** Tonight's swaps as the server read them (David's ask 4). */
    initialOverrides?: OverridesDoc | null
    /**
     * c11-fix-perform-track-position-in-url (M3-009): when the page is
     * entered via `/perform/setlist/<id>/track/<trackId>`, seed
     * `activeSongIndex` to that track on first render so reload /
     * bookmark / PWA app-resume lands on the right song instead of the
     * list. Unknown trackId → falls back to bare-path behavior (no
     * overlay).
     */
    initialTrackId?: string | null
    /** PERF-18: the server's current version per bonded fileId. */
    chartVersions?: Record<string, string>
}

export function SetlistPerformClient({
    setlistId,
    initialSetlist,
    initialTracks,
    initialOverrides = null,
    initialTrackId,
    chartVersions,
}: SetlistPerformClientProps) {
    const t = useT()
    const fmt = useFormat()
    const {
        tracks,
        plannedTracks,
        tonightOverrides,
        serviceDay,
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
        book,
        eventDate,
        setlistUpdatedSinceLoad,
        setlistLiveStamp,
        setlistUpdatedAt,
        isWakeLockActive,
        isWakeLockSupported,
        wakeLockError,
        requestWakeLock,
        releaseWakeLock,
    } = useSetlistPerformance(setlistId, {
        initial: initialSetlist
            ? { setlist: initialSetlist, tracks: initialTracks, overrides: initialOverrides }
            : null,
    })

    // PERF-01: the SW may answer an offline /track/<id> reload with the BASE
    // setlist page (no initialTrackId), leaving the track only in the address
    // bar. Capture it once (a ref, so SSR and hydration markup agree) and open
    // it after mount.
    const bootTrackRef = useRef<string | null>(
        typeof window === "undefined"
            ? null
            : (() => {
                  const m = window.location.pathname.match(/\/track\/([^/]+)\/?$/)
                  if (!m) return null
                  try {
                      return decodeURIComponent(m[1])
                  } catch {
                      return null
                  }
              })(),
    )
    const bootPendingRef = useRef(!initialTrackId && !!bootTrackRef.current)

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
        const seed = initialTracks[idx]
        // Cast through `string` because the SetlistGrid editor's TypeCell
        // picker writes `'section'` for the "Section header" option (see
        // `TypeCell.tsx:42` + `SetlistGrid.tsx:168`'s `isSectionRow`), while
        // the canonical `TrackType` union in `types/models.ts:34` only lists
        // `'header'`. Both literals appear in real setlist data.
        const tt = seed.type as string | undefined
        if (tt === "header" || tt === "section") return null
        return idx
    })
    const [showPrintModal, setShowPrintModal] = useState(false)
    // Web refresh: "N/M charts on this iPad" in the status line, read from the
    // Save offline button's own count of this device's offline store.
    const [deviceReady, setDeviceReady] = useState<number | null>(null)
    const [deviceTotal, setDeviceTotal] = useState(0)
    const [savedFileIds, setSavedFileIds] = useState<ReadonlySet<string> | null>(null)
    // PERF-21: why a chart didn't save, per fileId, from this session's save passes.
    const [saveFailures, setSaveFailures] = useState<ReadonlyMap<string, SaveFailureReason> | null>(null)
    const onDeviceReady = useCallback((
        ready: number,
        total: number,
        savedIds: ReadonlySet<string>,
        failures?: ReadonlyMap<string, SaveFailureReason>,
    ) => {
        setDeviceReady(ready)
        setDeviceTotal(total)
        setSavedFileIds(savedIds)
        setSaveFailures(failures ?? null)
    }, [])
    // Per-device (`crc.perform.liturgy-collapsed`), default collapsed. The
    // control only appears when this service actually has fixed-liturgy rows
    // to fold — a Camp Sabra setlist of eight songs should not grow a button
    // that does nothing.
    const { collapsed: liturgyCollapsed, setCollapsed: setLiturgyCollapsed } =
        useLiturgyCollapse()
    const foldableLiturgyRows = liturgyRuns(tracks).reduce(
        (n, run) => n + run.indexes.length,
        0,
    )

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
        if (!bootPendingRef.current || tracks.length === 0) return
        bootPendingRef.current = false
        const idx = tracks.findIndex((t) => t.id === bootTrackRef.current)
        const row = idx >= 0 ? tracks[idx] : null
        if (row && row.type !== "header" && (row.type as string) !== "section") setActiveSongIndex(idx)
    }, [tracks])

    useEffect(() => {
        if (typeof window === "undefined") return
        // Hold the URL rewrite until the boot track has been resolved.
        if (bootPendingRef.current && tracks.length > 0) return
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
            // PERF-01: replaceState makes no request, so ask the SW to cache the
            // new URL; an offline reload on an open chart is then served.
            if (desiredPath !== basePath) requestPerformCacheUrl(desiredPath)
        }
    }, [activeSongIndex, setlistId, tracks])

    const { isBandLeader, isAdmin, user, loading: authLoading } = useAuth()
    // PERF-06 strip gates: online, auth resolved, and not already refreshed for
    // this live version (a reload that still shows the same version must not
    // offer the strip again, so it can never loop).
    const [online, setOnline] = useState(true)
    useEffect(() => {
        setOnline(navigator.onLine !== false)
        const on = () => setOnline(true)
        const off = () => setOnline(false)
        window.addEventListener("online", on)
        window.addEventListener("offline", off)
        return () => {
            window.removeEventListener("online", on)
            window.removeEventListener("offline", off)
        }
    }, [])
    const refreshKey = `perform-setlist-refreshed:${setlistId}`
    const alreadyRefreshed = (() => {
        try {
            return !!setlistLiveStamp && sessionStorage.getItem(refreshKey) === setlistLiveStamp
        } catch {
            return false
        }
    })()
    const showUpdatedStrip = setlistUpdatedSinceLoad && online && !authLoading && !alreadyRefreshed
    const [swapIndex, setSwapIndex] = useState<number | null>(null)
    const [resetBusy, setResetBusy] = useState(false)
    // Printing is NOT a privilege (Daniel, 2026-09-10) — not by role, and not
    // by having an account. The old `isMusician || isBandLeader || isAdmin`
    // gate hid the button from every signed-in person without a role, which is
    // exactly backwards for a band that needs paper; a signed-out guest
    // reading a public setlist needs it just as much. `/api/setlist/print`
    // accepts anonymous callers (on a tighter rate-limit bucket), and the
    // modal hides its band-management controls when there's no session.
    const canPrint = true

    // live-director-gesture: the swap-chart / insert-song modals consume
    // `useLibraryStore.allFiles`. Perform routes don't otherwise hydrate
    // the library, so we drive `useLibrary` ONLY for the leader role
    // (`band_leader || admin`) via a child component — musician + public
    // iPads stay on the lean Perform payload.
    const isLeaderRole = isBandLeader || isAdmin

    // Song fileIds for the offline indicator's IDB ground-truth count.
    const songFileIds = tracks
        // PERF-03: every openable row (bonded prayers and readings open as
        // charts too), not song rows only.
        .filter(t => !!t.fileId)
        .map(t => t.fileId as string)
        .filter((id, i, all) => all.indexOf(id) === i)
    // The count SaveOfflineButton will report (it drops `flow-` pseudo ids),
    // used only to reserve the status line's width before it reports.
    const reservedChartCount = songFileIds.filter((id) => !id.startsWith("flow-")).length

    // F1 (perform-entry-precache): warm Dexie with every bonded chart the
    // moment the overlay mounts — `requestIdleCallback` (the SaveOfflineButton
    // path) only fires on browser idle, which leaves a window where a band
    // member on weak shul WiFi can lose connectivity before the rIC pass
    // ever runs. This hook fires via `queueMicrotask`, deferred only past
    // the current render tick, idempotent with the rIC + explicit-tap paths
    // via `prefetchSetlistPDFs`'s `hasFile` short-circuit. Best-effort;
    // failures are swallowed.
    usePerformEntryPrecache(songFileIds, chartVersions)
    // Perf audit P2-3: on a device that hasn't saved this setlist yet, every
    // chart row grew a "not saved on this iPad" line as soon as the offline
    // store was read, then lost it again as the entry precache saved each
    // chart: the list jumped twice under a musician's finger (CLS 0.07-0.10).
    // Hold the per-row lines until that first pass settles; after it, a line
    // means the chart really didn't save. The head row's "N/M charts on this
    // iPad" count shows progress meanwhile. Offline at entry (no pass runs) or
    // a pass that never reports: the lines appear at once / after 30 s.
    const [entryPassSettled, setEntryPassSettled] = useState(false)
    useEffect(() => {
        if (entryPassSettled) return
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            setEntryPassSettled(true)
            return
        }
        const settle = () => setEntryPassSettled(true)
        window.addEventListener(PERFORM_PRECACHE_DONE_EVENT, settle)
        const fallback = setTimeout(settle, 30_000)
        return () => {
            window.removeEventListener(PERFORM_PRECACHE_DONE_EVENT, settle)
            clearTimeout(fallback)
        }
    }, [entryPassSettled])

    // PERF-18: background chart refreshes wait while a chart is open, so they
    // never compete with the one being read. Saves of missing charts still run.
    const chartIsOpen = activeSongIndex !== null
    useEffect(() => {
        setChartOpen(chartIsOpen)
    }, [chartIsOpen])
    useEffect(() => () => setChartOpen(false), [])

    // Song count for header
    const songCount = tracks.filter((t) => !t.type || t.type === "song").length
    const totalCount = tracks.filter((t) => t.type !== "header").length
    const bookName = bookTitle(book)

    // Back link: authenticated users go to /setlists, public users go to /perform (public listing)
    const backHref = isPublicView ? "/perform" : "/setlists"

    // Error messages based on error type
    const errorMessage = (() => {
        if (!error) return null
        const code = (error as { code?: string })?.code
        if (code === "permission-denied") {
            return t("performSetlist.error.noAccess")
        }
        if (code === "not-found") {
            return t("performSetlist.error.notFound")
        }
        return t("performSetlist.error.loadFailed")
    })()

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] pt-14">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-medium">{t("performSetlist.loadingSetlist")}</p>
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
            <div className="flex flex-col items-center justify-center min-h-[60vh] pt-14 gap-4">
                <p className="text-muted-foreground">{errorMessage}</p>
                <Button asChild variant="outline">
                    <Link href={backHref}>{isPublicView ? t("performSetlist.backToHome") : t("performSetlist.backToSetlists")}</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-[calc(100dvh-5rem)] pt-14 bg-background text-foreground overflow-hidden">
            {/* 2026-08-31: opening a setlist to perform IS the intent to keep
                the screen awake — no one should have to remember a toggle
                before every service. This asks the layout's KeepAwakeProvider
                to arm (restoring a stored intent, or arming for the first
                time); an explicit disarm via the toggle is remembered and is
                NOT overridden here. Renders nothing. */}
            <KeepAwakeAutoArm />
            {/* Head row (web refresh, blend E): the title large, the status
                line under it ("Updated … · N/M charts on this iPad"), and the
                tools on the right with Edit as the one blue action. */}
            <div className="z-20 relative bg-background border-b border-rule">
                {/* Consistency pass: the page container width, and a head that
                    wraps instead of crushing: back + title (2 lines) + status on
                    a full row on a phone, the toolbar in one row under them. */}
                <div className={cn(PAGE_WIDTH_CLASS, "flex flex-wrap items-start gap-x-3 gap-y-2 py-3")}>
                <div className="flex min-w-0 flex-[1_1_22rem] items-start gap-1 sm:gap-2">
                <Link
                    href={backHref}
                    aria-label={isPublicView ? t("performSetlist.backToHomeLabel") : t("performSetlist.backToSetlistsLabel")}
                    className="h-11 w-11 -ms-2 flex items-center justify-center rounded-md hover:bg-accent transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <DirectionalIcon icon={ArrowLeft} className="h-5 w-5 text-foreground" />
                </Link>
                <div className="flex-1 min-w-0 pt-1">
                    <h1 className="line-clamp-2 break-words text-[1.35rem] sm:text-[1.6rem] font-extrabold leading-tight tracking-[-0.015em]">{name}</h1>
                    <p data-testid="perform-status-line" className="tnum mt-0.5 text-sm font-medium text-muted-foreground">
                        <span>
                            {totalCount > songCount
                                ? t("performSetlist.header.songsAndItems", { count: songCount, totalCount })
                                : t("performSetlist.songCount", { count: songCount })}
                        </span>
                        {setlistUpdatedAt && (
                            <>
                                <span aria-hidden="true"> · </span>
                                <span>{t("performSetlist.status.updated", { when: formatUpdatedWhen(fmt, setlistUpdatedAt) })}</span>
                            </>
                        )}
                        {deviceReady !== null && deviceTotal > 0 && (
                            <>
                                <span aria-hidden="true"> · </span>
                                <span
                                    data-testid="perform-status-device"
                                    data-complete={deviceReady >= deviceTotal ? "true" : "false"}
                                    className={cn(deviceReady < deviceTotal && "text-caution font-semibold")}
                                >
                                    {t("performSetlist.status.chartsOnDevice", { ready: deviceReady, total: deviceTotal })}
                                </span>
                            </>
                        )}
                        {/* Perf audit P2-3: the device count arrives after
                            hydration (the offline store is read on the
                            client). Appearing late, it wrapped the status
                            line onto a second line on a phone and pushed the
                            whole list down a few px (CLS 0.07-0.10, right
                            where a musician taps). Reserve its width with an
                            invisible stand-in of the same text until then. */}
                        {deviceReady === null && reservedChartCount > 0 && (
                            <span aria-hidden="true" className="invisible" data-testid="perform-status-device-reserve">
                                <span> · </span>
                                <span>{t("performSetlist.status.chartsOnDevice", { ready: reservedChartCount, total: reservedChartCount })}</span>
                            </span>
                        )}
                    </p>
                    {bookName && (
                        <p className="text-sm text-muted-foreground truncate">{bookName}</p>
                    )}
                    {/* BET-6: parasha line and Beit Mitzvah card (CRC only). */}
                    <SetlistFamilyHead setlistId={setlistId} setlist={initialSetlist as unknown as Record<string, unknown> | null} />
                </div>
                </div>
                <div className="ms-auto flex flex-wrap items-center justify-end gap-1 shrink-0">
                    {/* "Keep screen on" — now a MANUAL OVERRIDE, not the only
                        way in (2026-08-31). <KeepAwakeAutoArm/> above already
                        armed the lock on mount; this toggle exists so a
                        musician can turn it OFF (recorded durably, so it stays
                        off across reloads) and so the engaged state is visible
                        before the service starts. The old comment here said
                        iOS refuses a non-gesture request — that was a
                        misdiagnosis of the 2026-05-23 Yizkor regression; see
                        `use-wake-lock.ts` for what actually broke (iPadOS
                        <18.4 standalone-app wake-lock bug, WebKit 254545). */}
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
                    {songFileIds.length > 0 && <SaveOfflineButton fileIds={songFileIds} onReadyChange={onDeviceReady} versions={chartVersions} />}
                    {foldableLiturgyRows > 0 && (
                        <Button
                            onClick={() => setLiturgyCollapsed(!liturgyCollapsed)}
                            size="sm"
                            variant="ghost"
                            aria-pressed={liturgyCollapsed}
                            aria-label={
                                liturgyCollapsed
                                    ? t("performSetlist.toolbar.showLiturgyRows", { count: foldableLiturgyRows })
                                    : t("performSetlist.toolbar.hideLiturgyRows", { count: foldableLiturgyRows })
                            }
                            className="h-11 min-w-11 gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                            {liturgyCollapsed ? (
                                <List className="h-4 w-4" />
                            ) : (
                                <ListCollapse className="h-4 w-4" />
                            )}
                            <span className="text-xs font-semibold hidden sm:inline">
                                {liturgyCollapsed ? t("performSetlist.toolbar.liturgy") : t("performSetlist.toolbar.songsOnly")}
                            </span>
                        </Button>
                    )}
                    {canPrint && (
                        <Button onClick={() => setShowPrintModal(true)} size="sm" variant="ghost" aria-label={t("performSetlist.toolbar.printSetlist")} className="h-11 min-w-11 gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer">
                            <Printer className="h-4 w-4" />
                            <span className="text-xs font-semibold hidden sm:inline">{t("performSetlist.toolbar.print")}</span>
                        </Button>
                    )}
                    {isLeader && (
                        <Button asChild size="sm" className="h-11 min-w-11 gap-1.5 rounded-md px-3 sm:px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-bold">
                            <Link href={`/setlists/${setlistId}`} aria-label={t("performSetlist.toolbar.editSetlist")}>
                                <Pencil className="h-4 w-4" />
                                <span className="text-sm hidden sm:inline">{t("performSetlist.toolbar.edit")}</span>
                            </Link>
                        </Button>
                    )}
                </div>
                </div>
            </div>

            {/* Offline indicator — IDB ground truth for N/M charts ready */}
            <PerformanceOfflineIndicator setlistFileIds={songFileIds} />

            {/* PERF-06: signed-out devices get no realtime rows. When the live
                setlist doc moves past what this page loaded, say so. Tap to
                reload; never reloads by itself (a chart may be open). */}
            {showUpdatedStrip && (
                <button
                    type="button"
                    data-testid="setlist-updated-strip"
                    onClick={() => {
                        try {
                            if (setlistLiveStamp) sessionStorage.setItem(refreshKey, setlistLiveStamp)
                        } catch {
                            // storage unavailable
                        }
                        window.location.reload()
                    }}
                    className="w-full min-h-12 px-4 text-[15px] font-semibold bg-card text-caution underline-offset-4 hover:underline border-b border-rule cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                    {t("perform.offline.setlistUpdated")}
                </button>
            )}


            {/* Who's playing */}
            {musicians.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-rule overflow-x-auto scrollbar-hide">
                    <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {musicians.map((m, i) => (
                        <span
                            key={m.uid || i}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-sm text-muted-foreground whitespace-nowrap shrink-0"
                        >
                            <span className="font-medium text-foreground">{(m.name || '').split(' ')[0] || t("performSetlist.unknownMusician")}</span>
                            {m.instrument && (
                                <span className="text-muted-foreground/70">{m.instrument}</span>
                            )}
                        </span>
                    ))}
                </div>
            )}

            {/* live-director-gesture library hydration (leader-only) */}
            {isLeaderRole && <LibraryHydrator />}

            {/* David's ask 4: tonight-only swaps differ from the plan. */}
            {isLeader && user && serviceDay && tonightOverrides && Object.keys(tonightOverrides.rows).length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-rule text-sm">
                    <span className="flex-1 font-semibold text-warning-line">
                        {t("performSetlist.tonight.rowsSwapped", { count: Object.keys(tonightOverrides.rows).length })}
                    </span>
                    <Button
                        size="sm"
                        variant="outline"
                        data-testid="tonight-reset"
                        className="h-11"
                        disabled={resetBusy}
                        onClick={async () => {
                            setResetBusy(true)
                            try {
                                await commitTonightReset(setlistId, {
                                    planned: Object.fromEntries(
                                        plannedTracks.map((t) => [t.id, { fileId: t.fileId ?? null, title: t.title }]),
                                    ),
                                    by: user.uid,
                                    at: Date.now(),
                                    eventDay: serviceDay,
                                })
                            } catch (err) {
                                logger.warn("[perform] Reset to plan failed", err)
                            } finally {
                                setResetBusy(false)
                            }
                        }}
                    >
                        {t("performSetlist.tonight.resetToPlan")}
                    </Button>
                </div>
            )}

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
                collapseLiturgy={liturgyCollapsed}
                savedFileIds={entryPassSettled ? savedFileIds : null}
                saveFailures={entryPassSettled ? saveFailures : null}
                onSwapTap={isLeader && user && serviceDay ? (index) => setSwapIndex(index) : undefined}
            />

            {swapIndex !== null && tracks[swapIndex] && serviceDay && (() => {
                const shown = tracks[swapIndex]
                const planned = plannedTracks.find((t) => t.id === shown.id) ?? shown
                return (
                    <TonightSwapSheet
                        open
                        onOpenChange={(o) => { if (!o) setSwapIndex(null) }}
                        setlistId={setlistId}
                        track={shown}
                        planned={planned}
                        serviceDay={serviceDay}
                    />
                )
            })()}

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
                    <p className="text-lg font-medium">{t("performSetlist.noTracksYet")}</p>
                    {!isPublicView && (
                        <Button asChild variant="outline" className="mt-4">
                            <Link href={`/setlists/${setlistId}`}>{t("performSetlist.addTracks")}</Link>
                        </Button>
                    )}
                </div>
            )}

            {showPrintModal && (
                <PrintModal
                    setlistName={name}
                    // The setlist's own service date, not the day the packet
                    // happens to be printed. PrintModal falls back to today
                    // when this is null (no eventDate on the doc).
                    eventDate={eventDate}
                    tracks={tracks}
                    setlistId={setlistId}
                    assignedMusicians={musicians}
                    rabbi={rabbi}
                    // Phase 4: the same book name this header shows, so the
                    // printed packet's folio column is attributed too.
                    bookTitle={bookName}
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
