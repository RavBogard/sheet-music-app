"use client"

import { PAGE_WIDTH_CLASS } from "@/components/layout/Page"
import { RecordingPlayer } from "@/components/recordings/RecordingPlayer"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { cn } from "@/lib/utils"

import type { ListenRow } from "./rows"

export interface ListenClientProps {
    name: string
    /** ISO date string, or null. */
    eventDate: string | null
    rows: ListenRow[]
}

/** The Listen page body: the setlist's name and date, then each song with its one take. */
export function ListenClient({ name, eventDate, rows }: ListenClientProps) {
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
                    {t("recordings.listenIntro")}
                </p>
            </header>
            {!hasSongs ? (
                <p className="py-6 text-sm text-muted-foreground">{t("recordings.listenEmpty")}</p>
            ) : (
                <div>
                    {rows.map((row) =>
                        row.kind === "section" ? (
                            <h2
                                key={row.id}
                                className="border-b border-rule pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                            >
                                {row.title}
                            </h2>
                        ) : (
                            row.take ? (
                                <section
                                    key={row.id}
                                    data-testid="listen-song"
                                    className="flex flex-col gap-1 border-b border-rule py-2 sm:flex-row sm:items-center sm:gap-4"
                                >
                                    <h3 className="min-w-0 flex-1 text-[0.95rem] font-bold leading-snug text-foreground sm:truncate">
                                        {row.title}
                                    </h3>
                                    <RecordingPlayer
                                        recordingId={row.take.id}
                                        title={row.take.title}
                                        className="sm:w-80"
                                    />
                                </section>
                            ) : (
                                // One line: the title in muted ink (it truncates first),
                                // "No recording yet" as small muted text at the end.
                                <section
                                    key={row.id}
                                    data-testid="listen-song"
                                    data-no-take
                                    className="flex items-baseline gap-3 border-b border-rule py-2"
                                >
                                    <h3 className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold leading-snug text-muted-foreground">
                                        {row.title}
                                    </h3>
                                    <p className="shrink-0 text-xs text-muted-foreground">{t("recordings.noRecordingYet")}</p>
                                </section>
                            )
                        ),
                    )}
                </div>
            )}
        </main>
    )
}
