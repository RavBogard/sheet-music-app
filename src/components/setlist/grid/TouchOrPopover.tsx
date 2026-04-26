'use client'

import * as Popover from '@radix-ui/react-popover'
import { type ReactNode } from 'react'

import { useMediaQuery } from '@/hooks/use-media-query'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

// Single swap point for cell dropdowns + library pickers + bulk-edit popovers.
// Touch detection keys on (pointer: coarse) media query, NOT viewport width —
// iPad Pro at 1024px is still touch; viewport-based detection would miss it
// and over-trigger on a resized desktop browser.
//
// On (pointer: coarse): Radix Sheet (bottom sheet) — tap-friendly target,
// always reachable, predictable position.
// On (pointer: fine): Radix Popover (floating, anchored) — desktop UX
// preserved; align + sideOffset settings flow through.

export interface TouchOrPopoverProps {
    open: boolean
    onOpenChange: (next: boolean) => void
    trigger: ReactNode
    children: ReactNode

    /**
     * Always required for a11y (Radix Dialog needs a Title). Use
     * `srOnlyTitle` to render visually-hidden but accessible to screen
     * readers.
     */
    sheetTitle: string
    sheetDescription?: string
    srOnlyTitle?: boolean

    /** Popover positioning on desktop. */
    align?: 'start' | 'center' | 'end'
    sideOffset?: number
    onCloseAutoFocus?: (event: Event) => void

    /** Width / shape constraints applied to BOTH Popover.Content and
     *  SheetContent so the inner cmdk content stays consistent. */
    contentClassName?: string

    /** data-testid on the popover/sheet content for testing. */
    contentTestId?: string
}

export function TouchOrPopover({
    open,
    onOpenChange,
    trigger,
    children,
    sheetTitle,
    sheetDescription,
    srOnlyTitle = false,
    align = 'start',
    sideOffset = 2,
    onCloseAutoFocus,
    contentClassName,
    contentTestId,
}: TouchOrPopoverProps) {
    const isCoarse = useMediaQuery('(pointer: coarse)')

    if (isCoarse) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetTrigger asChild>{trigger}</SheetTrigger>
                <SheetContent
                    side="bottom"
                    className={cn(
                        'max-h-[80vh] overflow-y-auto p-4',
                        contentClassName,
                    )}
                    data-testid={contentTestId}
                >
                    <SheetHeader>
                        <SheetTitle
                            className={srOnlyTitle ? 'sr-only' : undefined}
                        >
                            {sheetTitle}
                        </SheetTitle>
                        {sheetDescription ? (
                            <SheetDescription>
                                {sheetDescription}
                            </SheetDescription>
                        ) : null}
                    </SheetHeader>
                    <div className="mt-3">{children}</div>
                </SheetContent>
            </Sheet>
        )
    }

    return (
        <Popover.Root open={open} onOpenChange={onOpenChange}>
            <Popover.Trigger asChild>{trigger}</Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    align={align}
                    sideOffset={sideOffset}
                    onCloseAutoFocus={onCloseAutoFocus}
                    className={cn(
                        'z-50 overflow-hidden rounded-md border border-white/10 bg-background shadow-lg',
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
