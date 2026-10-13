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
import { useSharedCollections } from "@/hooks/use-shared-collections"
import { SHARED_COPY } from "@/lib/library/shared-collections"
import { useLibraryStore } from "@/lib/library-store"
import { useOrg } from "@/lib/org/org-context"
import { getMoment, momentIdForUnit } from "@/lib/books/moments"
import { swapTrackChart } from "@/lib/live-director"
import { collectionLabel, normalizeCollection } from "@/lib/songs/picker-scope"
import { candidateTitle, swapCandidates } from "@/lib/performance/swap-candidates"
import { commitTonightSwap, fetchMomentFileIds } from "@/lib/performance/tonight-client"
import type { WithTonight, WritePlan } from "@/lib/performance/tonight"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"
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
    /** The service day (the tenant's time zone). */
    serviceDay: string
}

export function TonightSwapSheet({ open, onOpenChange, setlistId, track, planned, serviceDay }: TonightSwapSheetProps) {
    const t = useT()
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

    // Phase 5: collections other tenants share — opt-in chips, off until
    // switched on, remembered per user. Their rows come after the site's own
    // in every section, labelled with the owner.
    const shared = useSharedCollections()
    const sharedSections = useMemo(
        () =>
            shared.chipRows.length === 0
                ? null
                : swapCandidates({
                      allFiles: shared.chipRows,
                      plannedFileId: planned.fileId,
                      plannedTitle: planned.title,
                      momentFileIds: momentIds,
                      query,
                  }),
        [shared.chipRows, planned.fileId, planned.title, momentIds, query],
    )

    const showingFileId = track.fileId ?? null
    const swapped = !!track.tonight

    const finish = (plan: WritePlan) => {
        if (plan.kind === "stale") {
            setMessage(
                t("perform.tonight.staleChanged", {
                    chartTitle: plan.currentTitle || t("perform.tonight.anotherChart"),
                }),
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
            setMessage(t("perform.tonight.swapFailed"))
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

    const sharedRow = (f: DriveFile, section: string) => (
        <CandidateRow
            key={`${section}-shared-${f.id}`}
            fileId={f.id}
            title={candidateTitle(f)}
            detail={[SHARED_COPY.fromOwner(shared.owner(f.orgId ?? "")), f.metadata?.key].filter(Boolean).join(" · ")}
            sharedFrom={f.orgId}
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
                    <SheetTitle className="text-start text-base font-semibold truncate">{t("perform.tonight.title")}</SheetTitle>
                    <p className="text-xs text-muted-foreground truncate text-start">{planned.title}</p>
                </SheetHeader>

                <div className="flex-1 min-h-0 overflow-y-auto">
                    {message && (
                        <p role="alert" className="mx-4 mt-3 text-sm text-destructive">
                            {message}
                        </p>
                    )}

                    <Section label={t("perform.tonight.planned")}>
                        {planned.fileId ? (
                            <CandidateRow
                                fileId={planned.fileId}
                                title={planned.title}
                                detail={swapped ? t("perform.tonight.backToPlan") : t("perform.tonight.thePlan")}
                                mimeType={planned.mimeType}
                                showing={!swapped}
                                disabled={busy}
                                testId="tonight-swap-planned"
                                onPick={() => pick({ fileId: planned.fileId!, title: planned.title })}
                            />
                        ) : (
                            <p className="px-4 py-2 text-sm text-muted-foreground">{t("perform.tonight.noChartInPlan")}</p>
                        )}
                    </Section>

                    {sections.moment.length + (sharedSections?.moment.length ?? 0) > 0 && (
                        <Section label={t("perform.tonight.sameMoment")}>
                            {sections.moment.map((f) => row(f, "moment"))}
                            {sharedSections?.moment.map((f) => sharedRow(f, "moment"))}
                        </Section>
                    )}
                    {sections.stem.length + (sharedSections?.stem.length ?? 0) > 0 && (
                        <Section label={t("perform.tonight.sameTitle")}>
                            {sections.stem.map((f) => row(f, "stem"))}
                            {sharedSections?.stem.map((f) => sharedRow(f, "stem"))}
                        </Section>
                    )}

                    <Section label={t("perform.tonight.search")}>
                        <div className="relative px-4 pb-2">
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t("perform.tonight.searchPlaceholder")}
                                aria-label={t("perform.tonight.searchAria")}
                                className="h-11 text-base pe-10 [touch-action:manipulation]"
                            />
                            {query && (
                                <button
                                    type="button"
                                    aria-label={t("perform.tonight.clearSearch")}
                                    onClick={() => setQuery("")}
                                    className="absolute end-5 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        {shared.chips.length > 0 && (
                            <div
                                role="group"
                                aria-label={SHARED_COPY.chipGroupLabel}
                                className="flex flex-wrap items-center gap-2 px-4 pb-2"
                            >
                                {shared.chips.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        aria-pressed={c.on}
                                        aria-label={SHARED_COPY.chipAria(c.label, c.owner)}
                                        data-testid="swap-shared-chip"
                                        data-shared-collection={c.id}
                                        onClick={() => shared.toggle(c.id)}
                                        className="min-h-11 rounded-full border border-dashed border-border px-4 text-sm text-muted-foreground [touch-action:manipulation] aria-pressed:border-solid aria-pressed:border-brand/30 aria-pressed:bg-brand/15 aria-pressed:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                    >
                                        {c.label}
                                        <span className="ms-1.5 text-xs text-muted-foreground">{SHARED_COPY.fromOwner(c.owner)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {query.trim() && sections.search.length + (sharedSections?.search.length ?? 0) === 0 && (
                            <p className="px-4 py-2 text-sm text-muted-foreground">
                                {allFiles.length === 0 ? t("perform.tonight.libraryLoading") : t("perform.tonight.noMatches")}
                            </p>
                        )}
                        {sections.search.map((f) => row(f, "search"))}
                        {sharedSections?.search.map((f) => sharedRow(f, "search"))}
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
                        {t("perform.tonight.alsoSave")}
                        <span className="block text-xs text-muted-foreground">
                            {t("perform.tonight.alsoSaveHint")}
                        </span>
                    </span>
                    {busy && <Loader2 className="ms-auto h-4 w-4 animate-spin" aria-hidden="true" />}
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
    sharedFrom,
}: {
    fileId: string
    title: string
    detail?: string
    mimeType?: string
    showing: boolean
    disabled: boolean
    onPick: () => void
    testId?: string
    /** Owner tenant of a shared chart (data hook for tests and probes). */
    sharedFrom?: string
}) {
    const t = useT()
    return (
        <li className="flex items-center gap-3 px-4 border-b border-border/40 min-h-14">
            <ChartThumb fileId={fileId} title={title} mimeType={mimeType} />
            <button
                type="button"
                data-testid={testId ?? "tonight-swap-candidate"}
                data-file-id={fileId}
                data-shared-from={sharedFrom}
                disabled={disabled || showing}
                aria-label={showing ? t("perform.tonight.showingNowAria", { songName: title }) : t("perform.tonight.swapToAria", { songName: title })}
                onClick={onPick}
                className={cn(
                    "flex-1 min-w-0 min-h-14 py-2 text-start [touch-action:manipulation]",
                    "disabled:opacity-60 disabled:pointer-events-none",
                )}
            >
                <span className="block text-sm font-semibold truncate">{title}</span>
                <span className="block text-[11px] text-muted-foreground truncate">
                    {showing ? t("perform.tonight.showingNow") : detail}
                </span>
            </button>
        </li>
    )
}
