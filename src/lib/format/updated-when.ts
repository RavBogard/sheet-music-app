import type { DateInput, Formatter } from '@/i18n/format'
import { toDate } from '@/i18n/format'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * The "when" in "Updated {when}": an exact weekday and time inside the last
 * 7 days ("Fri 4:12pm"), otherwise a short date ("Sep 26"). Uses the
 * formatter's tenant time zone and language; the year appears only when it
 * differs from the current one.
 */
export function formatUpdatedWhen(fmt: Formatter, value: DateInput, now: DateInput = Date.now()): string {
    const d = toDate(value)
    const base = toDate(now)
    if (!d || !base) return ''
    if (Math.abs(base.getTime() - d.getTime()) < WEEK_MS) {
        const day = fmt.date(d, { weekday: 'short' })
        let time = fmt.time(d, { hour: 'numeric', minute: '2-digit' })
        if (fmt.lang === 'en') time = time.replace(/\s*([AP])M$/i, (_m, c: string) => `${c.toLowerCase()}m`)
        return `${day} ${time}`
    }
    const sameYear = fmt.date(d, { year: 'numeric' }) === fmt.date(base, { year: 'numeric' })
    return fmt.date(d, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}
