'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    AlertTriangle,
    Check,
    CircleDashed,
    CloudOff,
    Loader2,
    XCircle,
} from 'lucide-react'

import { useT } from '@/i18n/client'
import type { T } from '@/i18n/core'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { retryFailedOutboxRows } from '@/lib/sync/cleanup'
import { useSyncStatus } from '@/lib/sync/store'
import type { SyncState } from '@/lib/sync/state-machine'

import { useReconciliationModalOptional } from './ReconciliationProvider'

// v52-03-01: lastError patterns that indicate auth-claim staleness rather
// than a transient network/server failure. When matched, SyncIndicator
// surfaces a "Sign out and back in" affordance below the inline error pill
// so users can recover without DevTools (Track B Q2 firming: auth-claim
// staleness is the plausible co-factor with phantom-row blocking on iPad).
const AUTH_ERROR_PATTERN = /permission|auth|denied|unauthenticated|unauthorized/i

interface VisualSpec {
    icon: typeof Check
    label: (queued: number, t: T) => string
    announce: (queued: number, t: T) => string
    iconClass: string
    dotClass: string
    spin?: boolean
}

const VISUALS: Record<SyncState, VisualSpec> = {
    idle: {
        icon: Check,
        label: (_q, t) => t('setlistGrid.syncSaved'),
        announce: (_q, t) => t('setlistGrid.syncSaved'),
        iconClass: 'text-success',
        dotClass: 'bg-success',
    },
    dirty: {
        icon: CircleDashed,
        label: (_q, t) => t('setlistGrid.syncEditing'),
        announce: (_q, t) => t('setlistGrid.syncEditingAnnounce'),
        iconClass: 'text-muted-foreground',
        dotClass: 'bg-muted-foreground',
    },
    saving: {
        icon: Loader2,
        label: (_q, t) => t('setlistGrid.syncSaving'),
        announce: (_q, t) => t('setlistGrid.syncSavingAnnounce'),
        iconClass: 'text-brand',
        dotClass: 'bg-brand',
        spin: true,
    },
    conflict: {
        icon: AlertTriangle,
        label: (_q, t) => t('setlistGrid.syncConflict'),
        announce: (_q, t) => t('setlistGrid.syncConflictAnnounce'),
        iconClass: 'text-destructive',
        dotClass: 'bg-destructive',
    },
    failed: {
        icon: XCircle,
        label: (_q, t) => t('setlistGrid.syncFailed'),
        announce: (_q, t) => t('setlistGrid.syncFailedAnnounce'),
        iconClass: 'text-destructive',
        dotClass: 'bg-destructive',
    },
    offline: {
        icon: CloudOff,
        label: (q, t) => (q > 0 ? t('setlistGrid.syncOfflineQueued', { count: q }) : t('setlistGrid.syncOffline')),
        announce: (q, t) =>
            q > 0
                ? t('setlistGrid.syncOfflineQueuedAnnounce', { count: q })
                : t('setlistGrid.syncOffline'),
        iconClass: 'text-caution',
        dotClass: 'bg-caution',
    },
}

/** "Saved just now" / "Saved 12s ago" / "Saved 3m ago" / "Saved 2h ago". */
function savedRelative(ms: number, nowMs: number, t: T): string {
    const diff = Math.max(0, Math.floor((nowMs - ms) / 1000))
    if (diff < 5) return t('setlistGrid.syncSavedJustNow')
    if (diff < 60) return t('setlistGrid.syncSavedSecondsAgo', { n: diff })
    const mins = Math.floor(diff / 60)
    if (mins < 60) return t('setlistGrid.syncSavedMinutesAgo', { n: mins })
    const hrs = Math.floor(mins / 60)
    return t('setlistGrid.syncSavedHoursAgo', { n: hrs })
}

export interface SyncIndicatorProps {
    onRetryFailed?: () => void
    onResolveConflict?: () => void
    /** Override `Date.now()` — for tests. */
    nowFn?: () => number
}

export function SyncIndicator({
    onRetryFailed,
    onResolveConflict,
    nowFn,
}: SyncIndicatorProps) {
    const t = useT()
    const state = useSyncStatus((s) => s.state)
    const queued = useSyncStatus((s) => s.queued)
    const lastSyncAt = useSyncStatus((s) => s.lastSyncAt)
    const lastError = useSyncStatus((s) => s.lastError)
    const [announce, setAnnounce] = useState('')
    const [nowMs, setNowMs] = useState<number | null>(null)

    const visual = VISUALS[state]
    const label = visual.label(queued, t)

    useEffect(() => {
        // Empty then set so the live region re-announces identical text.
        setAnnounce('')
        const timer = setTimeout(() => setAnnounce(visual.announce(queued, t)), 50)
        return () => clearTimeout(timer)
    }, [state, queued, visual, t])

    useEffect(() => {
        if (state === 'idle' && lastSyncAt) {
            setNowMs(nowFn ? nowFn() : Date.now())
        }
    }, [state, lastSyncAt, nowFn])

    const tooltip = useMemo(() => {
        if (state === 'idle' && lastSyncAt) {
            return savedRelative(lastSyncAt, nowMs ?? lastSyncAt, t)
        }
        if (state === 'failed' && lastError) return t('setlistGrid.syncLastError', { error: lastError })
        if (state === 'conflict')
            return t('setlistGrid.syncConflictTooltip')
        if (state === 'offline')
            return t('setlistGrid.syncOfflineTooltip', { count: queued })
        return label
    }, [state, lastSyncAt, lastError, queued, label, nowMs, t])

    const reconciliation = useReconciliationModalOptional()
    const resolveConflictHandler =
        onResolveConflict ?? reconciliation?.openModal

    // Bug 2 fix (2026-05-12): the button labeled "Failed — retry" must
    // actually retry. The previous default discarded failed outbox rows
    // without applying their operation — a silent abandonment of the
    // user's edit that combined with server-priming to resurrect deleted
    // rows on reload. `retryFailedOutboxRows` resets failed rows to
    // pending + attempts=0 + scheduledFor=now and nudges the engine. A
    // separate, explicit "Discard" affordance can be added in the future
    // for a user-confirmed give-up path (see `discardFailedOutboxRows`).
    const defaultRetryFailed = async () => {
        await retryFailedOutboxRows()
    }
    const retryFailedHandler = onRetryFailed ?? defaultRetryFailed

    const { signOut } = useAuth()

    const Icon = visual.icon
    const isAction = state === 'failed' || state === 'conflict'
    const onClick =
        state === 'conflict' ? resolveConflictHandler : retryFailedHandler

    const Element = isAction ? 'button' : 'span'

    // v51-h01: surface lastError visibly below the indicator when 'failed'.
    // Tooltips don't fire on touch (phone/tablet), so Daniel couldn't see the
    // underlying SDK error from the editor's MobileEditSheet flow. Showing the
    // truncated message inline gives him actionable signal without forcing
    // him to open DevTools.
    const showInlineError = state === 'failed' && !!lastError
    const inlineError = showInlineError
        ? lastError!.length > 120
            ? lastError!.slice(0, 117) + '…'
            : lastError!
        : null

    return (
        <div className="inline-flex flex-col items-start gap-0.5">
            <Element
                role="status"
                aria-label={t('setlistGrid.syncStatusAria', { status: label })}
                title={tooltip}
                onClick={isAction ? onClick : undefined}
                disabled={isAction ? !onClick : undefined}
                type={isAction ? 'button' : undefined}
                className={cn(
                    'inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                    'transition-colors duration-200 motion-reduce:transition-none',
                    isAction
                        ? 'cursor-pointer hover:bg-destructive/10'
                        : 'cursor-default',
                )}
                data-state={state}
                data-testid="sync-indicator"
            >
                {/* Option B: one status glyph (the icon); the dot that sat
                    beside it is gone. */}
                <Icon
                    aria-hidden
                    className={cn(
                        'h-4 w-4',
                        visual.iconClass,
                        visual.spin && 'animate-spin motion-reduce:animate-none',
                    )}
                />
                {/* On a phone the settled "Saved" state is the icon alone (the
                    label stays for screen readers); every other state keeps
                    its words, because a warning is written, not coloured. */}
                <span className={state === 'idle' ? 'sr-only sm:not-sr-only' : undefined}>{label}</span>
            </Element>
            {inlineError && (
                <span
                    className="text-xs leading-tight text-destructive max-w-[280px] break-words"
                    data-testid="sync-indicator-error-detail"
                >
                    {inlineError}
                </span>
            )}
            {/* v52-03-01: auth-staleness recovery affordance. Only renders
                when lastError mentions permission/auth keywords (Track B Q2:
                auth-claim staleness is the plausible co-factor with phantom-
                row blocking on iPad). Avoids cargo-cult sign-out for
                unrelated errors. Neutral zinc color to read as a distinct
                action vs the red error description above. */}
            {showInlineError && AUTH_ERROR_PATTERN.test(lastError ?? '') && (
                <button
                    type="button"
                    onClick={() => signOut()}
                    data-testid="sync-indicator-signout-link"
                    className={cn(
                        'mt-1.5 inline-flex items-center self-start',
                        'text-[12px] font-medium underline underline-offset-2',
                        'text-muted-foreground hover:text-foreground',
                        'rounded-sm px-1 py-0.5',
                        // v50-05-04 ≥44px floor on touch — pad enough so the
                        // tap target meets the rule even though the visible
                        // text is small.
                        '[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:py-2',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        'transition-colors duration-200 motion-reduce:transition-none',
                    )}
                >
                    {t('setlistGrid.signOutAndBackIn')}
                </button>
            )}
            <span
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
                data-testid="sync-indicator-announce"
            >
                {announce}
            </span>
        </div>
    )
}
