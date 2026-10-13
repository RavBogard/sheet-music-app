import { format as dfFormat, formatDistance } from "date-fns"
import { intlLocaleOf, isPseudo, type UiLanguage } from "@/i18n/core"
import { pseudoize } from "@/i18n/pseudo"

/**
 * Multi-tenant phase 7 — date and number formatting in the tenant's language
 * and zone. Isomorphic and pure; `useFormat()` (client) and `getFormat()`
 * (server) bind it to the request's language and zone.
 *
 * Mechanical swap for the extraction lanes (see P7-I18N-GUIDE.md):
 *   d.toLocaleDateString('en-US' | undefined, opts)  → fmt.date(d, opts)
 *   d.toLocaleString('en-US' | undefined, opts)      → fmt.dateTime(d, opts)
 *   d.toLocaleTimeString('en-US' | undefined, opts)  → fmt.time(d, opts)
 *   n.toLocaleString('en-US')                        → fmt.number(n)
 *   formatDistanceToNow(d, { addSuffix: true })      → fmt.relative(d)
 *   format(d, 'PPP') / format(d, 'MMM d')  (date-fns) → fmt.pattern(d, 'PPP')
 *
 * For English with the runtime zone (CRC, BL) every function returns exactly
 * what the call it replaces returned (pinned in
 * src/__tests__/mt-p7/golden/date-formats.golden.test.ts).
 */

export type DateInput = Date | number | string | { toDate(): Date } | null | undefined

export interface FormatContext {
    lang: UiLanguage
    /** IANA zone; undefined = the runtime's zone (today's behaviour). */
    timeZone?: string
}

export function toDate(value: DateInput): Date | null {
    if (value === null || value === undefined) return null
    let d: Date
    if (value instanceof Date) d = value
    else if (typeof value === "number" || typeof value === "string") d = new Date(value)
    else if (typeof (value as { toDate?: unknown }).toDate === "function") d = (value as { toDate(): Date }).toDate()
    else return null
    return Number.isNaN(d.getTime()) ? null : d
}

function withZone(opts: Intl.DateTimeFormatOptions | undefined, ctx: FormatContext): Intl.DateTimeFormatOptions {
    const o: Intl.DateTimeFormatOptions = { ...(opts ?? {}) }
    if (ctx.timeZone && o.timeZone === undefined) o.timeZone = ctx.timeZone
    return o
}

function mark(ctx: FormatContext, s: string): string {
    return isPseudo(ctx.lang) ? pseudoize(s) : s
}

/** `Date.prototype.toLocaleDateString` in the context's language and zone. "" for a missing/invalid date. */
export function formatDate(value: DateInput, opts: Intl.DateTimeFormatOptions | undefined, ctx: FormatContext): string {
    const d = toDate(value)
    return d ? mark(ctx, d.toLocaleDateString(intlLocaleOf(ctx.lang), withZone(opts, ctx))) : ""
}

/** `Date.prototype.toLocaleTimeString` equivalent. */
export function formatTime(value: DateInput, opts: Intl.DateTimeFormatOptions | undefined, ctx: FormatContext): string {
    const d = toDate(value)
    return d ? mark(ctx, d.toLocaleTimeString(intlLocaleOf(ctx.lang), withZone(opts, ctx))) : ""
}

/** `Date.prototype.toLocaleString` equivalent. */
export function formatDateTime(value: DateInput, opts: Intl.DateTimeFormatOptions | undefined, ctx: FormatContext): string {
    const d = toDate(value)
    return d ? mark(ctx, d.toLocaleString(intlLocaleOf(ctx.lang), withZone(opts, ctx))) : ""
}

/** `Number.prototype.toLocaleString` equivalent. */
export function formatNumber(n: number, opts: Intl.NumberFormatOptions | undefined, ctx: FormatContext): string {
    return mark(ctx, n.toLocaleString(intlLocaleOf(ctx.lang), opts))
}

/**
 * Relative time with a suffix, like date-fns `formatDistanceToNow(d, {
 * addSuffix: true })` ("3 days ago", "in about 1 hour"). English is date-fns
 * itself (identical text); other languages use Intl.RelativeTimeFormat with
 * the same buckets.
 */
export function formatRelative(value: DateInput, ctx: FormatContext, now: DateInput = Date.now()): string {
    const d = toDate(value)
    const base = toDate(now)
    if (!d || !base) return ""
    if (ctx.lang === "en") return formatDistance(d, base, { addSuffix: true })
    if (isPseudo(ctx.lang)) return pseudoize(formatDistance(d, base, { addSuffix: true }))
    const diffS = (d.getTime() - base.getTime()) / 1000
    const abs = Math.abs(diffS)
    const rtf = new Intl.RelativeTimeFormat(intlLocaleOf(ctx.lang), { numeric: "auto" })
    const sign = diffS < 0 ? -1 : 1
    const pick = (n: number, unit: Intl.RelativeTimeFormatUnit) => rtf.format(sign * Math.max(1, Math.round(n)), unit)
    if (abs < 30) return rtf.format(0, "second")
    if (abs < 45 * 60) return pick(abs / 60, "minute")
    if (abs < 24 * 3600) return pick(abs / 3600, "hour")
    if (abs < 30 * 86400) return pick(abs / 86400, "day")
    if (abs < 365 * 86400) return pick(abs / (30 * 86400), "month")
    return pick(abs / (365 * 86400), "year")
}

/** date-fns patterns in use today, and their Intl equivalent for other languages. */
const PATTERN_INTL: Record<string, Intl.DateTimeFormatOptions> = {
    PPP: { year: "numeric", month: "long", day: "numeric" },
    "MMM d": { month: "short", day: "numeric" },
    PP: { year: "numeric", month: "short", day: "numeric" },
    "EEE, MMM d": { weekday: "short", month: "short", day: "numeric" },
}

/**
 * A date-fns pattern. English: date-fns `format` (identical text, runtime
 * zone, as today). Other languages: the Intl equivalent in the context's zone
 * when the pattern is a known display pattern; machine patterns (yyyy-MM-dd…)
 * go through date-fns unchanged in every language.
 */
export function formatPattern(value: DateInput, pattern: string, ctx: FormatContext): string {
    const d = toDate(value)
    if (!d) return ""
    const intl = PATTERN_INTL[pattern]
    if (ctx.lang === "en" || !intl) return mark(ctx, dfFormat(d, pattern))
    return mark(ctx, d.toLocaleDateString(intlLocaleOf(ctx.lang), withZone(intl, ctx)))
}

export interface Formatter {
    lang: UiLanguage
    timeZone: string | undefined
    date(value: DateInput, opts?: Intl.DateTimeFormatOptions): string
    time(value: DateInput, opts?: Intl.DateTimeFormatOptions): string
    dateTime(value: DateInput, opts?: Intl.DateTimeFormatOptions): string
    number(n: number, opts?: Intl.NumberFormatOptions): string
    relative(value: DateInput, now?: DateInput): string
    pattern(value: DateInput, pattern: string): string
}

export function createFormatter(ctx: FormatContext): Formatter {
    return {
        lang: ctx.lang,
        timeZone: ctx.timeZone,
        date: (v, o) => formatDate(v, o, ctx),
        time: (v, o) => formatTime(v, o, ctx),
        dateTime: (v, o) => formatDateTime(v, o, ctx),
        number: (n, o) => formatNumber(n, o, ctx),
        relative: (v, now) => formatRelative(v, ctx, now),
        pattern: (v, p) => formatPattern(v, p, ctx),
    }
}
