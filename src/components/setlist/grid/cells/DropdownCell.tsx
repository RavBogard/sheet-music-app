'use client'

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { TouchOrPopover } from '../TouchOrPopover'

export interface DropdownOption {
    value: string
    label: string
    icon?: ReactNode
    hint?: string
    /** Bucket label, e.g. "Recent" / "Library" / null for ungrouped */
    group?: string
}

export interface DropdownCellProps {
    value: string | undefined
    onCommit: (next: string) => void
    /** Allow free-text input that doesn't match any option (Lead "+ Add new..."). */
    allowFreeText?: boolean
    options: DropdownOption[]
    placeholder?: string
    isFocused: boolean
    onFocus: () => void
    onMoveFocus?: (direction: 'up' | 'down' | 'left' | 'right') => void
    onCellKeyDown?: (event: React.KeyboardEvent) => boolean
    ariaLabel: string
    className?: string
    /** Render override for the resting (non-edit) cell display. */
    renderDisplay?: (value: string | undefined) => ReactNode
}

const PRINTABLE_KEY_RE = /^[ -~]$/

export function DropdownCell({
    value,
    onCommit,
    allowFreeText = false,
    options,
    placeholder,
    isFocused,
    onFocus,
    onMoveFocus,
    onCellKeyDown,
    ariaLabel,
    className,
    renderDisplay,
}: DropdownCellProps) {
    const [open, setOpen] = useState(false)
    const [filter, setFilter] = useState('')
    const buttonRef = useRef<HTMLButtonElement>(null)
    const advanceAfterCloseRef = useRef<
        'up' | 'down' | 'left' | 'right' | null
    >(null)

    useEffect(() => {
        if (isFocused && !open && buttonRef.current) {
            const t = setTimeout(() => {
                if (document.activeElement !== buttonRef.current && !open) {
                    buttonRef.current?.focus()
                }
            }, 0)
            return () => clearTimeout(t)
        }
        return
    }, [isFocused, open])

    const enterEditMode = (initial?: string) => {
        setFilter(initial ?? '')
        setOpen(true)
    }

    const close = () => {
        setOpen(false)
        const dir = advanceAfterCloseRef.current
        advanceAfterCloseRef.current = null
        if (dir) onMoveFocus?.(dir)
    }

    const commit = (next: string, advance?: 'up' | 'down' | 'left' | 'right') => {
        if (next !== (value ?? '')) onCommit(next)
        advanceAfterCloseRef.current = advance ?? null
        setOpen(false)
    }

    const handleButtonKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            enterEditMode()
            return
        }
        if (PRINTABLE_KEY_RE.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault()
            enterEditMode(e.key)
            return
        }
        onCellKeyDown?.(e)
    }

    // Group options by `group` for cmdk's CommandGroup.
    const grouped = (() => {
        const map = new Map<string, DropdownOption[]>()
        for (const o of options) {
            const k = o.group ?? ''
            if (!map.has(k)) map.set(k, [])
            map.get(k)!.push(o)
        }
        return Array.from(map.entries())
    })()

    const display =
        renderDisplay !== undefined
            ? renderDisplay(value)
            : (value ?? '') || (
                  <span className="text-muted-foreground/50">
                      {placeholder ?? ''}
                  </span>
              )

    return (
        <TouchOrPopover
            open={open}
            onOpenChange={(next) => {
                if (!next) close()
                else setOpen(true)
            }}
            align="start"
            sideOffset={2}
            onCloseAutoFocus={(e) => {
                // Returning focus to the button is what we want.
                e.preventDefault()
                buttonRef.current?.focus()
            }}
            contentClassName="w-[16rem]"
            trigger={
                <button
                    ref={buttonRef}
                    type="button"
                    tabIndex={isFocused ? 0 : -1}
                    onFocus={onFocus}
                    onKeyDown={handleButtonKeyDown}
                    aria-label={ariaLabel}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    data-testid="dropdown-cell-button"
                    className={cn(
                        // Baseline 40px (h-10); bumped to 44px (h-11) on
                        // touch breakpoints to satisfy ARCHITECTURE §6.7
                        // 44px minimum touch target.
                        'inline-flex h-10 w-full items-center justify-between gap-1 px-1 text-left',
                        '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-2',
                        'truncate text-sm',
                        'cursor-pointer rounded-sm border border-transparent',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                        isFocused && 'ring-2 ring-indigo-400/60 bg-indigo-500/5',
                        className,
                    )}
                >
                    <span className="truncate">{display}</span>
                    {(isFocused || open) && (
                        <ChevronDown
                            aria-hidden
                            className="h-3 w-3 flex-none text-muted-foreground"
                        />
                    )}
                </button>
            }
        >
            <Command
                loop
                shouldFilter
                data-testid="dropdown-cell-command"
            >
                <CommandInput
                    value={filter}
                    onValueChange={setFilter}
                    placeholder={placeholder ?? 'Type to filter…'}
                    className="w-full bg-transparent px-3 py-2 text-sm outline-none border-b border-white/10"
                    onKeyDown={(e) => {
                        if (e.key === 'Tab') {
                            e.preventDefault()
                            if (allowFreeText && filter.trim().length > 0) {
                                commit(
                                    filter.trim(),
                                    e.shiftKey ? 'left' : 'right',
                                )
                            } else {
                                commit(value ?? '', e.shiftKey ? 'left' : 'right')
                            }
                        }
                        if (e.key === 'Escape') {
                            e.preventDefault()
                            setOpen(false)
                        }
                    }}
                />
                <CommandList className="max-h-64 overflow-y-auto py-1">
                    <CommandEmpty className="px-3 py-2 text-sm text-muted-foreground">
                        No matches.
                    </CommandEmpty>
                    {grouped.map(([groupName, items]) => (
                        <CommandGroup
                            key={groupName || '_'}
                            heading={groupName || undefined}
                            className={cn(
                                groupName &&
                                    'px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground/80',
                            )}
                        >
                            {items.map((opt) => (
                                <CommandItem
                                    key={opt.value}
                                    value={`${opt.label} ${opt.value}`}
                                    onSelect={() => commit(opt.value, 'down')}
                                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15"
                                >
                                    {opt.icon ? (
                                        <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                                            {opt.icon}
                                        </span>
                                    ) : null}
                                    <span className="truncate">
                                        {opt.label}
                                    </span>
                                    {opt.hint ? (
                                        <span className="ml-auto truncate text-xs text-muted-foreground">
                                            {opt.hint}
                                        </span>
                                    ) : null}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}
                    {allowFreeText && filter.trim().length > 0 && (
                        <CommandGroup heading="Custom">
                            <CommandItem
                                value={`__addfree__${filter}`}
                                onSelect={() => commit(filter.trim(), 'down')}
                                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15"
                            >
                                <span>+ Add “{filter.trim()}”</span>
                            </CommandItem>
                        </CommandGroup>
                    )}
                </CommandList>
            </Command>
        </TouchOrPopover>
    )
}
