"use client"

import { useMemo } from "react"
import { createFormatter, type Formatter } from "@/i18n/format"
import { useI18n } from "@/i18n/client"

/**
 * Dates and numbers in the UI language and tenant zone.
 *
 *   const fmt = useFormat()
 *   fmt.date(setlist.eventDate, { weekday: "short", month: "short", day: "numeric" })
 *
 * Its own module, not part of @/i18n/client: the formatter needs date-fns,
 * and every page imports @/i18n/client. Pages that never format a date
 * (/login) then don't download date-fns (login payload budget).
 */
export function useFormat(): Formatter {
    const { lang, timeZone } = useI18n()
    return useMemo(() => createFormatter({ lang, timeZone }), [lang, timeZone])
}

export type { Formatter }
