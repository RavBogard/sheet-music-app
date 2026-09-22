"use client"

/**
 * Swap for tonight (David's ask 4, 2026-09-22) — band leader / admin only.
 *
 * Tap Swap on a row, tap a chart: two taps. Every signed-in iPad on the
 * setlist follows within seconds (the overrides listener). The saved setlist
 * is NOT touched unless "Also save to setlist" is checked, which performs the
 * existing permanent swap instead.
 *
 * The sheet OFFERS; it never recommends. The plan is listed first, labelled
 * as the plan (picking it is undo). Then three sections — same liturgical
 * moment, same title, search — each alphabetical, with no badge, count or
 * order that could read as a suggestion.
 */

import { useEffect, useMemo, useState } from "react"
import { Loader2, X } from "lucide-react"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { ChartThumb } from "@/components/setlist/grid/ChartThumb"
import { useAuth } from "@/lib/auth-context"
import { useLibraryStore } from "@/lib/library-store"
import { useOrg } from "@/lib/org/org-context"
import { getMoment, momentIdForUnit } from "@/lib/books/moments"
import { swapTrackChart } from "@/lib/live-director"
import { collectionLabel, normalizeCollection } from "@/lib/songs/picker-scope"
import { candidateTitle, swapCandidates } from "@/lib/performance/swap-candidates"
import { commitTonightSwap, fetchMomentFileIds } from "@/lib/performance/tonight-client"
import type { WithTonight, WritePlan } from "@/lib/performance/tonight"
import { cn } from "@/lib/utils"
import type { DriveFile, SetlistTrack } from "@/types/models"

/** Read at tap time, inside the handler — never during render. */
const clickTime = () => Date.now()

export interface TonightSwapSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    setlistId: string
    /** The row as displayed now (tonight's swap laid over, if any). */
    track: WithTonight<SetlistTrack>
    /** The same row exactly as planned. */
    planned: SetlistTrack
    /** The service day (America/Chicago). */
    serviceDay: string
}

export function TonightSwapSheet({ open, onOpenChange, setlistId, track, planned, serviceDay }: TonightSwapSheetProps) {
    const { user } = useAuth()
    const org = useOrg()
    const allFiles = useLibraryStore((s) => s.allFiles)
    const [query, setQuery] = useState("")
    const [saveToSetlist, setSaveToSetlist] = useState(false)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [momentIds, setMomentIds] = useState<Set<string>>(() => new Set())

    // Each opening starts clean: no leftover search, never pre-checked.
    useEffect(() => {
        if (!open) return
        setQuery("")
        setSaveToSetlist(false)
        setBusy(false)
        setMessage(null)
    }, [open])

    const momentId = planned.momentId ?? momentIdForUnit(planned.liturgyRef?.unitId)
    useEffect(() => {
        if (!open || !momentId) {
            setMomentIds(new Set())
            return
        }
        let live = true
        const units = (getMoment(momentId)?.occurrences ?? []).map((o) => o.unitId)
        void fetchMomentFileIds(momentId, units).then((ids) => {
            if (live) setMomentIds(ids)
        })
        return () => {
            live = false
        }
    }, [open, momentId])

    const sections = useMemo(
        () =>
            swapCandidates({
                allFiles,
                plannedFileId: planned.fileId,
                plannedTitle: planned.title,
                momentFileIds: momentIds,
                query,
            }),
        [allFiles, planned.fileId, planned.title, momentIds, query],
    )

    const showingFileId = track.fileId ?? null
    const swapped = !!track.tonight

    const finish = (plan: WritePlan) => {
        if (plan.kind === "stale") {
            setMessage(
                `Another leader just changed this row to ${plan.currentTitle || "another chart"}. Pick again.`,
            )
            setBusy(false)
            return
        }
        onOpenChange(false)
    }

    const pick = async (choice: { fileId: string; title: string; file?: DriveFile }) => {
        if (!user || busy) return
        setBusy(true)
        setMessage(null)
        const at = clickTime()
        try {
            if (saveToSetlist && choice.file) {
                // Permanent: clear tonight's swap on this row first so it does
                // not sit over the new plan, then the existing plan edit.
                if (swapped) {
                    await commitTonightSwap(setlistId, {
                        rowId: track.id,
                        planned: { fileId: planned.fileId ?? null, title: planned.title },
                        expectedBeforeFileId: showingFileId,
                        choice: null,
                        by: user.uid,
                        at,
                        eventDay: serviceDay,
                    })
                }
                await swapTrackChart(track.id, choice.file)
                onOpenChange(false)
                return
            }
            const plan = await commitTonightSwap(setlistId, {
                rowId: track.id,
                planned: { fileId: planned.fileId ?? null, title: planned.title },
                expectedBeforeFileId: showingFileId,
                choice: choice.fileId === planned.fileId
                    ? null
                    : {
                          fileId: choice.fileId,
                          songId: choice.fileId,
                          title: choice.title,
                          key: choice.file?.metadata?.key ?? null,
                          mimeType: choice.file?.mimeType ?? null,
                      },
                by: user.uid,
                at,
                eventDay: serviceDay,
            })
            finish(plan)
        } catch {
            setMessage("Couldn't swap — check the connection and try again. The plan is still showing.")
            setBusy(false)
        }
    }

    const row = (f: DriveFile, section: string) => (
        <CandidateRow
            key={`${section}-${f.id}`}
            fileId={f.id}
            title={candidateTitle(f)}
            detail={[collectionLabel(org, normalizeCollection(f.collection)), f.metadata?.key].filter(Boolean).join(" · ")}
            mimeType={f.mimeType}
            showing={f.id === showingFileId}
            disabled={busy}
            onPick={() => pick({ fileId: f.id, title: candidateTitle(f), file: f })}
        />
    )

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                data-testid="tonight-swap-sheet"
                className="h-[85vh] bg-background border-t border-border p-0 flex flex-col sm:max-w-2xl sm:mx-auto sm:rounded-t-2xl sm:shadow-2xl sm:border-x"
            >
                <SheetHeader className="p-4 border-b border-border bg-muted/40 sm:rounded-t-2xl">
                    <SheetTitle className="text-left text-base font-semibold truncate">Swap for tonight</SheetTitle>
                    <p className="text-xs text-muted-foreground truncate text-left">{planned.title}</p>
                </SheetHeader>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {message && (
                        <p role="alert" className="mx-4 mt-3 text-sm text-destructive">
                            {message}
                        </p>
                    )}

                    <Section label="Planned">
                        {planned.fileId ? (
                            <CandidateRow
                                fileId={planned.fileId}
                                title={planned.title}
                                detail={swapped ? "Back to the plan" : "The plan"}
                                mimeType={planned.mimeType}
                                showing={!swapped}
                                disabled={busy}
                                testId="tonight-swap-planned"
                                onPick={() => pick({ fileId: planned.fileId!, title: planned.title })}
                            />
                        ) : (
                            <p className="px-4 py-2 text-sm text-muted-foreground">No chart in the plan.</p>
                        )}
                    </Section>

                    {sections.moment.length > 0 && (
                        <Section label="Same moment">{sections.moment.map((f) => row(f, "moment"))}</Section>
                    )}
                    {sections.stem.length > 0 && (
                        <Section label="Same title">{sections.stem.map((f) => row(f, "stem"))}</Section>
                    )}

                    <Section label="Search">
                        <div className="relative px-4 pb-2">
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search this site's library…"
                                aria-label="Search this site's library"
                                className="h-11 text-base pr-10 [touch-action:manipulation]"
                            />
                            {query && (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => setQuery("")}
                                    className="absolute right-5 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        {query.trim() && sections.search.length === 0 && (
                            <p className="px-4 py-2 text-sm text-muted-foreground">
                                {allFiles.length === 0 ? "The library is still loading." : "No charts match."}
                            </p>
                        )}
                        {sections.search.map((f) => row(f, "search"))}
                    </Section>
                </div>

                <label className="flex items-center gap-3 px-4 py-3 border-t border-border min-h-14 text-sm [touch-action:manipulation]">
                    <input
                        type="checkbox"
                        data-testid="tonight-swap-save"
                        checked={saveToSetlist}
                        onChange={(e) => setSaveToSetlist(e.target.checked)}
                        className="h-5 w-5"
                    />
                    <span>
                        Also save to setlist
                        <span className="block text-xs text-muted-foreground">
                            Off: tonight only; the saved setlist stays as planned.
                        </span>
                    </span>
                    {busy && <Loader2 className="ml-auto h-4 w-4 animate-spin" aria-hidden="true" />}
                </label>
            </SheetContent>
        </Sheet>
    )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <section className="pt-3" aria-label={label}>
            <h3 className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</h3>
            <ul>{children}</ul>
        </section>
    )
}

function CandidateRow({
    fileId,
    title,
    detail,
    mimeType,
    showing,
    disabled,
    onPick,
    testId,
}: {
    fileId: string
    title: string
    detail?: string
    mimeType?: string
    showing: boolean
    disabled: boolean
    onPick: () => void
    testId?: string
}) {
    return (
        <li className="flex items-center gap-3 px-4 border-b border-border/40 min-h-14">
            <ChartThumb fileId={fileId} title={title} mimeType={mimeType} />
            <button
                type="button"
                data-testid={testId ?? "tonight-swap-candidate"}
                data-file-id={fileId}
                disabled={disabled || showing}
                aria-label={showing ? `${title}, showing now` : `Swap to ${title}`}
                onClick={onPick}
                className={cn(
                    "flex-1 min-w-0 min-h-14 py-2 text-left [touch-action:manipulation]",
                    "disabled:opacity-60 disabled:pointer-events-none",
                )}
            >
                <span className="block text-sm font-semibold truncate">{title}</span>
                <span className="block text-[11px] text-muted-foreground truncate">
                    {showing ? "Showing now" : detail}
                </span>
            </button>
        </li>
    )
}
