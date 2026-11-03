'use client'

import Link from 'next/link'

import { useT } from '@/i18n/client'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

export type SetlistMode = 'rehearse' | 'perform' | 'edit'

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** True when `eventDate` falls on today's date in this device's local time. Unknown dates are not "today". */
export function isEventToday(eventDate: unknown, now: Date = new Date()): boolean {
    if (!eventDate) return false
    const d = eventDate instanceof Date ? eventDate : new Date(String(eventDate))
    if (!Number.isFinite(d.getTime())) return false
    return dayKey(d) === dayKey(now)
}

/**
 * Which modes this viewer is offered, in the fixed order Rehearse, Perform,
 * Edit. Edit is for band leaders and admins. Rehearse is hidden on the
 * setlist's service day so nobody drifts off the band's chart mid-service.
 */
export function visibleModes(opts: { canEdit: boolean; eventDate: unknown; now?: Date }): SetlistMode[] {
    const modes: SetlistMode[] = []
    if (!isEventToday(opts.eventDate, opts.now)) modes.push('rehearse')
    modes.push('perform')
    if (opts.canEdit) modes.push('edit')
    return modes
}

const HREF: Record<SetlistMode, (id: string) => string> = {
    rehearse: (id) => `/rehearse/${id}`,
    perform: (id) => `/perform/setlist/${id}`,
    edit: (id) => `/setlists/${id}`,
}

/**
 * The Rehearse / Perform / Edit switch that sits in every setlist header.
 * Segments are 44px touch targets (iPad first); the current mode is a
 * non-link segment marked `aria-current="page"`.
 */
export function SetlistModeSwitch({
    setlistId,
    current,
    eventDate,
    className,
}: {
    setlistId: string
    current: SetlistMode
    eventDate: unknown
    className?: string
}) {
    const t = useT()
    const { isBandLeader, isAdmin } = useAuth()
    const modes = visibleModes({ canEdit: isBandLeader || isAdmin, eventDate })
    const label: Record<SetlistMode, string> = {
        rehearse: t('recordings.rehearse'),
        perform: t('recordings.modePerform'),
        edit: t('recordings.modeEdit'),
    }
    const seg =
        'inline-flex h-11 min-w-11 items-center justify-center px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-safe:transition-colors'
    return (
        <nav
            aria-label={t('recordings.modeSwitchAria')}
            data-testid="setlist-mode-switch"
            className={cn('inline-flex shrink-0 overflow-hidden rounded-md border border-input', className)}
        >
            {modes.map((m) =>
                m === current ? (
                    <span
                        key={m}
                        aria-current="page"
                        data-testid={`mode-${m}`}
                        className={cn(seg, 'bg-brand/15 text-brand')}
                    >
                        {label[m]}
                    </span>
                ) : (
                    <Link
                        key={m}
                        href={HREF[m](setlistId)}
                        data-testid={`mode-${m}`}
                        className={cn(seg, 'text-foreground hover:bg-accent')}
                    >
                        {label[m]}
                    </Link>
                ),
            )}
        </nav>
    )
}
