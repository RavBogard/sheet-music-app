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
import { SECTION_BAND_CLASS, SECTION_LABEL_META_CLASS, type SectionBand } from "@/components/setlist/grid/section-bands"
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
    /**
     * Live reorder: the row was just moved (by this leader or, on a receiving
     * iPad, by another). A brief low-opacity brand wash; colour only, so the
     * list never shifts.
     */
    highlighted?: boolean
    /** 1-based display number (songs and other rows; headers get none). Display only. */
    position?: number
    /**
     * Some row on this setlist can Swap, so every row reserves the Swap
     * column (empty where it can't), keeping the key and page columns in
     * one line down the list.
     */
    swapColumn?: boolean
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
    highlighted = false,
    position,
    swapColumn = false,
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

    // The field the eye hunts for mid-service. Option B: a bare bold numeral
    // in book-blue, right-aligned in a fixed column that EVERY row renders
    // (empty when there is no page), so the pages line up down the list. The
    // spoken label keeps "p." for screen readers.
    const pageCell = folio !== undefined ? (
        <span
            data-testid="folio"
            className="tnum shrink-0 w-11 text-end text-[0.95rem] font-bold whitespace-nowrap text-page-call"
        >
            <span className="sr-only">{t("performSetlist.row.folio", { page: folio })}</span>
            <span aria-hidden="true">{folio}</span>
        </span>
    ) : (
        <span aria-hidden="true" className="shrink-0 w-11" />
    )
    const folioBadge = folio !== undefined ? pageCell : null

    // Extracted so the identical honors treatment can be shared by
    // outlineDetail (prayer/reading rows) AND the song row (P4-5: sung
    // liturgy — Mi Chamocha, Shalom Rav, Oseh Shalom, Adonai S'fatai — is
    // still liturgy and still carries honors) without duplicating markup.
    const honorsList = honors.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5">
            {honors.map((h, i) => (
                <li key={`${h.name}-${i}`} className="flex items-center gap-1.5 text-xs">
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
                <p className="text-xs font-medium text-brand truncate">
                    {outlinePerformer}
                </p>
            )}
            {honorsList}
            {track.description && (
                // Clamped: the full text lives in the book on the page named to the
                // right. Two lines is enough to identify the moment, not read it.
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {track.description}
                </p>
            )}
        </>
    )

    const headerExtra = (folio !== undefined || honors.length > 0) ? (
        <div className="flex items-center gap-2 px-4 py-1 bg-card border-b border-rule">
            {honors.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs min-w-0">
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
        // Option B: a thin coloured underline with a small uppercase label and
        // the pages of the rows under it, muted, at the right. The same label
        // the editor draws.
        const sectionPages =
            band?.folioFrom === undefined || band.folioTo === undefined
                ? null
                : band.folioFrom === band.folioTo
                  ? t("setlistGrid.sectionPage", { page: band.folioFrom })
                  : t("setlistGrid.sectionPages", { from: band.folioFrom, to: band.folioTo })
        // The label is the section's heading (WCAG 1.3.1, 2.4.6): rotor users
        // jump section to section. A leader's label stays a button, inside the
        // heading, with a 44px hit area; the drawn label stays thin.
        const bandClass = cn(
            "flex items-end gap-3 px-4 pt-3 pb-1 w-full text-start border-b-2 bg-card",
            SECTION_BAND_CLASS[band?.hue ?? "blue"],
            highlighted && "ring-4 ring-inset ring-brand/40",
        )
        // One continuous card: sections are labels inside it, not gaps.
        const bandSpacing = ""
        const headerInner = (
            <>
                <span className="flex-1 min-w-0 truncate text-xs font-extrabold uppercase tracking-[0.1em]">
                    {track.title}
                </span>
                {setTotal && <SetTotalText total={setTotal} />}
                {sectionPages && (
                    <span data-testid="perform-section-pages" className={SECTION_LABEL_META_CLASS}>
                        {sectionPages}
                    </span>
                )}
                {swapColumn && <span aria-hidden="true" className="shrink-0 w-8 sm:w-11" />}
            </>
        )
        if (isLeader) {
            return (
                <>
                    <h2 className={bandSpacing} data-testid="perform-section-heading" data-moved={highlighted || undefined}>
                        <button
                            type="button"
                            onClick={handleClick}
                            data-section-hue={band?.hue}
                            className={cn(
                                bandClass,
                                "min-h-11 cursor-pointer hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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
                <h2 className={cn(bandClass, bandSpacing)} data-section-hue={band?.hue} data-testid="perform-section-heading" data-moved={highlighted || undefined}>
                    {headerInner}
                </h2>
                {headerExtra}
            </>
        )
    }

    // Option B row grammar, shared by every row type: a muted number, the
    // title (with its second lines under it), then two fixed columns that
    // always render, key and page, so neither ever floats.
    const keyCell = (
        <span className="shrink-0 w-10 sm:w-12 flex justify-center">
            {displayKey ? (
                // A small outlined key tag in full ink.
                <span
                    data-testid="key-badge"
                    data-lead-key={sungKey ? "" : undefined}
                    className="tnum inline-flex items-center justify-center px-1.5 rounded-[3px] border border-input text-xs font-bold leading-[1.125rem] text-foreground"
                >
                    {sungKey && track.leadMusician ? (
                        <span className="sr-only">{t("gig.leadKeyHint", { name: track.leadMusician })} </span>
                    ) : null}
                    {displayKey}
                </span>
            ) : null}
        </span>
    )
    const numberCell = (
        <span aria-hidden="true" className="tnum shrink-0 w-6 text-end text-xs text-muted-foreground">
            {position ?? ""}
        </span>
    )
    // A row's first line: number, title, key, page. Baseline-aligned so a
    // two-line row keeps its key and page on the title's line.
    const firstLine = (titleEl: React.ReactNode) => (
        <div className="flex items-baseline gap-2">
            {numberCell}
            {titleEl}
            {keyCell}
            {pageCell}
        </div>
    )
    // Second lines sit under the title, past the number column, and stop
    // short of the key and page columns.
    const below = (children: React.ReactNode) => <div className="ps-8 sm:pe-[6.25rem] min-w-0">{children}</div>

    const notesLine = track.notes ? (
        // Notes: a small quiet second line (the mock's oxblood), two lines at most.
        <p data-testid="row-notes" className="text-xs text-section-oxblood-ink line-clamp-2 break-words">
            {track.notes}
        </p>
    ) : null

    const songContent = isSong ? (
        <div className="flex-1 min-w-0">
            {firstLine(
                <div className="flex-1 min-w-0 break-words text-base font-medium leading-6 text-foreground">
                    <span>{title}</span>
                    {track.bpm ? (
                        <span className="tnum ms-2 text-xs font-normal text-muted-foreground whitespace-nowrap">
                            {t("performSetlist.row.bpm", { bpm: track.bpm })}
                        </span>
                    ) : null}
                </div>,
            )}
            {below(
                <>
                    {notesLine}
                    {hasSecondLine && (
                        // The brand token keeps AA contrast on the row in both themes.
                        <p className="text-xs font-medium text-brand truncate">
                            {track.leadMusician || track.performer}
                        </p>
                    )}
                    {/* P4-5: sung liturgy still carries honors; deliberately NOT
                        track.description. */}
                    {honorsList}
                    {notSavedLine}
                </>,
            )}
        </div>
    ) : openableNonSong ? (
        // Prayer/reading WITH a bonded chart: reads as tappable (a chart glyph
        // and a chevron after the title, shape not colour), in full ink.
        <div className="flex-1 min-w-0">
            {firstLine(
                <div className="flex-1 min-w-0 flex items-center gap-1.5 text-base font-medium leading-6 text-foreground">
                    <FileMusic className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                    <span className="min-w-0 break-words">{title}</span>
                    <DirectionalIcon icon={ChevronRight} className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>,
            )}
            {below(
                <>
                    {outlineDetail}
                    {notSavedLine}
                </>,
            )}
        </div>
    ) : (
        // Passive outline row. De-emphasis is COLOUR ONLY (muted title); never
        // re-introduce opacity here (see the rowClasses comment).
        <div className="flex-1 min-w-0">
            {firstLine(
                <span className="flex-1 min-w-0 break-words text-base leading-6 text-muted-foreground">{title}</span>,
            )}
            {below(outlineDetail)}
        </div>
    )

    // Option B: dense white rows on the 1px hairline grid (no zebra), about
    // 38px drawn; interactive rows keep a 44px hit area (min-h-11). The
    // current position is a tinted row with an inset ring; `data-current`
    // carries it for tests.
    const rowClasses = cn(
        "flex items-center ps-1 pe-4 py-2.5 border-b border-rule transition-colors",
        // A strong keyboard focus mark, readable at arm's length (WCAG 2.4.7):
        // an outline, so it never fights the current-position ring.
        "outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-3",
        isCurrentPosition ? "bg-accent ring-2 ring-inset ring-brand" : "bg-card",
        // Live reorder: a just-moved row. Colour only (no size change).
        highlighted && "bg-brand/15",
        // Passive non-song labels are de-emphasized via the muted *title color*
        // (songContent's text-muted-foreground span), NOT row opacity. opacity-60
        // composited the muted text below WCAG AA on the light theme (axe color-
        // contrast, 3.59:1). An openable prayer/reading still reads full-prominence.
    )

    // Non-interactive rows
    if (!isInteractive) {
        return (
            <div className={cn(rowClasses, "cursor-default")} data-current={isCurrentPosition || undefined} data-moved={highlighted || undefined}>
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
            data-moved={highlighted || undefined}
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
                    <p data-testid="tonight-note" className="ps-8 text-xs font-semibold text-warning-line truncate">
                        {t("performSetlist.row.tonightPlanned", { plannedTitle: displayChartTitle(track.tonight.plannedTitle) })}
                    </p>
                </div>
            ) : (
                songContent
            )}
        </div>
    )

    if (!onSwapTap && !swapColumn) return rowEl
    if (!onSwapTap) {
        // The Swap column, empty on this row, so the columns stay put.
        return (
            <div className="flex items-stretch bg-card">
                <div className="flex-1 min-w-0">{rowEl}</div>
                <span aria-hidden="true" className="shrink-0 w-11 sm:w-14 border-s border-b border-rule" />
            </div>
        )
    }
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
                className="shrink-0 w-11 sm:w-14 min-h-11 flex flex-col items-center justify-center gap-0 text-[11px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent border-s border-b border-rule cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [touch-action:manipulation]"
            >
                <Replace className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("performSetlist.row.swap")}</span>
            </button>
        </div>
    )
}
