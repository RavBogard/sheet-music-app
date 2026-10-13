"use client"

import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Pencil, CheckCircle2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { saveVerification } from "@/lib/chord-cache"
import { useT } from "@/i18n/client"

/**
 * Floating bottom bar shown when editing chords.
 * Rendered by the performance layout, not the popover.
 */
export function ChordEditBar() {
    const { isEditingChords, setEditingChords, pendingEditCount, resetPendingEdits, playbackQueue, queueIndex, fileUrl } = useMusicStore()
    const { user } = useAuth()
    const t = useT()

    if (!isEditingChords) return null

    // Resolve file ID for verification save
    const fileId = (() => {
        if (queueIndex >= 0 && playbackQueue[queueIndex]?.fileId) {
            return playbackQueue[queueIndex].fileId
        }
        if (fileUrl && typeof fileUrl === "string") {
            const match = fileUrl.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            if (match) return match[1]
        }
        return null
    })()

    const handleVerifyAndDone = () => {
        if (fileId) {
            const verifierName = user?.displayName || user?.email || 'Unknown'
            saveVerification(fileId, verifierName)
        }
        setEditingChords(false)
        resetPendingEdits()
    }

    const handleCancel = () => {
        setEditingChords(false)
        resetPendingEdits()
    }

    return (
        <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-safe">
            <div className="flex items-center justify-between bg-muted border border-violet-500/30 rounded-t-xl px-4 py-3 shadow-lg shadow-violet-500/10">
                <div className="flex items-center gap-2 text-violet-300 text-sm font-medium">
                    <Pencil className="h-4 w-4" />
                    {t("music.chordEdit.editingChords")}
                    {pendingEditCount > 0 && (
                        <span className="bg-violet-600/20 text-violet-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-violet-500/30">
                            {t("music.chordEdit.editCount", { count: pendingEditCount })}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground/60 text-[10px] hidden sm:block me-1">
                        {t("music.chordEdit.hint")}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancel}
                        className="text-muted-foreground hover:text-foreground h-8 text-xs"
                    >
                        {t("music.chordEdit.cancel")}
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleVerifyAndDone}
                        className="bg-violet-600 hover:bg-violet-500 text-foreground h-8 text-xs"
                    >
                        <CheckCircle2 className="h-3.5 w-3.5 me-1" />
                        {t("music.chordEdit.verifyDone")}
                    </Button>
                </div>
            </div>
        </div>
    )
}
