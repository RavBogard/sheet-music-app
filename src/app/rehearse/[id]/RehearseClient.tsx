"use client"

import { ArrowLeft, FileMusic, Music } from "lucide-react"
import Link from "next/link"

import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { PAGE_WIDTH_CLASS } from "@/components/layout/Page"
import {
    KEY_COLUMN_CLASS,
    KEY_TAG_CLASS,
    PAGE_CALL_CLASS,
    ROW_BELOW_CLASS,
    ROW_BPM_CLASS,
    ROW_NOTES_CLASS,
    ROW_NUMBER_CLASS,
    ROW_TITLE_CLASS,
    SECTION_LABEL_ROW_CLASS,
    SECTION_LABEL_TITLE_CLASS,
    SETLIST_LIST_CLASS,
    SETLIST_ROW_CLASS,
} from "@/components/performance/row-grammar"
import { RecordingPlayer } from "@/components/recordings/RecordingPlayer"
import { SECTION_BAND_CLASS, SECTION_LABEL_META_CLASS } from "@/components/setlist/grid/section-bands"
import { SetlistModeSwitch } from "@/components/setlist/SetlistModeSwitch"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

import type { RehearseRow, RehearseSongRow } from "./rows"

export interface RehearseClientProps {
    setlistId: string
    /** False when the tenant has Perform off: the chart pages 404, so no Chart button. */
    chartsEnabled?: boolean
    name: string
    /** ISO date string, or null. */
    eventDate: string | null
    rows: RehearseRow[]
}

/**
 * The Rehearse page body, drawn in Perform's grammar: the same head row,
 * section labels, numbered rows with key tag and page call, plus each song's
 * recording and a Chart button.
 */
export function RehearseClient({ setlistId, chartsEnabled = true, name, eventDate, rows }: RehearseClientProps) {
    const t = useT()
    const fmt = useFormat()
    const { user } = useAuth()
    const date = eventDate ? fmt.date(eventDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : ""
    const songs = rows.filter((r): r is RehearseSongRow => r.kind === "song")
    const recorded = songs.filter((s) => s.take).length
    // Same back target as Perform: the setlists list for a signed-in member, the public listing otherwise.
    const backHref = user ? "/setlists" : "/perform"
    // Display numbers count the songs 1, 2, 3 in the author's order; headings get none.
    const positions = new Map(songs.map((s, i) => [s.id, i + 1]))
    return (
        <main id="main-content" className="flex min-h-[calc(100dvh-5rem)] flex-col bg-background pt-14 text-foreground">
            <header className="relative z-20 border-b border-rule bg-background">
                <div className={cn(PAGE_WIDTH_CLASS, "flex items-center gap-x-2 py-1 sm:gap-x-3")}>
                    <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                        <Link
                            href={backHref}
                            data-testid="rehearse-list-back"
                            aria-label={user ? t("performSetlist.backToSetlistsLabel") : t("performSetlist.backToHomeLabel")}
                            className="-ms-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors"
                        >
                            <DirectionalIcon icon={ArrowLeft} className="h-5 w-5 text-foreground" />
                        </Link>
                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-base font-extrabold leading-tight" title={name}>
                                {name}
                            </h1>
                            <p data-testid="rehearse-status-line" className="tnum truncate text-xs font-medium text-muted-foreground">
                                <span>{t("performSetlist.songCount", { count: songs.length })}</span>
                                {songs.length > 0 ? (
                                    <>
                                        <span aria-hidden="true"> · </span>
                                        <span>{t("recordings.recordedCount", { count: recorded })}</span>
                                    </>
                                ) : null}
                                {date ? (
                                    <>
                                        <span aria-hidden="true"> · </span>
                                        <span>{date}</span>
                                    </>
                                ) : null}
                            </p>
                        </div>
                    </div>
                    <SetlistModeSwitch setlistId={setlistId} current="rehearse" eventDate={eventDate} />
                </div>
            </header>
            {songs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Music aria-hidden className="mb-3 h-12 w-12 opacity-30" />
                    <p className="text-lg font-medium">{t("recordings.listenEmpty")}</p>
                </div>
            ) : (
                <div className={cn(PAGE_WIDTH_CLASS, "flex flex-col pb-24 pt-3 max-sm:px-0")}>
                    <div data-testid="rehearse-list" className={SETLIST_LIST_CLASS}>
                        {rows.map((row) => {
                            if (row.kind === "section") {
                                const { folioFrom, folioTo } = row.band
                                const pages =
                                    folioFrom === undefined || folioTo === undefined
                                        ? null
                                        : folioFrom === folioTo
                                          ? t("setlistGrid.sectionPage", { page: folioFrom })
                                          : t("setlistGrid.sectionPages", { from: folioFrom, to: folioTo })
                                return (
                                    <h2
                                        key={row.id}
                                        data-testid="rehearse-section"
                                        data-section-hue={row.band.hue}
                                        className={cn(SECTION_LABEL_ROW_CLASS, SECTION_BAND_CLASS[row.band.hue])}
                                    >
                                        <span className={SECTION_LABEL_TITLE_CLASS}>{row.title}</span>
                                        {pages ? <span className={SECTION_LABEL_META_CLASS}>{pages}</span> : null}
                                    </h2>
                                )
                            }
                            return (
                                <RehearseSongRowView
                                    key={row.id}
                                    row={row}
                                    position={positions.get(row.id) ?? 0}
                                    chartHref={row.fileId && chartsEnabled ? `/rehearse/${setlistId}/track/${row.id}` : null}
                                />
                            )
                        })}
                    </div>
                </div>
            )}
        </main>
    )
}

/** One song: Perform's first line (number, title and BPM, key tag, page call), then notes, the take and Chart. */
function RehearseSongRowView({ row, position, chartHref }: { row: RehearseSongRow; position: number; chartHref: string | null }) {
    const t = useT()
    return (
        <section
            data-testid="rehearse-song"
            data-no-take={row.take ? undefined : ""}
            aria-label={row.title}
            className={cn(SETLIST_ROW_CLASS, "bg-card")}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span aria-hidden="true" className={ROW_NUMBER_CLASS}>
                        {position}
                    </span>
                    <h3 className={ROW_TITLE_CLASS}>
                        <span>{row.title}</span>
                        {row.bpm ? (
                            <span data-testid="rehearse-bpm" className={ROW_BPM_CLASS}>
                                {t("performSetlist.row.bpm", { bpm: row.bpm })}
                            </span>
                        ) : null}
                    </h3>
                    <span className={KEY_COLUMN_CLASS}>
                        {row.key ? (
                            <span data-testid="rehearse-key-tag" className={KEY_TAG_CLASS}>
                                {row.key}
                            </span>
                        ) : null}
                    </span>
                    {row.folio !== null ? (
                        <span data-testid="rehearse-folio" className={PAGE_CALL_CLASS}>
                            <span className="sr-only">{t("performSetlist.row.folio", { page: row.folio })}</span>
                            <span aria-hidden="true">{row.folio}</span>
                        </span>
                    ) : (
                        <span aria-hidden="true" className="w-11 shrink-0" />
                    )}
                </div>
                <div className={ROW_BELOW_CLASS}>
                    {row.notes ? (
                        <p data-testid="rehearse-notes" className={cn(ROW_NOTES_CLASS, "whitespace-pre-wrap")}>
                            {row.notes}
                        </p>
                    ) : null}
                    <div className="mt-1 flex items-center gap-3">
                        {row.take ? (
                            <div className="min-w-0 flex-1 sm:max-w-md">
                                <p data-testid="rehearse-take" className="truncate text-xs text-muted-foreground">
                                    {row.take.title}
                                </p>
                                <RecordingPlayer recordingId={row.take.id} title={row.take.title} compact />
                            </div>
                        ) : (
                            <p className="flex h-11 min-w-0 flex-1 items-center text-xs text-muted-foreground sm:max-w-md">
                                {t("recordings.noRecordingYet")}
                            </p>
                        )}
                        {chartHref ? (
                            <Link
                                href={chartHref}
                                data-testid="rehearse-chart-link"
                                aria-label={`${t("recordings.chart")}: ${row.title}`}
                                className="touch-hit inline-flex h-11 shrink-0 items-center gap-1.5 self-end rounded-md border border-input bg-card px-3.5 text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors"
                            >
                                <FileMusic aria-hidden className="h-4 w-4 text-brand" />
                                {t("recordings.chart")}
                            </Link>
                        ) : null}
                    </div>
                </div>
            </div>
        </section>
    )
}
