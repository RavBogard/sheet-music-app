'use client'

import Link from 'next/link'

import { useT } from '@/i18n/client'
import { useAuth } from '@/lib/auth-context'
import { useOrg } from '@/lib/org/org-context'
import { DEFAULT_ORG_ID, coerceOrgId } from '@/lib/org/registry'
import type { OrgId } from '@/lib/org/types'
import { eventDayOf } from '@/lib/performance/tonight'
import { cn } from '@/lib/utils'

export type SetlistMode = 'rehearse' | 'perform' | 'edit'

/**
 * True when `eventDate` (any timestamp shape: ISO or day string, ms, Date,
 * Firestore Timestamp) falls on today's date in the congregation's time zone.
 * Unknown dates are not "today".
 */
export function isEventToday(eventDate: unknown, org: OrgId = DEFAULT_ORG_ID, now: Date = new Date()): boolean {
    const day = eventDayOf(eventDate, org)
    return day !== null && day === eventDayOf(now.getTime(), org)
}

/**
 * Which modes this viewer is offered, in the fixed order Rehearse, Perform,
 * Edit. Edit is for band leaders and admins. Rehearse is always offered,
 * the service day included: people rehearse that day too (2026-11-06).
 */
export function visibleModes(opts: { canEdit: boolean; eventDate: unknown; org?: OrgId; now?: Date }): SetlistMode[] {
    const modes: SetlistMode[] = []
    modes.push('rehearse')
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
    setlistOrg,
    className,
}: {
    setlistId: string
    current: SetlistMode
    eventDate: unknown
    /** The setlist's own tenant. Edit needs the leader role in THIS tenant. */
    setlistOrg?: string | null
    className?: string
}) {
    const t = useT()
    const { isBandLeader, isAdmin } = useAuth()
    const siteOrg = useOrg()
    const org = setlistOrg ? coerceOrgId(setlistOrg) : siteOrg
    // The signed-in role is the member's role in the tenant this site is. On
    // another tenant's setlist it says nothing about standing there.
    const canEdit = (isBandLeader || isAdmin) && org === siteOrg
    const modes = visibleModes({ canEdit, eventDate, org })
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
