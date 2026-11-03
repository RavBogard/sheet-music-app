"use client"

import Link from "next/link"

import { PAGE_WIDTH_CLASS } from "@/components/layout/Page"
import { RecordingPlayer } from "@/components/recordings/RecordingPlayer"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { cn } from "@/lib/utils"

import type { RehearseRow } from "./rows"

export interface RehearseClientProps {
    setlistId: string
    name: string
    /** ISO date string, or null. */
    eventDate: string | null
    rows: RehearseRow[]
}

/** The Rehearse page body: the setlist's name and date, then each song with its key, notes, take and chart. */
export function RehearseClient({ setlistId, name, eventDate, rows }: RehearseClientProps) {
    const t = useT()
    const fmt = useFormat()
    const date = eventDate ? fmt.date(eventDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""
    const hasSongs = rows.some((r) => r.kind === "song")
    return (
        <main id="main-content" className={cn(PAGE_WIDTH_CLASS, "pt-4 pb-12")}>
            <header className="border-b border-rule pb-3">
                <h1 className="text-base font-extrabold leading-tight text-foreground">{name}</h1>
                <p className="tnum text-xs font-medium text-muted-foreground">
                    {date ? `${date} · ` : ""}
                    {t("recordings.rehearseIntro")}
                </p>
            </header>
            {!hasSongs ? (
                <p className="py-6 text-sm text-muted-foreground">{t("recordings.listenEmpty")}</p>
            ) : (
                <div>
                    {rows.map((row) => {
                        if (row.kind === "section") {
                            return (
                                <h2
                                    key={row.id}
                                    className="border-b border-rule pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                                >
                                    {row.title}
                                </h2>
                            )
                        }
                        const meta = [row.key, row.bpm ? `${row.bpm} BPM` : null].filter(Boolean).join(" · ")
                        return (
                            <section
                                key={row.id}
                                data-testid="rehearse-song"
                                data-no-take={row.take ? undefined : ""}
                                className="flex flex-col gap-1 border-b border-rule py-2 sm:flex-row sm:items-start sm:gap-4"
                            >
                                <div className="min-w-0 flex-1">
                                    <h3
                                        className={cn(
                                            "text-[0.95rem] leading-snug",
                                            row.take ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                                        )}
                                    >
                                        {row.title}
                                        {meta ? (
                                            <span
                                                data-testid="rehearse-meta"
                                                className="tnum ms-2 text-xs font-semibold text-muted-foreground"
                                            >
                                                {meta}
                                            </span>
                                        ) : null}
                                    </h3>
                                    {row.notes ? (
                                        <p
                                            data-testid="rehearse-notes"
                                            className="whitespace-pre-wrap break-words text-xs leading-snug text-muted-foreground"
                                        >
                                            {row.notes}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-3 sm:shrink-0">
                                    {row.take ? (
                                        <RecordingPlayer
                                            recordingId={row.take.id}
                                            title={row.take.title}
                                            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
                                        />
                                    ) : (
                                        <p className="min-w-0 flex-1 text-xs text-muted-foreground sm:w-72 sm:flex-none">
                                            {t("recordings.noRecordingYet")}
                                        </p>
                                    )}
                                    {row.fileId ? (
                                        <Link
                                            href={`/rehearse/${setlistId}/track/${row.id}`}
                                            data-testid="rehearse-chart-link"
                                            aria-label={`${t("recordings.chart")}: ${row.title}`}
                                            className="touch-hit inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-brand/50 px-3.5 text-sm font-semibold text-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors"
                                        >
                                            {t("recordings.chart")}
                                        </Link>
                                    ) : null}
                                </div>
                            </section>
                        )
                    })}
                </div>
            )}
        </main>
    )
}
