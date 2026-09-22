'use client'

import { useState } from 'react'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ChartPickerList } from './ChartPickerList'

/**
 * v54-02-01 (Bug 3 fix, 2026-05-12): centered command dialog for binding a
 * chart to a track. Replaces the context-menu → anchored Popover handoff
 * that was failing silently on desktop (and required a `setTimeout(0)`
 * workaround on iPad). Two Radix overlays handing off focus + outside-
 * click detectors across a state-tick boundary is inherently fragile; a
 * single centered Dialog has no anchor dependency, opens on a single
 * `open` prop, and works identically across mouse + touch.
 *
 * This is the canonical pattern (Linear/Notion/Raycast/Arc) for typeable
 * secondary actions triggered from a context menu: never chain anchored
 * overlays — open a centered command dialog.
 *
 * The cmdk body (Recent + Library groups, fuzzy filter, currentSongId
 * highlight, page-1 thumbnails) is the shared ChartPickerList, so the
 * keyboarding / a11y story matches ChartBindPopover exactly.
 */

export interface ChartBindSelection {
    songId: string
    title: string
}

export interface ChartBindDialogProps {
    /** True when the dialog should be visible. */
    open: boolean
    /** Called when the dialog requests close (Esc, outside click, or pick). */
    onOpenChange: (next: boolean) => void
    /** Currently bound songId (preselects/highlights it in the list). */
    currentSongId?: string
    /** aria-label for the cmdk input (test/a11y hook). */
    inputAriaLabel?: string
    /** Fired when the user picks a library entry. Dialog auto-closes after. */
    onBind: (selection: ChartBindSelection) => void
}

export function ChartBindDialog({
    open,
    onOpenChange,
    currentSongId,
    inputAriaLabel = 'Bind a chart',
    onBind,
}: ChartBindDialogProps) {
    const [filter, setFilter] = useState('')

    const close = () => {
        onOpenChange(false)
        setFilter('')
    }

    const handlePick = (song: { id: string; title: string }) => {
        onBind({ songId: song.id, title: song.title })
        close()
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) close()
                else onOpenChange(true)
            }}
        >
            <DialogContent
                className="max-w-md p-0 overflow-hidden"
                data-testid="chart-bind-dialog"
            >
                <DialogHeader className="px-4 pt-4 pb-2">
                    <DialogTitle>Bind a chart</DialogTitle>
                    <DialogDescription>
                        Pick a song from your library to attach to this track.
                    </DialogDescription>
                </DialogHeader>
                <ChartPickerList
                    filter={filter}
                    onFilterChange={setFilter}
                    onPick={handlePick}
                    onEscape={close}
                    currentSongId={currentSongId}
                    inputAriaLabel={inputAriaLabel}
                    placeholder="Search the library…"
                    inputClassName="w-full bg-transparent px-4 py-2 text-sm outline-none border-t border-b border-white/10"
                    listClassName="max-h-80 overflow-y-auto py-1"
                    itemClassName="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm aria-selected:bg-indigo-500/15 data-[current=true]:text-indigo-300"
                    autoFocus
                />
            </DialogContent>
        </Dialog>
    )
}
