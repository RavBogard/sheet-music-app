'use client'

import * as Popover from '@radix-ui/react-popover'
import { type ReactNode } from 'react'

import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

// v51-01-01: was Popover ↔ Sheet swap on (pointer: coarse). The Sheet
// path triggered the iPad system keyboard via cmdk's CommandInput auto-
// focus and mismatched the tablet-first feel. Rewritten to always-
// anchored Radix Popover. On (pointer: coarse), open-autofocus is
// suppressed so consumers can render search inputs visibly without the
// keyboard popping until the user deliberately taps the input.

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
                        // On touch, suppress the default first-focusable
                        // auto-focus. cmdk's CommandInput would otherwise
                        // grab focus on open and pop the system keyboard.
                        // The user can still tap into a search input
                        // deliberately to bring up the keyboard.
                        if (isCoarse) event.preventDefault()
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
