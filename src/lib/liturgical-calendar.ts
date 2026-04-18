/**
 * Liturgical calendar utilities for the Jewish calendar.
 * 
 * Provides:
 * - Hebrew date conversion (reused from greeting.ts via Intl API)
 * - Torah portion (parasha) lookup via Hebcal API with static fallback
 * - Holiday detection and service type classification
 * - Next Shabbat computation
 */

// ── Hebrew Date (shared with greeting.ts) ──

export interface HebrewDate {
    day: number
    month: string
    year: string
    display: string
}

export function getHebrewDate(date: Date): HebrewDate {
    const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).formatToParts(date)

    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0')
    let month = parts.find(p => p.type === 'month')?.value || ''
    const year = parts.find(p => p.type === 'year')?.value || ''

    const monthNorm: Record<string, string> = {
        'Tishri': 'Tishrei', 'Heshvan': 'Cheshvan', 'Kislev': 'Kislev',
        'Tevet': 'Tevet', 'Shevat': 'Shevat', 'Adar I': 'Adar I',
        'Adar II': 'Adar II', 'Adar': 'Adar', 'Nisan': 'Nisan',
        'Iyyar': 'Iyar', 'Sivan': 'Sivan', 'Tamuz': 'Tammuz',
        'Av': 'Av', 'Elul': 'Elul',
    }
    month = monthNorm[month] || month

    return { day, month, year, display: `${day} ${month} ${year}` }
}

// ── Service Type Classification ──

export type ServiceType =
    | 'friday_night'
    | 'shabbat_morning'
    | 'rosh_hashanah'
    | 'yom_kippur'
    | 'sukkot'
    | 'simchat_torah'
    | 'hanukkah_shabbat'
    | 'purim'
    | 'passover'
    | 'shavuot'
    | 'regular'

export interface ServiceContext {
    type: ServiceType
    date: Date
    hebrewDate: HebrewDate
    parasha: string | null
    holiday: string | null
    isShabbat: boolean
    rabbi?: string
}

/**
 * Major holidays keyed by Hebrew month-day.
 * Returns the holiday name and associated service type.
 */
const HOLIDAYS: Record<string, { name: string; type: ServiceType }> = {
    'Tishrei-1': { name: 'Rosh Hashanah (Day 1)', type: 'rosh_hashanah' },
    'Tishrei-2': { name: 'Rosh Hashanah (Day 2)', type: 'rosh_hashanah' },
    'Tishrei-10': { name: 'Yom Kippur', type: 'yom_kippur' },
    'Tishrei-15': { name: 'Sukkot (Day 1)', type: 'sukkot' },
    'Tishrei-22': { name: 'Shemini Atzeret / Simchat Torah', type: 'simchat_torah' },
    'Nisan-15': { name: 'Passover (Day 1)', type: 'passover' },
    'Nisan-16': { name: 'Passover (Day 2)', type: 'passover' },
    'Nisan-21': { name: 'Passover (Day 7)', type: 'passover' },
    'Nisan-22': { name: 'Passover (Day 8)', type: 'passover' },
    'Sivan-6': { name: 'Shavuot', type: 'shavuot' },
    'Adar-14': { name: 'Purim', type: 'purim' },
    'Adar II-14': { name: 'Purim', type: 'purim' },
}

/**
 * Classify a date into a service type with full context.
 */
export function getServiceContext(date: Date): ServiceContext {
    const hDate = getHebrewDate(date)
    const dayOfWeek = date.getDay() // 0=Sun, 5=Fri, 6=Sat

    // Check holidays
    const hKey = `${hDate.month}-${hDate.day}`
    const holiday = HOLIDAYS[hKey] || null

    // Check Hanukkah range (25 Kislev – 2/3 Tevet)
    const isHanukkah = (
        (hDate.month === 'Kislev' && hDate.day >= 25) ||
        (hDate.month === 'Tevet' && hDate.day <= 3)
    )

    const isShabbat = dayOfWeek === 5 || dayOfWeek === 6

    let type: ServiceType = 'regular'
    if (holiday) {
        type = holiday.type
    } else if (isHanukkah && isShabbat) {
        type = 'hanukkah_shabbat'
    } else if (dayOfWeek === 5) {
        type = 'friday_night'
    } else if (dayOfWeek === 6) {
        type = 'shabbat_morning'
    }

    return {
        type,
        date,
        hebrewDate: hDate,
        parasha: null, // Filled async by getParasha()
        holiday: holiday?.name || (isHanukkah ? 'Hanukkah' : null),
        isShabbat,
    }
}

/**
 * Get the next upcoming Friday.
 */
export function getNextFriday(from?: Date): Date {
    const d = from ? new Date(from) : new Date()
    const dayOfWeek = d.getDay()
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 6
    d.setDate(d.getDate() + (daysUntilFriday === 0 && d.getHours() >= 20 ? 7 : daysUntilFriday))
    d.setHours(19, 0, 0, 0) // 7 PM Friday
    return d
}

/**
 * Get the next upcoming Saturday.
 */
export function getNextSaturday(from?: Date): Date {
    const d = from ? new Date(from) : new Date()
    const dayOfWeek = d.getDay()
    const daysUntilSat = dayOfWeek <= 6 ? 6 - dayOfWeek : 0
    d.setDate(d.getDate() + (daysUntilSat === 0 && d.getHours() >= 13 ? 7 : daysUntilSat))
    d.setHours(10, 0, 0, 0) // 10 AM Saturday
    return d
}

// ── Parasha Lookup via Hebcal API ──

const parashaCache: Map<string, string> = new Map()

/**
 * Fetch the Torah portion for a given date from Hebcal.
 * Caches results to avoid repeat API calls.
 * Returns null if API is unreachable (offline graceful degradation).
 */
export async function getParasha(date: Date): Promise<string | null> {
    const key = date.toISOString().split('T')[0]
    if (parashaCache.has(key)) return parashaCache.get(key)!

    try {
        // Hebcal Shabbat API — returns the parasha for the week containing this date
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        const url = `https://www.hebcal.com/shabbat?cfg=json&date=${y}-${m}-${d}&M=on&geo=none`

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4000)

        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timeout)

        if (!res.ok) return null
        const data = await res.json()

        // Find the parashat hashavua item
        const parasha = data.items?.find((item: { category: string }) =>
            item.category === 'parashat'
        )

        const name = parasha?.title?.replace('Parashat ', '') || null
        if (name) parashaCache.set(key, name)
        return name
    } catch {
        return null // Offline or API error — graceful degradation
    }
}

/**
 * Get full service context with parasha (async).
 */
export async function getFullServiceContext(date: Date): Promise<ServiceContext> {
    const ctx = getServiceContext(date)
    ctx.parasha = await getParasha(date)
    return ctx
}
