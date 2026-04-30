'use client'

import * as Popover from '@radix-ui/react-popover'
import { type ReactNode } from 'react'

import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

// v51-01-01 introduced blanket-suppression of open-autofocus on
// (pointer: coarse) to keep the iPad system keyboard from popping when
// discrete pickers (Key/Type) open. v52-02-01 made the suppression
// opt-in via the `suppressAutoFocus` prop because the blanket rule
// broke searchable cmdk pickers (ChartBind, Lead) and any text-input
// surface inside the popover on iOS Safari — the search input never
// auto-focused, so the keyboard didn't pop, and typing-to-filter was
// dead. Discrete callers opt in (DropdownCell mode='discrete'); search-
// able callers leave the prop default (false) so cmdk CommandInput
// auto-focuses on open and the iPad keyboard pops, enabling immediate
// typing-to-filter.

export interface TouchOrPopoverProps {
    open: boolean
    onOpenChange: (next: boolean) => void
    trigger: ReactNode
    children: ReactNode

    /** Popover positioning. Defaults: align="start", sideOffset=2. */
    align?: 'start' | 'center' | 'end'
    sideOffset?: number
    onCloseAutoFocus?: (event: Event) => void

    /** Width / shape constraints applied to Popover.Content. */
    contentClassName?: string

    /** data-testid on the popover content for testing. */
    contentTestId?: string

    /**
     * v52-02-01: opt-in. When true AND the pointer is coarse, the
     * default Radix Popover open-autofocus is preventDefault'd. Use
     * for discrete pickers that have NO input inside the popover and
     * don't want the iPad keyboard popping on open. Default `false`:
     * any cmdk CommandInput / text input inside the popover auto-
     * focuses on open and the iPad system keyboard pops, which is the
     * desired behavior for searchable pickers.
     */
    suppressAutoFocus?: boolean
}

export function TouchOrPopover({
    open,
    onOpenChange,
    trigger,
    children,
    align = 'start',
    sideOffset = 2,
    onCloseAutoFocus,
    contentClassName,
    contentTestId,
    suppressAutoFocus = false,
}: TouchOrPopoverProps) {
    const isCoarse = useMediaQuery('(pointer: coarse)')

    return (
        <Popover.Root open={open} onOpenChange={onOpenChange}>
            <Popover.Trigger asChild>{trigger}</Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    align={align}
                    sideOffset={sideOffset}
                    onOpenAutoFocus={(event) => {
                        // v52-02-01: opt-in suppression. Discrete
                        // pickers (Key/Type) pass suppressAutoFocus
                        // to keep the iPad keyboard from popping on
                        // open. Searchable pickers don't pass it, so
                        // cmdk CommandInput auto-focuses normally and
                        // the keyboard pops — enabling immediate
                        // typing-to-filter on iPad.
                        if (suppressAutoFocus && isCoarse)
                            event.preventDefault()
                    }}
                    onCloseAutoFocus={onCloseAutoFocus}
                    className={cn(
                        'z-50 overflow-hidden rounded-md border border-white/10 bg-background shadow-lg',
                        'animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none',
                        contentClassName,
                    )}
                    data-testid={contentTestId}
                >
                    {children}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
