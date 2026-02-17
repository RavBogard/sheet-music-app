"use client"

import { useState, useEffect } from "react"
import { getSetlistHistory, AuditEntry, AuditAction } from "@/lib/setlist-audit"
import { History, RotateCcw, Plus, Minus, ArrowUpDown, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SetlistTrack } from "@/types/models"
import { toDate } from "@/lib/firestore-helpers"

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
    created: 'Created',
    tracks_updated: 'Tracks updated',
    renamed: 'Renamed',
    made_public: 'Made public',
    made_private: 'Made private',
    published: 'Published & notified',
    deleted: 'Deleted',
    tracks_reordered: 'Reordered',
    track_added: 'Track added',
    track_removed: 'Track removed',
}

interface Props {
    setlistId: string
    onRestore: (tracks: SetlistTrack[]) => void
    onClose: () => void
}

export function SetlistHistoryPanel({ setlistId, onRestore, onClose }: Props) {
    const [entries, setEntries] = useState<AuditEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [restoring, setRestoring] = useState<number | null>(null)

    useEffect(() => {
        getSetlistHistory(setlistId, 30).then(setEntries).finally(() => setLoading(false))
    }, [setlistId])

    const handleRestore = (index: number, snapshot: TrackSnapshot[]) => {
        if (!confirm('Restore setlist to this version? This will replace the current track list.')) return

        setRestoring(index)
        // Convert snapshot back to SetlistTrack format
        const tracks: SetlistTrack[] = snapshot.map((t, i) => ({
            id: `restored-${i}-${Date.now()}`,
            title: t.title,
            fileId: t.fileId,
            type: (t.type as 'header' | 'song') || 'song',
            key: t.key,
        }))
        onRestore(tracks)
        setRestoring(null)
    }

    return (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <History className="w-4 h-4 text-violet-500" />
                    Version History
                </div>
                <button onClick={onClose} className="p-1 hover:bg-accent rounded">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Loading history...
                    </div>
                ) : entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-6 text-center">
                        No history entries yet.
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
                                                {actionLabels[entry.action] || entry.action}
                                            </span>
                                            <span className="text-muted-foreground ml-2">
                                                by {entry.userName}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {ts ? ts.toLocaleString('en-US', {
                                                    month: 'short', day: 'numeric',
                                                    hour: 'numeric', minute: '2-digit',
                                                }) : ''}
                                            </span>
                                            {entry.trackSnapshot && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => handleRestore(idx, entry.trackSnapshot!)}
                                                    disabled={restoring !== null}
                                                >
                                                    {restoring === idx ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <RotateCcw className="w-3 h-3 mr-1" />
                                                    )}
                                                    Restore
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Diff details */}
                                    {diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.reordered) && (
                                        <div className="mt-1.5 space-y-0.5 text-xs">
                                            {diff.added.map((t, i) => (
                                                <div key={`a-${i}`} className="flex items-center gap-1 text-green-500">
                                                    <Plus className="w-3 h-3" />
                                                    {t.title}
                                                </div>
                                            ))}
                                            {diff.removed.map((t, i) => (
                                                <div key={`r-${i}`} className="flex items-center gap-1 text-red-500">
                                                    <Minus className="w-3 h-3" />
                                                    {t.title}
                                                </div>
                                            ))}
                                            {diff.reordered && (
                                                <div className="flex items-center gap-1 text-amber-500">
                                                    <ArrowUpDown className="w-3 h-3" />
                                                    Tracks reordered
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Rename details */}
                                    {typeof entry.details?.newName === 'string' && (
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            → &quot;{entry.details.newName}&quot;
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
