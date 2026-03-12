"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { SetlistTrack } from "@/types/models"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface SetlistDrawerProps {
    open: boolean
    tracks: SetlistTrack[]
    currentIndex: number
    onSelect: (index: number) => void
    onClose: () => void
}

/**
 * Slide-up setlist drawer for the performance PDF overlay.
 *
 * Shows a compact version of the setlist: song titles with key badges,
 * non-song items dimmed. Tapping a song calls onSelect (which switches
 * the PDF in place) and closes the drawer. Non-song items without
 * a fileId are visible but not tappable.
 *
 * Uses Radix Dialog for slide-up animation, backdrop, and focus trap.
 */
export function SetlistDrawer({
    open,
    tracks,
    currentIndex,
    onSelect,
    onClose,
}: SetlistDrawerProps) {
    return (
        <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 z-drawer data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
                <Dialog.Content
                    className="fixed bottom-0 left-0 right-0 z-popover max-h-[calc(100vh-120px)] bg-zinc-900 rounded-t-2xl border-t border-white/10 flex flex-col data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom"
                    aria-describedby={undefined}
                >
                    {/* Drag handle visual */}
                    <div className="flex items-center justify-center pt-3 pb-1">
                        <div className="w-10 h-1 rounded-full bg-zinc-600" />
                    </div>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 pb-2">
                        <Dialog.Title className="text-sm font-semibold text-zinc-300">
                            Setlist
                        </Dialog.Title>
                        <Dialog.Close asChild>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-lg hover:bg-white/10"
                                aria-label="Close drawer"
                            >
                                <X className="h-4 w-4 text-zinc-400" />
                            </Button>
                        </Dialog.Close>
                    </div>

                    {/* Track list */}
                    <div className="overflow-y-auto flex-1 pb-4">
                        {(() => {
                            let songIndex = 0
                            return tracks.map((track, index) => {
                                const isSong = !track.type || track.type === "song"
                                const isHeader = track.type === "header"
                                const hasFile = isSong && !!track.fileId
                                const isCurrent = index === currentIndex
                                const currentSongIndex = isSong ? songIndex++ : -1

                                // Header items render as inline dividers
                                if (isHeader) {
                                    return (
                                        <div
                                            key={track.id || `drawer-${index}`}
                                            className="flex items-center gap-3 px-4 py-1 my-0.5"
                                        >
                                            <div className="h-px flex-1 bg-brand/10" />
                                            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">
                                                {track.title}
                                            </span>
                                            <div className="h-px flex-1 bg-brand/10" />
                                        </div>
                                    )
                                }

                                return (
                                    <Button
                                        variant="ghost"
                                        key={track.id || `drawer-${index}`}
                                        onClick={() => {
                                            if (hasFile) {
                                                onSelect(index)
                                            }
                                        }}
                                        disabled={!hasFile}
                                        className={cn(
                                            "w-full h-auto justify-start gap-2 px-4 py-2 rounded-none text-left",
                                            hasFile
                                                ? "hover:bg-white/5 cursor-pointer"
                                                : "cursor-default",
                                            isCurrent && "bg-brand/15 border-l-2 border-brand",
                                            !isCurrent && isSong && (currentSongIndex % 2 === 0 ? "bg-amber-500/[0.06]" : "bg-brand/8")
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "truncate shrink min-w-0 text-sm",
                                                isSong ? "font-medium text-zinc-200" : "text-zinc-400"
                                            )}
                                        >
                                            {track.title}
                                        </span>
                                        {isSong && track.key && (
                                            <span className="font-mono text-[10px] px-1 py-0.5 bg-brand/10 rounded text-brand shrink-0">
                                                {track.key}
                                            </span>
                                        )}
                                        {isSong && track.notes && (
                                            <span className="text-[10px] text-amber-400/60 truncate max-w-[120px] shrink">
                                                {track.notes}
                                            </span>
                                        )}
                                    </Button>
                                )
                            })
                        })()}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
