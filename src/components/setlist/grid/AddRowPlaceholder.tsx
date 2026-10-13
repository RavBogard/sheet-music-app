'use client'

import { CommandGroup, CommandItem } from 'cmdk'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useT } from '@/i18n/client'
import { cn } from '@/lib/utils'

import { ChartPickerList } from './ChartPickerList'
import { TouchOrPopover } from './TouchOrPopover'

/**
 * v53-03-01: the picker rendered by AddBar's primary "+ Song" CTA. Its list
 * body (Recent + Library, page-1 thumbnails) is the shared ChartPickerList;
 * this component adds the Custom "Create new track called …" row.
 */
export interface AddRowPlaceholderProps {
    /** Insert a new row populated from a known library song. */
    onPickSong: (song: { id: string; title: string }) => void
    /** Insert a new row with a free-text title only. */
    onCreateFreeText: (title: string) => void
    /** Imperative open trigger from the EmptyState "Add a song" CTA. */
    autoOpen?: boolean
}

export function AddRowPlaceholder({
    onPickSong,
    onCreateFreeText,
    autoOpen = false,
}: AddRowPlaceholderProps) {
    const t = useT()
    const [open, setOpen] = useState(false)
    const [filter, setFilter] = useState('')
    const triggerRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (autoOpen) setOpen(true)
    }, [autoOpen])

    const close = () => {
        setOpen(false)
        setFilter('')
    }

    const handlePick = (song: { id: string; title: string }) => {
        onPickSong(song)
        close()
    }

    const handleFreeText = () => {
        const title = filter.trim()
        if (!title) {
            close()
            return
        }
        onCreateFreeText(title)
        close()
    }

    return (
        <div
            data-testid="add-row-placeholder"
            className={cn(
                'flex w-full items-center border-t border-white/10',
                'hover:bg-white/[0.03]',
            )}
        >
            <TouchOrPopover
                open={open}
                onOpenChange={(next) => {
                    if (!next) close()
                    else setOpen(true)
                }}
                align="start"
                sideOffset={2}
                onCloseAutoFocus={(e) => {
                    e.preventDefault()
                    triggerRef.current?.focus()
                }}
                contentClassName="w-[24rem]"
                trigger={
                    <button
                        ref={triggerRef}
                        type="button"
                        data-testid="add-row-trigger"
                        // v53-03-01: long-press disambiguation — neutralize
                        // synthetic contextmenu MouseEvent dispatched by
                        // v50-05-04 row long-press machinery. AddRowPlaceholder
                        // (and its parent AddBar) live outside the row scope,
                        // so a long-press here must NOT open the row
                        // ContextMenu. preventDefault is defense-in-depth.
                        onContextMenu={(e) => e.preventDefault()}
                        className={cn(
                            // Baseline 44px (h-11) — already satisfies touch
                            // target requirement; bumped to h-12 on coarse
                            // for extra breathing room.
                            'flex h-11 w-full items-center gap-2 px-3 text-start text-sm',
                            '[@media(pointer:coarse)]:h-12',
                            'font-medium text-foreground hover:text-foreground',
                            'cursor-pointer',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                        )}
                    >
                        <Plus
                            aria-hidden
                            className="h-4 w-4 text-indigo-300"
                        />
                        <span>{t('setlistGrid.addSong')}</span>
                    </button>
                }
            >
                <ChartPickerList
                    filter={filter}
                    onFilterChange={setFilter}
                    onPick={handlePick}
                    onEscape={close}
                    inputAriaLabel={t('setlistGrid.addSongAria')}
                    placeholder={t('setlistGrid.addSongPlaceholder')}
                    inputClassName="w-full bg-transparent px-3 py-2 text-sm outline-none border-b border-white/10"
                    listClassName="max-h-72 overflow-y-auto py-1"
                    itemClassName="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15"
                >
                    {filter.trim().length > 0 && (
                        <CommandGroup heading={t('setlistGrid.pickerCustomHeading')}>
                            <CommandItem
                                value={`__create__${filter}`}
                                onSelect={handleFreeText}
                                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15"
                            >
                                <Plus
                                    aria-hidden
                                    className="h-3.5 w-3.5 text-muted-foreground/70"
                                />
                                <span>
                                    {t('setlistGrid.createTrackCalled', { title: filter.trim() })}
                                </span>
                            </CommandItem>
                        </CommandGroup>
                    )}
                </ChartPickerList>
            </TouchOrPopover>
        </div>
    )
}
