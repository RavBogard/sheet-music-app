'use client'

import { ChevronLeft } from 'lucide-react'

import { cn } from '@/lib/utils'

import { SyncIndicator, type SyncIndicatorProps } from './SyncIndicator'

export interface SetlistGridTopBarProps {
    name: string
    eventDateLabel?: string
    onBack: () => void
    syncProps?: SyncIndicatorProps
}

export function SetlistGridTopBar({
    name,
    eventDateLabel,
    onBack,
    syncProps,
}: SetlistGridTopBarProps) {
    return (
        <header
            data-testid="setlist-grid-top-bar"
            className={cn(
                'sticky top-0 z-20 w-full',
                'flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4',
                'bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40',
                'border-b border-white/10 shadow-lg shadow-brand/5',
            )}
        >
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back"
                    className={cn(
                        'inline-flex p-2 items-center justify-center rounded-full',
                        'text-foreground hover:bg-white/5 active:bg-white/10',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                        'transition-colors',
                    )}
                >
                    <ChevronLeft aria-hidden className="h-6 w-6" />
                </button>

                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-lg sm:text-xl font-bold tracking-tight text-foreground">
                        {name || 'New Setlist'}
                    </h1>
                    {eventDateLabel ? (
                        <p className="truncate text-xs sm:text-sm text-muted-foreground font-medium uppercase tracking-wider mt-0.5">
                            {eventDateLabel}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 pl-4">
                <SyncIndicator {...syncProps} />
            </div>
        </header>
    )
}
