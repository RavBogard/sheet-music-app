'use client'

import { ChevronLeft, MoreVertical } from 'lucide-react'

import { cn } from '@/lib/utils'

import { SyncIndicator, type SyncIndicatorProps } from './SyncIndicator'

export interface SetlistGridTopBarProps {
    name: string
    eventDateLabel?: string
    onBack: () => void
    onOverflow?: () => void
    syncProps?: SyncIndicatorProps
}

export function SetlistGridTopBar({
    name,
    eventDateLabel,
    onBack,
    onOverflow,
    syncProps,
}: SetlistGridTopBarProps) {
    return (
        <header
            data-testid="setlist-grid-top-bar"
            className={cn(
                'sticky top-0 z-20 w-full',
                'flex items-center gap-3 px-3 py-2 sm:px-4',
                'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
                'border-b border-white/10',
            )}
        >
            <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className={cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-md',
                    'cursor-pointer hover:bg-white/5 active:bg-white/10',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                    'transition-colors duration-200 motion-reduce:transition-none',
                )}
            >
                <ChevronLeft aria-hidden className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">
                    {name || 'New Setlist'}
                </h1>
                {eventDateLabel ? (
                    <p className="truncate text-xs text-muted-foreground">
                        {eventDateLabel}
                    </p>
                ) : null}
            </div>

            <SyncIndicator {...syncProps} />

            <button
                type="button"
                onClick={onOverflow}
                aria-label="More actions"
                disabled={!onOverflow}
                className={cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-md',
                    'cursor-pointer hover:bg-white/5 active:bg-white/10',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    'transition-colors duration-200 motion-reduce:transition-none',
                )}
            >
                <MoreVertical aria-hidden className="h-5 w-5" />
            </button>
        </header>
    )
}
