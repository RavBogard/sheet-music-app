'use client'

import { ChevronLeft, Pencil } from 'lucide-react'

import { cn } from '@/lib/utils'

import { SyncIndicator, type SyncIndicatorProps } from './SyncIndicator'

export interface SetlistGridTopBarProps {
    name: string
    eventDateLabel?: string
    onBack: () => void
    syncProps?: SyncIndicatorProps
    /** v70-09: when provided, renders a pencil edit button beside the name
     *  that opens the setlist metadata editor. Omitted by callers (e.g. the
     *  perform view) that don't offer metadata editing. */
    onEditMeta?: () => void
}

export function SetlistGridTopBar({
    name,
    eventDateLabel,
    onBack,
    syncProps,
    onEditMeta,
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
                    <div className="flex items-center gap-1.5 min-w-0">
                        <h1 className="truncate text-lg sm:text-xl font-bold tracking-tight text-foreground">
                            {name || 'New Setlist'}
                        </h1>
                        {onEditMeta ? (
                            <button
                                type="button"
                                onClick={onEditMeta}
                                aria-label="Edit setlist details"
                                className={cn(
                                    'inline-flex min-h-[44px] min-w-[44px] p-2 items-center justify-center rounded-full flex-shrink-0',
                                    'text-muted-foreground hover:text-foreground hover:bg-white/5 active:bg-white/10',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                                    'transition-colors',
                                )}
                            >
                                <Pencil aria-hidden className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>
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
