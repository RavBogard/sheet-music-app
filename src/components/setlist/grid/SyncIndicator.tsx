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
    label: (queued: number) => string
    announce: (queued: number) => string
    iconClass: string
    dotClass: string
    spin?: boolean
}

const VISUALS: Record<SyncState, VisualSpec> = {
    idle: {
        icon: Check,
        label: () => 'Saved',
        announce: () => 'Saved',
        iconClass: 'text-emerald-500',
        dotClass: 'bg-emerald-500',
    },
    dirty: {
        icon: CircleDashed,
        label: () => 'Editing…',
        announce: () => 'Editing',
        iconClass: 'text-muted-foreground',
        dotClass: 'bg-muted-foreground',
    },
    saving: {
        icon: Loader2,
        label: () => 'Saving…',
        announce: () => 'Saving',
        iconClass: 'text-indigo-400',
        dotClass: 'bg-indigo-400',
        spin: true,
    },
    conflict: {
        icon: AlertTriangle,
        label: () => 'Conflict — review',
        announce: () => 'Conflict, please review',
        iconClass: 'text-red-500',
        dotClass: 'bg-red-500',
    },
    failed: {
        icon: XCircle,
        label: () => 'Failed — retry',
        announce: () => 'Save failed',
        iconClass: 'text-red-500',
        dotClass: 'bg-red-500',
    },
    offline: {
        icon: CloudOff,
        label: (q) => (q > 0 ? `Offline — ${q} queued` : 'Offline'),
        announce: (q) =>
            q > 0
                ? `Offline, ${q} change${q === 1 ? '' : 's'} queued`
                : 'Offline',
        iconClass: 'text-amber-500',
        dotClass: 'bg-amber-500',
    },
}

function formatRelative(ms: number, nowMs: number): string {
    const diff = Math.max(0, Math.floor((nowMs - ms) / 1000))
    if (diff < 5) return 'just now'
    if (diff < 60) return `${diff}s ago`
    const mins = Math.floor(diff / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ago`
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
    const state = useSyncStatus((s) => s.state)
    const queued = useSyncStatus((s) => s.queued)
    const lastSyncAt = useSyncStatus((s) => s.lastSyncAt)
    const lastError = useSyncStatus((s) => s.lastError)
    const [announce, setAnnounce] = useState('')

    const visual = VISUALS[state]
    const label = visual.label(queued)

    useEffect(() => {
        // Empty then set so the live region re-announces identical text.
        setAnnounce('')
        const t = setTimeout(() => setAnnounce(visual.announce(queued)), 50)
        return () => clearTimeout(t)
    }, [state, queued, visual])

    const tooltip = useMemo(() => {
        if (state === 'idle' && lastSyncAt) {
            const now = nowFn ? nowFn() : Date.now()
            return `Saved ${formatRelative(lastSyncAt, now)}`
        }
        if (state === 'failed' && lastError) return `Last error: ${lastError}`
        if (state === 'conflict')
            return 'A remote change was rejected — review the differences before re-saving.'
        if (state === 'offline')
            return `${queued} change${queued === 1 ? '' : 's'} will sync when you’re back online.`
        return label
    }, [state, lastSyncAt, lastError, queued, label, nowFn])

    // v50-06-02: when no explicit `onResolveConflict` prop is passed (the
    // production path), fall back to the ReconciliationProvider context. The
    // optional hook returns null in non-editor contexts (perform view, tests
    // without a provider), in which case the conflict action button stays
    // disabled — same UX as 'failed' without an `onRetryFailed` handler.
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
                aria-label={`Sync status: ${label}`}
                title={tooltip}
                onClick={isAction ? onClick : undefined}
                disabled={isAction ? !onClick : undefined}
                type={isAction ? 'button' : undefined}
                className={cn(
                    'inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                    'transition-colors duration-200 motion-reduce:transition-none',
                    isAction
                        ? 'cursor-pointer hover:bg-red-500/10'
                        : 'cursor-default',
                )}
                data-state={state}
                data-testid="sync-indicator"
            >
                <span
                    aria-hidden
                    className={cn(
                        'inline-block h-2 w-2 rounded-full',
                        visual.dotClass,
                    )}
                />
                <Icon
                    aria-hidden
                    className={cn(
                        'h-4 w-4',
                        visual.iconClass,
                        visual.spin && 'animate-spin motion-reduce:animate-none',
                    )}
                />
                <span>{label}</span>
            </Element>
            {inlineError && (
                <span
                    className="text-[11px] leading-tight text-red-400/90 max-w-[280px] break-words"
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
                        'text-zinc-300 hover:text-white',
                        'rounded-sm px-1 py-0.5',
                        // v50-05-04 ≥44px floor on touch — pad enough so the
                        // tap target meets the rule even though the visible
                        // text is small.
                        '[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:py-2',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                        'transition-colors duration-200 motion-reduce:transition-none',
                    )}
                >
                    Sign out and back in
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
