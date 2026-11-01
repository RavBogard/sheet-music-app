'use client'

import { MapPin, Pencil } from 'lucide-react'

import { useT } from '@/i18n/client'
import type { Gig } from '@/lib/gig/model'
import { cn } from '@/lib/utils'

/** The gig's times as short phrases: "Load-in 17:00", "Soundcheck 18:30", "Show 20:00–23:00". */
export function useGigTimeParts(gig: Gig | null | undefined): string[] {
    const t = useT()
    if (!gig) return []
    const parts: string[] = []
    if (gig.loadIn) parts.push(t('gig.panelLoadIn', { time: gig.loadIn }))
    if (gig.soundcheck) parts.push(t('gig.panelSoundcheck', { time: gig.soundcheck }))
    if (gig.start && gig.end) parts.push(t('gig.panelShow', { start: gig.start, end: gig.end }))
    else if (gig.start) parts.push(t('gig.panelStart', { start: gig.start }))
    else if (gig.end) parts.push(t('gig.panelEnd', { end: gig.end }))
    return parts
}

/**
 * BET-5: the gig in one compact line under the setlist title, band tenants
 * only: venue and address, then the times. Tabular, quiet ink (DESIGN.md:
 * metadata is small and quiet). In the editor it carries one icon button that
 * opens the setlist details sheet, where the gig is edited; Perform shows the
 * line read-only.
 */
export function GigPanel({
    gig,
    onEdit,
    className,
}: {
    gig: Gig | null | undefined
    /** Editor only: opens the details sheet. Omitted on read-only surfaces. */
    onEdit?: () => void
    className?: string
}) {
    const t = useT()
    const place = [gig?.venue, gig?.address].filter((p): p is string => Boolean(p))
    const times = useGigTimeParts(gig)
    const empty = place.length === 0 && times.length === 0
    if (empty && !onEdit) return null

    return (
        <section
            aria-label={t('gig.panelLabel')}
            data-testid="gig-panel"
            className={cn('flex min-w-0 items-center gap-1', className)}
        >
            {empty ? (
                <button
                    type="button"
                    onClick={onEdit}
                    data-testid="gig-panel-add"
                    className={cn(
                        'inline-flex min-h-11 items-center gap-2 rounded-md -ms-2 px-2',
                        'text-sm font-semibold text-brand hover:bg-accent cursor-pointer',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
                    )}
                >
                    <MapPin aria-hidden className="h-4 w-4" />
                    {t('gig.panelEmpty')}
                </button>
            ) : (
                <>
                    <p className="tnum min-w-0 flex-1 text-sm font-medium text-muted-foreground">
                        {place.length > 0 ? (
                            <span data-testid="gig-panel-place" className="font-semibold text-foreground">
                                {place.join(' · ')}
                            </span>
                        ) : null}
                        {times.map((part, i) => (
                            <span key={i} data-testid="gig-panel-time">
                                {place.length > 0 || i > 0 ? <span aria-hidden="true"> · </span> : null}
                                <span className="whitespace-nowrap">{part}</span>
                            </span>
                        ))}
                    </p>
                    {onEdit ? (
                        <button
                            type="button"
                            onClick={onEdit}
                            aria-label={t('gig.panelEdit')}
                            data-testid="gig-panel-edit"
                            className={cn(
                                'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md cursor-pointer',
                                'text-muted-foreground hover:text-foreground hover:bg-accent',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
                            )}
                        >
                            <Pencil aria-hidden className="h-4 w-4" />
                        </button>
                    ) : null}
                </>
            )}
        </section>
    )
}
