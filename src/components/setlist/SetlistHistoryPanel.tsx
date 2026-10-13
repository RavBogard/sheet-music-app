"use client"

import { useState, useEffect } from "react"
import { getSetlistHistory, AuditEntry, AuditAction } from "@/lib/setlist-audit"
import { History, RotateCcw, Plus, Minus, ArrowUpDown, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SetlistTrack } from "@/types/models"
import { toDate } from "@/lib/firestore-helpers"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"

interface TrackSnapshot {
    title: string
    fileId?: string
    key?: string
    type?: string
}

interface DiffResult {
    added: TrackSnapshot[]
    removed: TrackSnapshot[]
    reordered: boolean
}

function diffSnapshots(prev: TrackSnapshot[], curr: TrackSnapshot[]): DiffResult {
    const prevIds = new Set(prev.filter(t => t.fileId).map(t => t.fileId!))
    const currIds = new Set(curr.filter(t => t.fileId).map(t => t.fileId!))

    const added = curr.filter(t => t.fileId && !prevIds.has(t.fileId))
    const removed = prev.filter(t => t.fileId && !currIds.has(t.fileId))

    // Check reorder: same elements but different order
    const reordered = added.length === 0 && removed.length === 0 &&
        prev.some((t, i) => t.fileId !== curr[i]?.fileId)

    return { added, removed, reordered }
}

const actionLabels: Record<AuditAction, string> = {
    created: "setlist.historyActionCreated",
    tracks_updated: "setlist.historyActionTracksUpdated",
    updated: "setlist.historyActionUpdated",
    renamed: "setlist.historyActionRenamed",
    made_public: "setlist.historyActionMadePublic",
    made_private: "setlist.historyActionMadePrivate",
    published: "setlist.historyActionPublished",
    deleted: "setlist.historyActionDeleted",
    tracks_reordered: "setlist.historyActionReordered",
    track_added: "setlist.historyActionTrackAdded",
    track_removed: "setlist.historyActionTrackRemoved",
    cloned: "setlist.historyActionCloned",
    saved_as_template: "setlist.historyActionSavedAsTemplate",
    set_as_default: "setlist.historyActionSetAsDefault",
}

interface Props {
    setlistId: string
    onRestore: (tracks: SetlistTrack[]) => void
    onClose: () => void
}

export function SetlistHistoryPanel({ setlistId, onRestore, onClose }: Props) {
    const t = useT()
    const fmt = useFormat()
    const [entries, setEntries] = useState<AuditEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [restoring, setRestoring] = useState<number | null>(null)
    const [pendingRestore, setPendingRestore] = useState<{ idx: number; snapshot: TrackSnapshot[]; label: string } | null>(null)

    useEffect(() => {
        getSetlistHistory(setlistId, 30).then(setEntries).finally(() => setLoading(false))
    }, [setlistId])

    const openRestoreConfirm = (index: number, snapshot: TrackSnapshot[]) => {
        const entry = entries[index]
        const actionLabel = entry ? (actionLabels[entry.action] ? t(actionLabels[entry.action]) : entry.action) : t("setlist.historyThisVersion")
        const ts = entry ? toDate(entry.timestamp as unknown as Parameters<typeof toDate>[0]) : null
        const when = ts ? fmt.dateTime(ts, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
        const label = when ? t("setlist.historyRestoreLabel", { action: actionLabel, when }) : actionLabel
        setPendingRestore({ idx: index, snapshot, label })
    }

    const runRestore = () => {
        if (!pendingRestore) return
        const { idx, snapshot } = pendingRestore
        setRestoring(idx)
        // Convert snapshot back to SetlistTrack format
        const tracks: SetlistTrack[] = snapshot.map((s, i) => ({
            id: `restored-${i}-${Date.now()}`,
            title: s.title,
            fileId: s.fileId,
            type: (s.type as 'header' | 'song') || 'song',
            key: s.key,
        }))
        onRestore(tracks)
        setRestoring(null)
        setPendingRestore(null)
    }

    return (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <History className="w-4 h-4 text-violet-500" />
                    {t("setlist.historyTitle")}
                </div>
                <button onClick={onClose} className="p-1 hover:bg-accent rounded">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin me-2" />
                        {t("setlist.historyLoading")}
                    </div>
                ) : entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-6 text-center">
                        {t("setlist.historyEmpty")}
                    </p>
                ) : (
                    <div className="divide-y divide-border">
                        {entries.map((entry, idx) => {
                            const ts = toDate(entry.timestamp as unknown as Parameters<typeof toDate>[0])
                            const prevEntry = entries[idx + 1] // older entry
                            const diff = entry.trackSnapshot && prevEntry?.trackSnapshot
                                ? diffSnapshots(prevEntry.trackSnapshot, entry.trackSnapshot)
                                : null

                            return (
                                <div key={idx} className="px-4 py-3 text-sm">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="font-medium">
                                                {actionLabels[entry.action] ? t(actionLabels[entry.action]) : entry.action}
                                            </span>
                                            <span className="text-muted-foreground ms-2">
                                                {t("setlist.historyBy", { name: entry.userName })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {ts ? fmt.dateTime(ts, {
                                                    month: 'short', day: 'numeric',
                                                    hour: 'numeric', minute: '2-digit',
                                                }) : ''}
                                            </span>
                                            {entry.trackSnapshot && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => openRestoreConfirm(idx, entry.trackSnapshot!)}
                                                    disabled={restoring !== null}
                                                >
                                                    {restoring === idx ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <RotateCcw className="w-3 h-3 me-1" />
                                                    )}
                                                    {t("setlist.historyRestore")}
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Diff details */}
                                    {diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.reordered) && (
                                        <div className="mt-1.5 space-y-0.5 text-xs">
                                            {diff.added.map((s, i) => (
                                                <div key={`a-${i}`} className="flex items-center gap-1 text-green-500">
                                                    <Plus className="w-3 h-3" />
                                                    {s.title}
                                                </div>
                                            ))}
                                            {diff.removed.map((s, i) => (
                                                <div key={`r-${i}`} className="flex items-center gap-1 text-red-500">
                                                    <Minus className="w-3 h-3" />
                                                    {s.title}
                                                </div>
                                            ))}
                                            {diff.reordered && (
                                                <div className="flex items-center gap-1 text-amber-500">
                                                    <ArrowUpDown className="w-3 h-3" />
                                                    {t("setlist.historyTracksReordered")}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Rename details */}
                                    {typeof entry.details?.newName === 'string' && (
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {t("setlist.historyRenamedTo", { name: entry.details.newName })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <AlertDialog
                open={!!pendingRestore}
                onOpenChange={(next) => { if (!next) setPendingRestore(null) }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("setlist.historyRestoreConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("setlist.historyRestoreConfirmBody", { version: pendingRestore?.label ?? t("setlist.historyThisVersion") })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("setlist.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={runRestore}>{t("setlist.historyRestore")}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
