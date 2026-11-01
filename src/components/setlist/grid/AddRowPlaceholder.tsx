'use client'

import { CommandGroup, CommandItem } from 'cmdk'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useMediaQuery } from '@/hooks/use-media-query'
import { useVirtualKeyboardOpen } from '@/hooks/use-virtual-keyboard-open'
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
    /** 'row' (default): the full-width "+ Song" row in the AddBar.
     *  'fab': a round + fixed at the bottom right of the editor, above the
     *  phone tab bar, so adding a song is one tap from anywhere in the list
     *  (Daniel 2026-11-01). The picker opens above it. */
    variant?: 'row' | 'fab'
}

export function AddRowPlaceholder({
    onPickSong,
    onCreateFreeText,
    autoOpen = false,
    variant = 'row',
}: AddRowPlaceholderProps) {
    const t = useT()
    const fab = variant === 'fab'
    const isCoarse = useMediaQuery('(pointer: coarse)')
    const keyboardOpen = useVirtualKeyboardOpen()
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
            data-testid={fab ? 'add-song-fab' : 'add-row-placeholder'}
            className={cn(
                fab
                    ? // Above the tab bar below lg (--tabbar-h carries the
                      // safe area there); above the home indicator at lg+.
                      'fixed end-4 z-40 bottom-[calc(var(--tabbar-h,0px)+env(safe-area-inset-bottom)+1rem)] lg:bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] lg:end-6'
                    : 'flex w-full items-center border-t border-rule hover:bg-accent/50',
                // Out of the way while typing elsewhere on a phone; kept while
                // its own picker is open so the popover keeps its anchor.
                fab && isCoarse && keyboardOpen && !open && 'hidden',
            )}
        >
            <TouchOrPopover
                open={open}
                onOpenChange={(next) => {
                    if (!next) close()
                    else setOpen(true)
                }}
                side={fab ? 'top' : undefined}
                align={fab ? 'end' : 'start'}
                sideOffset={fab ? 8 : 2}
                onCloseAutoFocus={(e) => {
                    e.preventDefault()
                    triggerRef.current?.focus()
                }}
                contentClassName="w-[24rem] max-w-[calc(100vw-1rem)]"
                trigger={fab ? (
                    <button
                        ref={triggerRef}
                        type="button"
                        data-testid="add-song-fab-trigger"
                        aria-label={t('setlistGrid.addSongFab')}
                        title={t('setlistGrid.addSongFab')}
                        onContextMenu={(e) => e.preventDefault()}
                        className={cn(
                            'flex h-14 w-14 items-center justify-center rounded-full',
                            'bg-primary text-primary-foreground shadow-lg',
                            'hover:bg-primary/90 active:bg-primary/85 transition-colors cursor-pointer',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        )}
                    >
                        <Plus aria-hidden className="h-6 w-6" strokeWidth={2.5} />
                    </button>
                ) : (
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
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        )}
                    >
                        <Plus
                            aria-hidden
                            className="h-4 w-4 text-brand"
                        />
                        <span>{t('setlistGrid.addSong')}</span>
                    </button>
                )}
            >
                <ChartPickerList
                    filter={filter}
                    onFilterChange={setFilter}
                    onPick={handlePick}
                    onEscape={close}
                    inputAriaLabel={t('setlistGrid.addSongAria')}
                    placeholder={t('setlistGrid.addSongPlaceholder')}
                    inputClassName="w-full bg-transparent px-3 py-2 text-sm outline-none border-b border-rule"
                    listClassName="max-h-72 overflow-y-auto py-1"
                    itemClassName="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-brand/15"
                >
                    {filter.trim().length > 0 && (
                        <CommandGroup heading={t('setlistGrid.pickerCustomHeading')}>
                            <CommandItem
                                value={`__create__${filter}`}
                                onSelect={handleFreeText}
                                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-brand/15"
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
