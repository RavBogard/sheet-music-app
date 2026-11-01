'use client'

import { useT } from '@/i18n/client'
import { formatDuration } from '@/lib/gig/display'
import type { SetTotal } from '@/lib/gig/set-totals'
import { cn } from '@/lib/utils'

/**
 * BET-5: a set's running length in its section label row, shared by the
 * editor and Perform: "38:20 · target 45:00 · 2 untimed". Option B: small
 * quiet text beside the page range. Over the target the overrun is stated in
 * words ("3:20 over") in the caution colour, never carried by colour alone
 * (DESIGN.md, the Stated Warning Rule).
 */
export function SetTotalText({ total, className }: { total: SetTotal; className?: string }) {
    const t = useT()
    const over = total.overUnderSec !== undefined && total.overUnderSec > 0
    return (
        <span
            data-testid="set-total"
            data-over={over || undefined}
            className={cn('tnum inline-flex shrink-0 flex-wrap items-center justify-end gap-x-1 text-xs font-bold tracking-[0.02em] normal-case text-muted-foreground', className)}
        >
            <span className="sr-only">{t('gig.setTotalAria', { total: formatDuration(total.seconds) })}</span>
            <span aria-hidden="true">{formatDuration(total.seconds)}</span>
            {total.targetMinutes !== undefined ? (
                <span>
                    <span aria-hidden="true">· </span>
                    {t('gig.setTarget', { target: formatDuration(total.targetMinutes * 60) })}
                </span>
            ) : null}
            {over ? (
                <span data-testid="set-total-over" className="text-caution">
                    {t('gig.setOver', { amount: formatDuration(total.overUnderSec ?? 0) })}
                </span>
            ) : null}
            {total.untimed > 0 ? (
                <span data-testid="set-total-untimed" className="font-semibold">
                    <span aria-hidden="true">· </span>
                    {t('gig.setUntimed', { count: total.untimed })}
                </span>
            ) : null}
        </span>
    )
}
