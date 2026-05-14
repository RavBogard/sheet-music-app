// v70-07: pure helpers for the doc-import interview form. Parse a service date
// out of an uploaded filename, infer a service type from document keywords, and
// format a Date for an <input type="date">. No I/O, no framework deps — these
// are trivially unit-testable.

import type { Setlist } from '@/types/models'

export type ServiceTemplateType = NonNullable<Setlist['templateType']>
// 'shabbat_morning' | 'friday_night' | 'rosh_hashanah' | 'yom_kippur' | 'festival' | 'other'

/** Human-readable labels for the templateType select in the interview form. */
export const SERVICE_TYPE_LABELS: Record<ServiceTemplateType, string> = {
    shabbat_morning: 'Shabbat Morning',
    friday_night: 'Friday Night',
    rosh_hashanah: 'Rosh Hashanah',
    yom_kippur: 'Yom Kippur',
    festival: 'Festival',
    other: 'Other',
}

const MONTHS: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sept: 8, sep: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
}

/**
 * Parse a "Month Day" token out of a filename and return a Date in the current
 * year. Tolerates an ordinal suffix ("15th") and a separator between the month
 * and day. Returns null when no date-like token is found. The file extension is
 * stripped before parsing.
 *
 * e.g. "May 15th Shir Shabbat .docx" -> May 15 of the current year.
 */
export function suggestServiceDate(fileName: string): Date | null {
    const base = fileName.replace(/\.[^.]+$/, '')
    const match = base.match(
        /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s.\-]*(\d{1,2})(?:st|nd|rd|th)?\b/i,
    )
    if (!match) return null
    const month = MONTHS[match[1].toLowerCase()]
    const day = parseInt(match[2], 10)
    if (month === undefined || day < 1 || day > 31) return null
    const date = new Date(new Date().getFullYear(), month, day)
    // Reject calendar overflow (e.g. "Feb 30" rolling forward into March).
    if (date.getMonth() !== month || date.getDate() !== day) return null
    return date
}

/**
 * Infer a service type from document text by scanning for keywords. Checks the
 * most-specific cases first (named holidays, then the CRC-specific "Shir
 * Shabbat" Friday service, then generic Friday / Shabbat); falls back to
 * 'other' when nothing matches. The user confirms or changes this in the form.
 */
export function inferServiceType(text: string): ServiceTemplateType {
    const t = text.toLowerCase()
    if (t.includes('rosh hashanah') || t.includes('rosh hashana')) return 'rosh_hashanah'
    if (t.includes('yom kippur') || t.includes('kol nidre')) return 'yom_kippur'
    if (
        t.includes('sukkot') || t.includes('simchat torah') || t.includes('passover') ||
        t.includes('pesach') || t.includes('shavuot') || t.includes('purim') ||
        t.includes('hanukkah') || t.includes('chanukah') || t.includes('festival')
    ) {
        return 'festival'
    }
    // CRC's "Shir Shabbat" is a Friday-evening service.
    if (t.includes('shir shabbat')) return 'friday_night'
    if (t.includes('friday') || t.includes('erev shabbat') || t.includes('kabbalat shabbat')) {
        return 'friday_night'
    }
    if (t.includes('shabbat') || t.includes('saturday')) return 'shabbat_morning'
    return 'other'
}

/** Format a Date as the `yyyy-mm-dd` string an <input type="date"> expects. */
export function toDateInputValue(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}
