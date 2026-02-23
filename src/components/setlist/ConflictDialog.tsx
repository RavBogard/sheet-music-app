"use client"

import { AlertTriangle, GitMerge, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConflictInfo } from "@/lib/setlist-versioning"

/**
 * Dialog shown when a setlist save detects a version conflict.
 * Gives the user three choices: accept remote, keep local, or cancel.
 */
export function ConflictDialog({
    conflict,
    onAcceptRemote,
    onKeepLocal,
    onCancel,
}: {
    conflict: ConflictInfo
    onAcceptRemote: () => void
    onKeepLocal: () => void
    onCancel: () => void
}) {
    const timeStr = conflict.lastUpdatedAt
        ? conflict.lastUpdatedAt.toLocaleString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            month: 'short',
            day: 'numeric',
        })
        : 'recently'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="conflict-dialog-title" onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
            <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/15 rounded-full">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                        <h3 id="conflict-dialog-title" className="font-semibold text-foreground">Edit Conflict</h3>
                        <p className="text-sm text-muted-foreground">
                            {conflict.lastEditor} saved changes {timeStr}
                        </p>
                    </div>
                </div>

                {/* Summary */}
                <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm text-muted-foreground">
                    <p>
                        The setlist was modified while you were editing.
                        The remote version has{' '}
                        <span className="font-semibold text-foreground">
                            {conflict.remoteTracks.length} track{conflict.remoteTracks.length !== 1 ? 's' : ''}
                        </span>.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                    <Button
                        onClick={onAcceptRemote}
                        variant="outline"
                        className="w-full justify-start gap-2"
                    >
                        <ArrowRight className="w-4 h-4" />
                        Accept their changes
                    </Button>
                    <Button
                        onClick={onKeepLocal}
                        className="w-full justify-start gap-2 bg-amber-600 hover:bg-amber-500 text-white"
                    >
                        <GitMerge className="w-4 h-4" />
                        Keep my changes
                    </Button>
                    <Button
                        onClick={onCancel}
                        variant="ghost"
                        className="w-full text-muted-foreground"
                    >
                        Cancel (don&apos;t save)
                    </Button>
                </div>
            </div>
        </div>
    )
}
