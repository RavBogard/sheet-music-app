'use client'

import Link from 'next/link'
import { ChevronLeft, Pencil, Play } from 'lucide-react'

import { DirectionalIcon } from '@/components/i18n/DirectionalIcon'
import { useT } from '@/i18n/client'
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
    /** WEB-12: link to the band view of this setlist (Perform). Omitted when Perform is off. */
    performHref?: string
}

export function SetlistGridTopBar({
    name,
    eventDateLabel,
    onBack,
    syncProps,
    onEditMeta,
    performHref,
}: SetlistGridTopBarProps) {
    const t = useT()
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
                    aria-label={t('setlistGrid.back')}
                    className={cn(
                        'inline-flex min-h-11 min-w-11 p-2 items-center justify-center rounded-full',
                        'text-foreground hover:bg-white/5 active:bg-white/10',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                        'transition-colors',
                    )}
                >
                    <DirectionalIcon icon={ChevronLeft} aria-hidden className="h-6 w-6" />
                </button>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <h1 className="truncate text-lg sm:text-xl font-bold tracking-tight text-foreground">
                            {name || t('setlistGrid.newSetlist')}
                        </h1>
                        {onEditMeta ? (
                            <button
                                type="button"
                                onClick={onEditMeta}
                                aria-label={t('setlistGrid.editSetlistDetails')}
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

            <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 ps-4">
                {performHref ? (
                    <Link
                        href={performHref}
                        data-testid="setlist-grid-perform-link"
                        className={cn(
                            'inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3',
                            'text-sm font-medium text-foreground hover:bg-white/5 active:bg-white/10',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        )}
                    >
                        <Play aria-hidden className="h-4 w-4" />
                        {t('setlistGrid.performLink')}
                    </Link>
                ) : null}
                <SyncIndicator {...syncProps} />
            </div>
        </header>
    )
}
