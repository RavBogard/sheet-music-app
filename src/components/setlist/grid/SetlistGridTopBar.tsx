'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft, Pencil, Play } from 'lucide-react'

import { DirectionalIcon } from '@/components/i18n/DirectionalIcon'
import { useT } from '@/i18n/client'
import { PAGE_WIDTH_CLASS } from "@/components/layout/Page"
import { cn } from '@/lib/utils'

import { SyncIndicator, type SyncIndicatorProps } from './SyncIndicator'

export interface SetlistGridTopBarProps {
    name: string
    /** Not shown: the title carries the date. Kept so callers need no change. */
    eventDateLabel?: string
    /** Web refresh: the rest of the status line after the date
     *  ("24 songs", "24/24 charts", "Updated 3 hours ago"). */
    statusParts?: string[]
    onBack: () => void
    syncProps?: SyncIndicatorProps
    /** v70-09: when provided, renders a pencil edit button beside the name
     *  that opens the setlist metadata editor. Omitted by callers (e.g. the
     *  perform view) that don't offer metadata editing. */
    onEditMeta?: () => void
    /** WEB-12: link to the band view of this setlist (Perform). Omitted when Perform is off. */
    performHref?: string
    /** BET-5: the gig line under the status line (band tenants). */
    gigSlot?: ReactNode
}

/**
 * The setlist editor's head row (Option B, 2026-11-01): the title at 1rem/800,
 * ONE meta line under it, and the one blue Perform button on the right, drawn
 * small with a 44px hit area. It sticks just under the shell's top bar so
 * Perform is always one tap away.
 */
export function SetlistGridTopBar({
    name,
    statusParts = [],
    onBack,
    syncProps,
    onEditMeta,
    performHref,
    gigSlot,
}: SetlistGridTopBarProps) {
    const t = useT()
    const status = statusParts.filter((p): p is string => Boolean(p))
    return (
        <header
            data-testid="setlist-grid-top-bar"
            className="sticky top-14 z-20 w-full bg-background/95 supports-[backdrop-filter]:bg-background/85 backdrop-blur-md border-b border-rule"
        >
            {/* Consistency pass: the page container width, and a head that
                wraps instead of crushing. Back + title (2 lines max) + status
                take a full row on a phone; the sync state and Perform drop to
                their own row under them. */}
            <div className={cn(PAGE_WIDTH_CLASS, "flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5")}>
                <div className="flex min-w-0 flex-[1_1_22rem] items-center gap-1 sm:gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label={t('setlistGrid.back')}
                    className={cn(
                        'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md -ms-2',
                        'text-foreground hover:bg-accent',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'transition-colors',
                    )}
                >
                    <DirectionalIcon icon={ChevronLeft} aria-hidden className="h-5 w-5" />
                </button>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                        <h1 className="line-clamp-2 break-words text-base font-extrabold leading-tight text-foreground">
                            {name || t('setlistGrid.newSetlist')}
                        </h1>
                        {onEditMeta ? (
                            <button
                                type="button"
                                onClick={onEditMeta}
                                aria-label={t('setlistGrid.editSetlistDetails')}
                                className={cn(
                                    'touch-hit inline-flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0',
                                    'text-muted-foreground hover:text-foreground hover:bg-accent',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    'transition-colors',
                                )}
                            >
                                <Pencil aria-hidden className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                    </div>
                    {status.length > 0 ? (
                        <p
                            data-testid="setlist-status-line"
                            className="tnum line-clamp-2 break-words text-xs font-medium text-muted-foreground"
                        >
                            {status.map((part, i) => (
                                <span key={i}>
                                    {i > 0 ? <span aria-hidden="true"> · </span> : null}
                                    <span>{part}</span>
                                </span>
                            ))}
                        </p>
                    ) : null}
                    {gigSlot}
                </div>
                </div>

                <div className="ms-auto flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <SyncIndicator {...syncProps} />
                    {performHref ? (
                        <Link
                            href={performHref}
                            data-testid="setlist-grid-perform-link"
                            className={cn(
                                'touch-hit inline-flex h-8 items-center gap-1.5 rounded-md px-3',
                                'bg-primary text-primary-foreground text-[13px] font-bold',
                                'hover:bg-primary/90 active:bg-primary/85 transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            )}
                        >
                            <Play aria-hidden className="h-3.5 w-3.5 fill-current" />
                            {t('setlistGrid.performLink')}
                        </Link>
                    ) : null}
                </div>
            </div>
        </header>
    )
}
