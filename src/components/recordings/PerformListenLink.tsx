'use client'

import { AudioLines } from 'lucide-react'
import Link from 'next/link'

import { useFeaturedBySong } from '@/components/recordings/useFeaturedBySong'
import { useT } from '@/i18n/client'

const TZ = 'America/Chicago'
const dayKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** True when eventDate falls on today's date in congregation time. Unknown dates are not "today". */
export function isServiceDayToday(eventDate: unknown, now: Date = new Date()): boolean {
    if (!eventDate) return false
    const d = eventDate instanceof Date ? eventDate : new Date(String(eventDate))
    if (!Number.isFinite(d.getTime())) return false
    return dayKey(d) === dayKey(now)
}

/**
 * Secondary link from the Perform setlist head to the quiet Listen page. Only a
 * link: no audio and no player here. Hidden on the service day itself so nobody
 * taps away mid-service, and hidden when no song in the setlist has a take.
 */
export function PerformListenLink({
    setlistId,
    songIds,
    eventDate,
}: {
    setlistId: string
    songIds: Array<string | undefined | null>
    eventDate: unknown
}) {
    const t = useT()
    const featured = useFeaturedBySong()
    const hasTake = songIds.some((id) => Boolean(id && featured[id]))
    if (!hasTake || isServiceDayToday(eventDate)) return null
    return (
        <Link
            href={`/rehearse/${setlistId}`}
            data-testid="perform-head-listen"
            className="touch-hit inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <AudioLines aria-hidden className="h-4 w-4" />
            <span>{t('recordings.rehearse')}</span>
        </Link>
    )
}
