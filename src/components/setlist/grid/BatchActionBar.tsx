'use client'

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from 'cmdk'
import { ChevronDown, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import type { LocalTrack } from '@/lib/local/types'
import { cn } from '@/lib/utils'

import { KEY_OPTIONS_DATA } from './cells/KeyCell'
import { TYPE_OPTIONS } from './cells/TypeCell'
import { TouchOrPopover } from './TouchOrPopover'

export interface BulkSetPatch {
    type?: string
    key?: string
    leadMusician?: string
}

export interface BatchActionBarProps {
    /** Resolved by parent — toolbar treats as authoritative. */
    selectedTracks: LocalTrack[]
    /** Esc-equivalent + ✕ Clear button. */
    onClear: () => void
    /** Bulk patch applied to all selected rows; toolbar fans out to N applyEdit calls. */
    onBulkSet: (patch: BulkSetPatch) => Promise<void> | void
    /** Bulk delete; toolbar trusts parent for confirmation (AlertDialog wired in Task 3). */
    onBulkDelete: () => Promise<void> | void
}

/**
 * v50-05-03 batch-edit toolbar (ARCHITECTURE.md §6.6).
 *
 * Mounts when selection size ≥ 2 (gated by SetlistGrid). Sticky below the
 * top bar; bulk Type/Key/Lead via Popover+cmdk dropdowns; bulk Delete via
 * destructive button (parent's AlertDialog handles confirmation). Selection
 * is preserved across bulk-set (so the user can change another field on the
 * same set); bulk-delete clears via SetlistGrid's handleBulkDelete after
 * the engine drains.
 */
export function BatchActionBar({
    selectedTracks,
    onClear,
    onBulkSet,
    onBulkDelete,
}: BatchActionBarProps) {
    const count = selectedTracks.length

    // Build the unique-leads list from the current selection so the Lead
    // dropdown shows what's already in play. Toolbar deliberately does NOT
    // pull from the broader library; bulk-set is fast-path for already-known
    // names. Free-text typing is supported via cmdk input + the freeform
    // CommandItem below.
    const knownLeads = Array.from(
        new Set(
            selectedTracks
                .map((t) => t.leadMusician)
                .filter((m): m is string => Boolean(m)),
        ),
    ).sort()

    return (
        <div
            data-testid="batch-action-bar"
            role="toolbar"
            aria-label={`Bulk-edit ${count} selected rows`}
            className={cn(
                'sticky top-[3.25rem] z-20',
                'flex items-center gap-2 border-b border-white/10',
                'bg-indigo-950/30 backdrop-blur supports-[backdrop-filter]:bg-indigo-950/20',
                'px-3 py-2 text-sm',
                'animate-in slide-in-from-top-1 duration-150 motion-reduce:animate-none',
            )}
        >
            <span
                aria-live="polite"
                className="font-medium text-indigo-200"
                data-testid="batch-action-count"
            >
                {count} rows selected
            </span>

            <span aria-hidden className="mx-1 h-4 w-px bg-white/10" />

            <BulkPopover
                label="Type"
                aria-label="Set type for selected rows"
                onCommit={(value) => onBulkSet({ type: value })}
                options={TYPE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                }))}
                discrete
            />
            <BulkPopover
                label="Key"
                aria-label="Set key for selected rows"
                onCommit={(value) => onBulkSet({ key: value })}
                options={KEY_OPTIONS_DATA}
                discrete
            />
            <BulkPopover
                label="Vocal Lead"
                testId="lead"
                aria-label="Set Vocal Lead for selected rows"
                onCommit={(value) => onBulkSet({ leadMusician: value })}
                options={knownLeads.map((m) => ({ value: m, label: m }))}
                allowFreeText
                placeholder="Pick or type a Vocal Lead…"
                emptyHint={
                    knownLeads.length === 0
                        ? 'No Vocal Leads in selection — type a name and press Enter.'
                        : undefined
                }
            />

            <span aria-hidden className="mx-1 h-4 w-px bg-white/10" />

            <button
                type="button"
                onClick={() => void onBulkDelete()}
                data-testid="batch-action-delete"
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm',
                    'cursor-pointer text-red-300 hover:bg-red-500/15 hover:text-red-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400',
                    'transition-colors duration-150 motion-reduce:transition-none',
                )}
            >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
                Delete
            </button>

            <span aria-hidden className="ml-auto" />

            <button
                type="button"
                onClick={onClear}
                data-testid="batch-action-clear"
                aria-label="Clear selection"
                className={cn(
                    'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs',
                    'cursor-pointer text-muted-foreground hover:bg-white/5 hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                    'transition-colors duration-150 motion-reduce:transition-none',
                )}
            >
                <X aria-hidden className="h-3 w-3" />
                Clear
            </button>
        </div>
    )
}

interface BulkPopoverProps {
    label: ReactNode
    'aria-label': string
    options: Array<{ value: string; label: string }>
    onCommit: (value: string) => void
    allowFreeText?: boolean
    placeholder?: string
    emptyHint?: string
    /**
     * v51-01-01: discrete-mode picker — no CommandInput rendered.
     * Used for Type and Key bulk-edit popovers (short fixed option
     * sets); Lead bulk-edit stays searchable for free-text musician
     * names.
     */
    discrete?: boolean
    /**
     * Explicit testid stem (e.g. "lead" produces batch-action-lead-trigger).
     * Decouples testids from the user-facing label so v51-04's "Lead" →
     * "Vocal Lead" rename can preserve existing test seams.
     */
    testId?: string
}

function BulkPopover({
    label,
    'aria-label': ariaLabel,
    options,
    onCommit,
    allowFreeText = false,
    placeholder,
    emptyHint,
    discrete = false,
    testId,
}: BulkPopoverProps) {
    const idStem = testId ?? String(label).toLowerCase()
    const [open, setOpen] = useState(false)
    const [filter, setFilter] = useState('')

    const close = () => {
        setOpen(false)
        setFilter('')
    }

    const commit = (value: string) => {
        onCommit(value)
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
            contentClassName="w-[16rem]"
            contentTestId={`batch-action-${idStem}-popover`}
            trigger={
                <button
                    type="button"
                    aria-label={ariaLabel}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    data-testid={`batch-action-${idStem}-trigger`}
                    className={cn(
                        // Baseline tight density on desktop; bumped to
                        // 44px (h-11) on touch breakpoints.
                        'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-sm',
                        '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3',
                        'cursor-pointer text-muted-foreground hover:bg-white/5 hover:text-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                        'transition-colors duration-150 motion-reduce:transition-none',
                    )}
                >
                    {label}
                    <ChevronDown aria-hidden className="h-3 w-3" />
                </button>
            }
        >
            <Command shouldFilter loop>
                {!discrete && (
                    <CommandInput
                        value={filter}
                        onValueChange={setFilter}
                        placeholder={placeholder ?? 'Type to filter…'}
                        aria-label={ariaLabel}
                        className="w-full bg-transparent px-3 py-2 text-sm outline-none border-b border-white/10"
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                e.preventDefault()
                                close()
                                return
                            }
                            if (
                                e.key === 'Enter' &&
                                allowFreeText &&
                                filter.trim().length > 0
                            ) {
                                // Allow custom value entry on Enter when
                                // no cmdk match is active. cmdk's
                                // built-in Enter handling already commits
                                // the highlighted match; this branch
                                // covers the no-match case.
                                const trimmed = filter.trim()
                                const matched = options.find(
                                    (o) =>
                                        o.value.toLowerCase() ===
                                            trimmed.toLowerCase() ||
                                        o.label.toLowerCase() ===
                                            trimmed.toLowerCase(),
                                )
                                if (!matched) {
                                    e.preventDefault()
                                    commit(trimmed)
                                }
                            }
                        }}
                    />
                )}
                <CommandList className="max-h-64 overflow-y-auto py-1">
                    <CommandEmpty className="px-3 py-2 text-sm text-muted-foreground">
                        {emptyHint ?? 'No matches.'}
                    </CommandEmpty>
                    {options.length > 0 && (
                        <CommandGroup>
                            {options.map((opt) => (
                                <CommandItem
                                    key={opt.value}
                                    value={`${opt.label} ${opt.value}`}
                                    onSelect={() => commit(opt.value)}
                                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:py-2"
                                >
                                    <span className="truncate">
                                        {opt.label}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                    {allowFreeText && !discrete && filter.trim().length > 0 && (
                        <CommandGroup heading="Custom">
                            <CommandItem
                                value={`__addfree__${filter}`}
                                onSelect={() => commit(filter.trim())}
                                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm aria-selected:bg-indigo-500/15 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:py-2"
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
