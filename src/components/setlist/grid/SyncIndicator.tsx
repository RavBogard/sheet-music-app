'use client'

import { useEffect, useState } from 'react'
import { Check, CloudOff, Loader2, XCircle } from 'lucide-react'

import { useT } from '@/i18n/client'
import { useFormat } from '@/i18n/format-client'
import type { T } from '@/i18n/core'
import { cn } from '@/lib/utils'
import type { Freshness, FreshnessState, RefusedItem } from '@/lib/setlist-ops-client/freshness'
import { getOpsClient } from '@/lib/setlist-ops-client/runtime'

/**
 * The editor's save indicator (setlist sync PR 3). It reads ONE setlist's
 * freshness: current, saving(n), refused(list) or offline-since. Nothing in
 * another setlist or another collection can move it.
 *
 * Refused changes are listed under it, each with "Try again" (send it again
 * over the other person's value) and "Discard" (drop it; the saved version
 * shows again).
 */

interface VisualSpec {
    icon: typeof Check
    label: (f: Freshness, t: T) => string
    announce: (f: Freshness, t: T) => string
    iconClass: string
    spin?: boolean
}

const VISUALS: Record<FreshnessState, VisualSpec> = {
    current: {
        icon: Check,
        label: (_f, t) => t('setlistGrid.syncSaved'),
        announce: (_f, t) => t('setlistGrid.syncSaved'),
        iconClass: 'text-success',
    },
    saving: {
        icon: Loader2,
        label: (f, t) => (f.saving > 1 ? t('setlistGrid.syncSavingCount', { count: f.saving }) : t('setlistGrid.syncSaving')),
        announce: (_f, t) => t('setlistGrid.syncSavingAnnounce'),
        iconClass: 'text-brand',
        spin: true,
    },
    refused: {
        icon: XCircle,
        label: (f, t) => t('setlistGrid.syncRefused', { count: f.refused.length }),
        announce: (_f, t) => t('setlistGrid.syncRefusedAnnounce'),
        iconClass: 'text-destructive',
    },
    offline: {
        icon: CloudOff,
        label: (f, t) => (f.saving > 0 ? t('setlistGrid.syncOfflineQueued', { count: f.saving }) : t('setlistGrid.syncOffline')),
        announce: (f, t) =>
            f.saving > 0 ? t('setlistGrid.syncOfflineQueuedAnnounce', { count: f.saving }) : t('setlistGrid.syncOffline'),
        iconClass: 'text-caution',
    },
}

const CURRENT: Freshness = { state: 'current', saving: 0, refused: [], offlineSince: null, canEditStructure: true }

function reasonText(item: RefusedItem, t: T): string {
    switch (item.reason) {
        case 'field':
            return t('setlistGrid.refusedReasonField', { field: item.field ?? '' })
        case 'row-gone':
            return t('setlistGrid.refusedReasonRowGone')
        case 'row-exists':
            return t('setlistGrid.refusedReasonRowExists')
        case 'forbidden':
            return t('setlistGrid.refusedReasonForbidden')
        case 'not-found':
            return t('setlistGrid.refusedReasonNotFound')
        case 'invalid':
        case 'too-large':
            return t('setlistGrid.refusedReasonInvalid')
        default:
            return t('setlistGrid.refusedReasonOther')
    }
}

export interface SyncIndicatorProps {
    /** This setlist's freshness (useSetlistView). */
    freshness?: Freshness
    /** Test seams; default to the page's ops client. */
    onRetry?: (localId: number) => void | Promise<void>
    onDiscard?: (localId: number) => void | Promise<void>
}

export function SyncIndicator({ freshness = CURRENT, onRetry, onDiscard }: SyncIndicatorProps) {
    const t = useT()
    const fmt = useFormat()
    const [announce, setAnnounce] = useState('')
    const visual = VISUALS[freshness.state]
    const label = visual.label(freshness, t)
    const announceText = visual.announce(freshness, t)

    useEffect(() => {
        // Empty then set so the live region re-announces identical text.
        setAnnounce('')
        const timer = setTimeout(() => setAnnounce(announceText), 50)
        return () => clearTimeout(timer)
    }, [freshness.state, announceText])

    const tooltip =
        freshness.state === 'offline' && freshness.offlineSince
            ? t('setlistGrid.syncOfflineSince', { time: fmt.pattern(new Date(freshness.offlineSince), 'p') })
            : label

    const retry = onRetry ?? ((id: number) => getOpsClient().retry(id))
    const discard = onDiscard ?? ((id: number) => getOpsClient().discard(id))
    const Icon = visual.icon

    return (
        <div className="inline-flex flex-col items-start gap-0.5">
            <span
                role="status"
                aria-label={t('setlistGrid.syncStatusAria', { status: label })}
                title={tooltip}
                className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium cursor-default"
                data-state={freshness.state}
                data-testid="sync-indicator"
            >
                <Icon
                    aria-hidden
                    className={cn('h-4 w-4', visual.iconClass, visual.spin && 'animate-spin motion-reduce:animate-none')}
                />
                {/* On a phone the settled "Saved" state is the icon alone (the
                    label stays for screen readers); every other state keeps
                    its words, because a warning is written, not coloured. */}
                <span className={freshness.state === 'current' ? 'sr-only sm:not-sr-only' : undefined}>{label}</span>
            </span>
            {freshness.refused.length > 0 && (
                <ul
                    aria-label={t('setlistGrid.refusedListAria')}
                    data-testid="sync-refused-list"
                    className="flex flex-col gap-1 max-w-[320px]"
                >
                    {freshness.refused.map((item) => {
                        const row =
                            item.kind === 'editSetlist'
                                ? t('setlistGrid.refusedSetlistLabel')
                                : (item.label ?? t('setlistGrid.untitledTrack'))
                        return (
                            <li
                                key={item.localId}
                                data-testid={`sync-refused-${item.localId}`}
                                data-reason={item.reason}
                                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-tight text-destructive"
                            >
                                <span className="break-words">{t('setlistGrid.refusedItem', { row, reason: reasonText(item, t) })}</span>
                                {item.canRetry && (
                                    <button
                                        type="button"
                                        data-testid={`sync-refused-retry-${item.localId}`}
                                        onClick={() => void retry(item.localId)}
                                        className="font-semibold underline underline-offset-2 text-foreground rounded-sm px-1 [@media(pointer:coarse)]:min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                    >
                                        {t('setlistGrid.refusedRetry')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    data-testid={`sync-refused-discard-${item.localId}`}
                                    onClick={() => void discard(item.localId)}
                                    className="font-semibold underline underline-offset-2 text-muted-foreground rounded-sm px-1 [@media(pointer:coarse)]:min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                >
                                    {t('setlistGrid.refusedDiscard')}
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
            <span role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="sync-indicator-announce">
                {announce}
            </span>
        </div>
    )
}
