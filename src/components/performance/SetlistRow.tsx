"use client"

import { FileMusic, ChevronRight, User, Replace } from "lucide-react"
import { SetlistTrack } from "@/types/models"
import { playedKey } from "@/lib/performance/played-key"
import { displayChartTitle } from "@/lib/format/chart-title"
import { cn } from "@/lib/utils"
import type { UseLongPressBag } from "@/hooks/use-long-press"
import type { WithTonight } from "@/lib/performance/tonight"
import { useT } from "@/i18n/client"
import type { SaveFailureReason } from "@/lib/prefetch"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { SECTION_BAND_CLASS, type SectionBand } from "@/components/setlist/grid/section-bands"
import { SetTotalText } from "@/components/setlist/gig/SetTotalText"
import { leadSingerKey } from "@/lib/gig/display"
import type { SetTotal } from "@/lib/gig/set-totals"

export interface SetlistRowProps {
    track: WithTonight<SetlistTrack>
    index: number
    isCurrentPosition: boolean
    defaultTransposition: number
    isPublicView: boolean
    onSongTap: () => void
    isLeader: boolean
    onLeaderSetPosition: () => void
    /**
     * Optional pointer/long-press handler bag from `useLongPress`. When
     * present, the gesture target (the interactive row root) wires its
     * pointer events so a ~500ms hold opens the live-director action sheet
     * (`LiveDirectorGesture` upstream). The hook's `onClick` is composed
     * with the existing tap-to-open click so a fired long-press suppresses
     * the synthetic click. Absent on non-leader iPads and on the
     * `openableNonSong` chevron rows (gesture only applies to song rows).
     */
    gestureHandlers?: UseLongPressBag
    /**
     * David's ask 4: opens the Swap-for-tonight sheet. Passed only for a
     * band_leader/admin on a chart-bearing row with a service day; absent
     * means no Swap control at all (musicians, public iPads).
     */
    onSwapTap?: () => void
    /** Web refresh: a header row's band (hue + the pages under it). */
    band?: SectionBand
    /** BET-5: a header row's set length (band tenants, or once any row has a length). */
    setTotal?: SetTotal
    /**
     * Whether this row's chart is saved on this device. `undefined` means the
     * device store hasn't been read yet, so nothing is claimed either way.
     */
    savedOffline?: boolean
    /**
     * PERF-21: why this row's chart didn't save on the last save pass, when
     * known. Shown after the not-saved line; retrying is the Save button.
     */
    saveFailure?: SaveFailureReason
}

export function SetlistRow({
    track,
    isCurrentPosition,
    defaultTransposition,
    isPublicView,
    onSongTap,
    isLeader,
    onLeaderSetPosition,
    gestureHandlers,
    onSwapTap,
    band,
    setTotal,
    savedOffline,
    saveFailure,
}: SetlistRowProps) {
    const t = useT()
    const isSong = !track.type || track.type === "song"
    const isHeader = track.type === "header"
    // v11.5-05-02 (Q5): some write paths (MCP / legacy upload / .docx import)
    // stored the raw filename — extension and all — as the track title. Strip a
    // stray chart/doc extension at DISPLAY time on the consumer surface. Headers
    // are user-typed section labels (not filenames), so they keep `track.title`.
    const title = displayChartTitle(track.title)

    // Compute display key. Precedence mirrors use-musician-transposition:
    // per-track override (track.transposition) wins over the musician's profile
    // default. Public view always shows the original key.
    // BET-5: when the author recorded the lead singer's key, the tag shows it
    // (in place of the row's key), with the same transposition rules.
    const sungKey = isSong ? leadSingerKey(track) : null
    const baseKey = sungKey ?? track.key
    const displayKey = (() => {
        if (!isSong || !baseKey) return null
        if (isPublicView) return baseKey
        return playedKey(baseKey, track.transposition, defaultTransposition)
    })()

    // A bonded chart is openable for ANY non-header track (song, prayer,
    // reading…), not just `song`-typed rows. Previously gated on `isSong`,
    // which left real charts on prayer/reading tracks unopenable in Perform
    // (R1 launch finding — e.g. a bonded Barechu / Adonai Sifatai).
    const hasFile = !isHeader && !!track.fileId
    const isInteractive = hasFile || isLeader
    // A non-song track that nonetheless carries an openable chart — it needs an
    // explicit tap affordance (icon + chevron + label) since it doesn't get the
    // song row's striped/bold treatment.
    const openableNonSong = hasFile && !isSong
    const hasSecondLine = !!(track.leadMusician || track.performer)
    // A chart-bearing row whose chart isn't on this device gets a quiet
    // oxblood line, so the gap is visible before the wifi goes.
    const notSavedLine = hasFile && savedOffline === false ? (
        <p data-testid="row-not-saved-offline" className="text-xs font-semibold text-warning-line mt-0.5">
            {t("performSetlist.row.notSavedOffline")}
            {saveFailure ? (
                <span data-testid="row-not-saved-reason" data-reason={saveFailure}>
                    {" · "}
                    {saveFailure === "corrupt"
                        ? t("performSetlist.row.saveFailedDamaged")
                        : t("performSetlist.row.saveFailedDownload")}
                </span>
            ) : null}
        </p>
    ) : null

    // Outline fields — rendered for every row type. `folio` is stored at
    // authoring time (never resolved at render), so this is a pure read.
    const folio = track.liturgyRef?.folio
    const honors = track.honors?.filter((h) => h?.name?.trim()) ?? []
    const outlinePerformer = !isSong ? track.performer : undefined

    // The field the eye hunts for mid-service. Right-aligned in a fixed column
    // so folios line up down the list; `p.` prefix so the meaning is never
    // carried by position or color alone. Full-strength foreground even on
    // de-emphasised rows — the row title may be muted, the page number never is.
    const folioBadge = folio !== undefined ? (
        <span
            data-testid="folio"
            className="tnum shrink-0 w-20 text-end text-[1.35rem] font-extrabold leading-none tracking-[-0.02em] whitespace-nowrap text-foreground"
        >
            {t("performSetlist.row.folio", { page: folio })}
        </span>
    ) : null

    // Extracted so the identical honors treatment can be shared by
    // outlineDetail (prayer/reading rows) AND the song row (P4-5: sung
    // liturgy — Mi Chamocha, Shalom Rav, Oseh Shalom, Adonai S'fatai — is
    // still liturgy and still carries honors) without duplicating markup.
    const honorsList = honors.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5">
            {honors.map((h, i) => (
                <li key={`${h.name}-${i}`} className="flex items-center gap-1.5 text-sm">
                    <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-foreground font-medium truncate">{h.name}</span>
                    {h.note && (
                        <span className="text-muted-foreground truncate">— {h.note}</span>
                    )}
                </li>
            ))}
        </ul>
    ) : null

    const outlineDetail = (
        <>
            {outlinePerformer && (
                <p className="text-sm font-medium text-brand truncate mt-0.5">
                    {outlinePerformer}
                </p>
            )}
            {honorsList}
            {track.description && (
                // Clamped: the full text lives in the book on the page named to the
                // right. Two lines is enough to identify the moment, not read it.
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {track.description}
                </p>
            )}
        </>
    )

    const headerExtra = (folio !== undefined || honors.length > 0) ? (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-card border-b border-rule">
            {honors.length > 0 && (
                <span className="flex items-center gap-1.5 text-sm min-w-0">
                    <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-foreground truncate">
                        {honors.map((h) => h.note ? `${h.name} — ${h.note}` : h.name).join(", ")}
                    </span>
                </span>
            )}
            <span className="flex-1" />
            {folioBadge}
        </div>
    ) : null

    const handleClick = () => {
        if (isLeader) {
            onLeaderSetPosition()
        }

        if (hasFile) {
            onSongTap()
        }
    }

    // Header items render as inline dividers. For leaders, wrap in a real
    // <button> so the whole row is a ≥44px tap target with native keyboard
    // activation. Musicians see a plain, non-interactive label.
    if (isHeader) {
        // Web refresh: a full-hue band carrying the running head and the
        // pages of the rows under it, the same band the editor draws.
        const sectionPages =
            band?.folioFrom === undefined || band.folioTo === undefined
                ? null
                : band.folioFrom === band.folioTo
                  ? t("setlistGrid.sectionPage", { page: band.folioFrom })
                  : t("setlistGrid.sectionPages", { from: band.folioFrom, to: band.folioTo })
        // The band is the section's heading (WCAG 1.3.1, 2.4.6): rotor users
        // jump section to section. A leader's band stays a button, inside the
        // heading.
        const bandClass = cn(
            "flex items-center gap-3 px-4 py-2.5 min-h-11 w-full text-start rounded-sm",
            SECTION_BAND_CLASS[band?.hue ?? "blue"],
        )
        const bandSpacing = "mt-4 first:mt-0"
        const headerInner = (
            <>
                <span className="flex-1 min-w-0 truncate text-sm font-extrabold uppercase tracking-[0.08em]">
                    {track.title}
                </span>
                {setTotal && <SetTotalText total={setTotal} className="text-sm" />}
                {sectionPages && (
                    <span data-testid="perform-section-pages" className="tnum shrink-0 text-sm font-bold tracking-[0.04em]">
                        {sectionPages}
                    </span>
                )}
            </>
        )
        if (isLeader) {
            return (
                <>
                    <h2 className={bandSpacing} data-testid="perform-section-heading">
                        <button
                            type="button"
                            onClick={handleClick}
                            data-section-hue={band?.hue}
                            className={cn(
                                bandClass,
                                "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            )}
                        >
                            {headerInner}
                        </button>
                    </h2>
                    {headerExtra}
                </>
            )
        }
        return (
            <>
                <h2 className={cn(bandClass, bandSpacing)} data-section-hue={band?.hue} data-testid="perform-section-heading">
                    {headerInner}
                </h2>
                {headerExtra}
            </>
        )
    }

    // Song content — key and notes directly after title, BPM pushed right
    const songContent = isSong ? (
        <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
                <span className="flex-1 min-w-0 break-words font-bold text-[1.2rem] leading-snug text-foreground">
                    {title}
                </span>
                {displayKey && (
                    // C5B-015: switched from `bg-brand/15 text-brand` (sub-AA in
                    // both light + dark per axe-core) to solid `bg-brand` with
                    // `text-brand-foreground` inverse. Light: bg L 0.50 vs fg
                    // L 0.985 → ~6.5:1 AA. Dark: bg L 0.55 vs fg L 0.97 → ~5.5:1 AA.
                    <span
                        data-testid="key-badge"
                        data-lead-key={sungKey ? "" : undefined}
                        className="tnum shrink-0 inline-flex items-center justify-center min-w-[2.75rem] h-8 px-2 self-center rounded-md border border-border bg-secondary text-base font-bold text-secondary-foreground"
                    >
                        {sungKey && track.leadMusician ? (
                            <span className="sr-only">{t("gig.leadKeyHint", { name: track.leadMusician })} </span>
                        ) : null}
                        {displayKey}
                    </span>
                )}
                {track.bpm && (
                    <span className="tnum text-xs text-muted-foreground shrink-0">
                        {t("performSetlist.row.bpm", { bpm: track.bpm })}
                    </span>
                )}
                {/* P4-5: folioBadge is LAST on the song row's first line, after
                    BPM — the fixed w-16 text-end column only stays scannable
                    if every row type's folio lands at the same right edge. */}
                {folioBadge}
            </div>
            {track.notes && (
                // Notes sit on their own line under the title, two lines at most.
                // The caution token: 5.9:1 on white, and it lifts in dark mode.
                <p className="text-sm font-medium text-caution line-clamp-2 break-words mt-0.5">
                    {track.notes}
                </p>
            )}
            {hasSecondLine && (
                // The brand token keeps AA contrast on the row in both themes
                // (a pale blue here measured 2.18:1 on light rows).
                <p className="text-sm font-medium text-brand truncate mt-0.5">
                    {track.leadMusician || track.performer}
                </p>
            )}
            {/* P4-5: sung liturgy (Mi Chamocha, Shalom Rav…) still carries
                honors; deliberately NOT track.description — songs already
                surface that role via track.notes on the first line. */}
            {honorsList}
            {notSavedLine}
        </div>
    ) : openableNonSong ? (
        // Prayer/reading WITH a bonded chart: must read as tappable, not as a
        // passive dimmed label. Leading chart glyph + foreground title + trailing
        // chevron — affordance is shape-based (color-not-alone).
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
                <FileMusic className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <span className="text-[1.05rem] font-semibold text-foreground break-words min-w-0">{title}</span>
                <span className="flex-1" />
                {/* P4-5: the chevron draws BEFORE the folio, so the badge is the
                    last element on every row type's line and its fixed w-16
                    right-aligned column lands at the same right edge as the
                    song, passive and header rows. With the chevron trailing it,
                    a bonded prayer/reading's folio sat ~30px (h-5 icon + gap-2.5)
                    left of every other row's — the one column the eye hunts down
                    while standing, out of alignment on exactly the rows that
                    carry a page number. */}
                <DirectionalIcon icon={ChevronRight} className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {folioBadge}
            </div>
            {outlineDetail}
            {notSavedLine}
        </div>
    ) : (
        // Passive outline row. Title stays muted to preserve the song/non-song
        // distinction, but rises to 16px — 14px is below the readable floor for a
        // tablet read at arm's length while standing. De-emphasis is COLOR ONLY;
        // never re-introduce opacity here (see the rowClasses comment).
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <span className="text-base text-muted-foreground break-words min-w-0">{title}</span>
                <span className="flex-1" />
                {folioBadge}
            </div>
            {outlineDetail}
        </div>
    )

    // Web refresh: white rows on the 1px hairline grid (no zebra), tall
    // enough (py-3.5 around a 1.2rem title) to hit standing at arm's length. The current position is a
    // tinted row with an inset ring; `data-current` carries it for tests.
    const rowClasses = cn(
        "flex items-center px-4 py-3.5 border-b border-rule transition-colors",
        // A strong keyboard focus mark, readable at arm's length (WCAG 2.4.7):
        // an outline, so it never fights the current-position ring.
        "outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-3",
        isCurrentPosition ? "bg-accent ring-2 ring-inset ring-brand" : "bg-card",
        // Passive non-song labels are de-emphasized via the muted *title color*
        // (songContent's text-muted-foreground span), NOT row opacity. opacity-60
        // composited the muted text below WCAG AA on the light theme (axe color-
        // contrast, 3.59:1). An openable prayer/reading still reads full-prominence.
    )

    // Non-interactive rows
    if (!isInteractive) {
        return (
            <div className={cn(rowClasses, "cursor-default")} data-current={isCurrentPosition || undefined}>
                {songContent}
            </div>
        )
    }

    // Interactive rows
    // Compose the gesture handlers' onClick with the row's own click. The
    // long-press hook calls e.preventDefault()+stopPropagation() when a
    // long-press fired, and we then bail on the row's click handler.
    const composedClick = (e: React.MouseEvent) => {
        if (gestureHandlers) {
            gestureHandlers.onClick(e)
            if (e.defaultPrevented) return
        }
        handleClick()
    }

    const rowEl = (
        <div
            role="button"
            tabIndex={0}
            data-testid="perform-row"
            data-row-id={track.id}
            data-file-id={track.fileId ?? ""}
            data-current={isCurrentPosition || undefined}
            aria-label={openableNonSong ? t("performSetlist.row.openChart", { songTitle: title }) : undefined}
            onClick={composedClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleClick()
                }
            }}
            {...(gestureHandlers
                ? {
                    onPointerDown: gestureHandlers.onPointerDown,
                    onPointerUp: gestureHandlers.onPointerUp,
                    onPointerMove: gestureHandlers.onPointerMove,
                    onPointerCancel: gestureHandlers.onPointerCancel,
                    onContextMenu: gestureHandlers.onContextMenu,
                    style: gestureHandlers.style,
                }
                : {})}
            className={cn(
                rowClasses,
                "min-h-11",
                hasFile
                    ? "cursor-pointer hover:bg-accent/60 active:bg-accent"
                    : "cursor-default"
            )}
        >
            {track.tonight ? (
                <div className="flex-1 min-w-0">
                    {songContent}
                    {/* Everyone sees that tonight differs from the plan. */}
                    <p data-testid="tonight-note" className="text-sm font-semibold text-warning-line truncate mt-0.5">
                        {t("performSetlist.row.tonightPlanned", { plannedTitle: displayChartTitle(track.tonight.plannedTitle) })}
                    </p>
                </div>
            ) : (
                songContent
            )}
        </div>
    )

    if (!onSwapTap) return rowEl
    return (
        <div className="flex items-stretch bg-card">
            <div className="flex-1 min-w-0">{rowEl}</div>
            <button
                type="button"
                data-testid="tonight-swap-button"
                aria-label={t("performSetlist.row.swapForTonight", { songTitle: title })}
                onClick={(e) => {
                    e.stopPropagation()
                    onSwapTap()
                }}
                className="shrink-0 w-16 min-h-11 flex flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent border-s border-b border-rule cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [touch-action:manipulation]"
            >
                <Replace className="h-5 w-5" aria-hidden="true" />
                {t("performSetlist.row.swap")}
            </button>
        </div>
    )
}
