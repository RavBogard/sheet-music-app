'use client'

import { useT } from '@/i18n/client'
import { formatDuration } from '@/lib/gig/display'
import type { SetTotal } from '@/lib/gig/set-totals'
import { cn } from '@/lib/utils'

/**
 * BET-5: a set's running length on its section band, shared by the editor and
 * Perform: "38:20 · target 45:00 · 2 untimed". Quiet in the band's own ink.
 * Over the target the overrun is stated in words ("3:20 over") on a paper
 * inset in the caution colour, so it reads on every band hue and is never
 * carried by colour alone (DESIGN.md, the Stated Warning Rule).
 */
export function SetTotalText({ total, className }: { total: SetTotal; className?: string }) {
    const t = useT()
    const over = total.overUnderSec !== undefined && total.overUnderSec > 0
    return (
        <span
            data-testid="set-total"
            data-over={over || undefined}
            className={cn('tnum inline-flex shrink-0 flex-wrap items-center justify-end gap-x-1 text-[13px] font-bold tracking-[0.02em] normal-case', className)}
        >
            <span className="sr-only">{t('gig.setTotalAria', { total: formatDuration(total.seconds) })}</span>
            <span aria-hidden="true">{formatDuration(total.seconds)}</span>
            {total.targetMinutes !== undefined ? (
                <span className="opacity-90">
                    <span aria-hidden="true">· </span>
                    {t('gig.setTarget', { target: formatDuration(total.targetMinutes * 60) })}
                </span>
            ) : null}
            {over ? (
                <span data-testid="set-total-over" className="rounded-sm bg-card px-1 text-caution">
                    {t('gig.setOver', { amount: formatDuration(total.overUnderSec ?? 0) })}
                </span>
            ) : null}
            {total.untimed > 0 ? (
                <span data-testid="set-total-untimed" className="font-semibold opacity-90">
                    <span aria-hidden="true">· </span>
                    {t('gig.setUntimed', { count: total.untimed })}
                </span>
            ) : null}
        </span>
    )
}
