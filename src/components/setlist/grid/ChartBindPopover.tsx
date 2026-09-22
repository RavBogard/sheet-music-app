'use client'

import { useState, type ReactNode } from 'react'

import { TouchOrPopover } from './TouchOrPopover'
import { ChartPickerList } from './ChartPickerList'

/**
 * v53-02-01 in-cell chart picker. The list body (Recent + Library, page-1
 * thumbnails, archive/junk filtering) lives in ChartPickerList, shared with
 * ChartBindDialog and AddRowPlaceholder.
 */

export interface ChartBindSelection {
    songId: string
    title: string
}

export interface ChartBindPopoverProps {
    /** Click target. Wrapped in TouchOrPopover trigger via asChild. */
    children: ReactNode
    /** Currently bound songId (preselects in the list when re-binding). */
    currentSongId?: string
    /** aria-label for the cmdk input (test/a11y hook). */
    inputAriaLabel?: string
    /** Fired when the user picks a library entry. */
    onBind: (selection: ChartBindSelection) => void
    /**
     * v50-05-04: Controlled open state. When `open` and `onOpenChange` are
     * provided, the popover is fully controlled by the parent (e.g. opened
     * imperatively by the row ContextMenu "Bind chart" action). When
     * undefined, falls back to internal state — preserves the v50-05-02
     * click-to-bind-from-ChartCell flow.
     */
    open?: boolean
    onOpenChange?: (next: boolean) => void
}

export function ChartBindPopover({
    children,
    currentSongId,
    inputAriaLabel = 'Bind a chart',
    onBind,
    open: controlledOpen,
    onOpenChange,
}: ChartBindPopoverProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const [filter, setFilter] = useState('')

    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = (next: boolean) => {
        if (!isControlled) setInternalOpen(next)
        onOpenChange?.(next)
    }

    const close = () => {
        setOpen(false)
        setFilter('')
    }

    const handlePick = (song: { id: string; title: string }) => {
        onBind({ songId: song.id, title: song.title })
        close()
    }

    return (
        <TouchOrPopover
            open={open}
            onOpenChange={(next) => {
                if (!next) close()
                else setOpen(true)
            }}
            align="start"
            sideOffset={4}
            // Defer to Radix default onCloseAutoFocus — restores focus to
            // the trigger (the forwardRef ChartCell button), which is the
            // desired behavior. No manual focus return needed.
            contentClassName="w-[24rem]"
            contentTestId="chart-bind-popover"
            trigger={children}
        >
            <ChartPickerList
                filter={filter}
                onFilterChange={setFilter}
                onPick={handlePick}
                onEscape={close}
                currentSongId={currentSongId}
                inputAriaLabel={inputAriaLabel}
                placeholder="Search the library…"
                inputClassName="w-full bg-transparent px-3 py-2 text-sm outline-none border-b border-white/10"
                listClassName="max-h-72 overflow-y-auto py-1"
                itemClassName="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15 data-[current=true]:text-indigo-300"
            />
        </TouchOrPopover>
    )
}
