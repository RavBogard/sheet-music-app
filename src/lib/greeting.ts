import { DEFAULT_SHORT_NAME } from "@/lib/constants"
import { isPseudo, type T, type UiLanguage } from "@/i18n/core"
import { pseudoize } from "@/i18n/pseudo"
import { plainLang, plainT } from "@/i18n/plain"

/**
 * Contextual greeting generator with Hebrew calendar awareness.
 * Uses the browser/Node Intl API for Hebrew date conversion (zero dependencies).
 *
 * Priority: Holiday greeting > Shabbat greeting > Time-of-day greeting
 */

interface HebrewDate {
    day: number
    month: string
    year: string
    /** Formatted display string: "17 Adar I 5786" */
    display: string
}

export interface Greeting {
    /** The greeting text (e.g., "Shabbat Shalom" or "Good evening") */
    text: string
    /** Optional Hebrew date for subtle display */
    hebrewDate: string
    /** Whether this is a special occasion (holiday/shabbat) */
    isSpecial: boolean
    /** Atmosphere hint for UI theming */
    atmosphere: 'morning' | 'afternoon' | 'evening' | 'shabbat' | 'holiday'
}

/**
 * Get the Hebrew date for a given Date object.
 * Uses Intl.DateTimeFormat with the Hebrew calendar.
 */
function getHebrewDate(date: Date): HebrewDate {
    const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).formatToParts(date)

    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0')
    let month = parts.find(p => p.type === 'month')?.value || ''
    const year = parts.find(p => p.type === 'year')?.value || ''

    // Normalize month names for display
    const monthNormalization: Record<string, string> = {
        'Tishri': 'Tishrei',
        'Heshvan': 'Cheshvan',
        'Kislev': 'Kislev',
        'Tevet': 'Tevet',
        'Shevat': 'Shevat',
        'Adar I': 'Adar I',
        'Adar II': 'Adar II',
        'Adar': 'Adar',
        'Nisan': 'Nisan',
        'Iyyar': 'Iyar',
        'Sivan': 'Sivan',
        'Tamuz': 'Tammuz',
        'Av': 'Av',
        'Elul': 'Elul',
    }
    month = monthNormalization[month] || month

    return {
        day,
        month,
        year,
        display: `${day} ${month} ${year}`
    }
}

/**
 * Major Jewish holidays keyed by Hebrew month + day.
 * Returns the catalogue key of the greeting phrase if the date is a holiday.
 * Covers Reform-observed holidays (single day for most).
 */
function getHolidayGreeting(hDate: HebrewDate): string | null {
    const key = `${hDate.month}-${hDate.day}`

    const holidays: Record<string, string> = {
        // High Holidays
        'Tishrei-1': 'dashboard.greetingShanahTovah',
        'Tishrei-2': 'dashboard.greetingShanahTovah',
        'Tishrei-10': 'dashboard.greetingGmarChatimahTovah',

        // Sukkot
        'Tishrei-15': 'dashboard.greetingChagSameach',
        'Tishrei-16': 'dashboard.greetingChagSameach',
        'Tishrei-17': 'dashboard.greetingChagSameach',
        'Tishrei-18': 'dashboard.greetingChagSameach',
        'Tishrei-19': 'dashboard.greetingChagSameach',
        'Tishrei-20': 'dashboard.greetingChagSameach',
        'Tishrei-21': 'dashboard.greetingChagSameach',

        // Shemini Atzeret / Simchat Torah
        'Tishrei-22': 'dashboard.greetingChagSameach',

        // Hanukkah (25 Kislev - 2 or 3 Tevet)
        'Kislev-25': 'dashboard.greetingChagUrimSameach',
        'Kislev-26': 'dashboard.greetingChagUrimSameach',
        'Kislev-27': 'dashboard.greetingChagUrimSameach',
        'Kislev-28': 'dashboard.greetingChagUrimSameach',
        'Kislev-29': 'dashboard.greetingChagUrimSameach',
        'Kislev-30': 'dashboard.greetingChagUrimSameach',
        'Tevet-1': 'dashboard.greetingChagUrimSameach',
        'Tevet-2': 'dashboard.greetingChagUrimSameach',
        'Tevet-3': 'dashboard.greetingChagUrimSameach',

        // Purim (14 Adar; in leap years, Adar II)
        'Adar-14': 'dashboard.greetingChagPurimSameach',
        'Adar II-14': 'dashboard.greetingChagPurimSameach',

        // Passover (15-22 Nisan)
        'Nisan-15': 'dashboard.greetingChagPesachSameach',
        'Nisan-16': 'dashboard.greetingChagPesachSameach',
        'Nisan-17': 'dashboard.greetingChagPesachSameach',
        'Nisan-18': 'dashboard.greetingChagPesachSameach',
        'Nisan-19': 'dashboard.greetingChagPesachSameach',
        'Nisan-20': 'dashboard.greetingChagPesachSameach',
        'Nisan-21': 'dashboard.greetingChagPesachSameach',
        'Nisan-22': 'dashboard.greetingChagPesachSameach',

        // Shavuot (6 Sivan)
        'Sivan-6': 'dashboard.greetingChagSameach',
        'Sivan-7': 'dashboard.greetingChagSameach',
    }

    return holidays[key] || null
}

/**
 * Check if the current time falls within Shabbat.
 * Approximation: Friday 4:00 PM through Saturday 9:00 PM.
 * (Not astronomically precise, but right for greeting context.)
 */
export function isShabbatTime(date: Date): boolean {
    const day = date.getDay() // 0=Sun, 5=Fri, 6=Sat
    const hour = date.getHours()

    // Friday after 4 PM
    if (day === 5 && hour >= 16) return true

    // All day Saturday until 9 PM
    if (day === 6 && hour < 21) return true

    return false
}

/**
 * Get a time-of-day greeting (its catalogue key).
 */
function getTimeGreeting(date: Date): string {
    const hour = date.getHours()
    if (hour < 12) return 'dashboard.greetingGoodMorning'
    if (hour < 17) return 'dashboard.greetingGoodAfternoon'
    return 'dashboard.greetingGoodEvening'
}

/**
 * The Hebrew date line in the UI language. English (CRC, BL) keeps the
 * transliterated month names exactly as before; Hebrew asks Intl for the
 * Hebrew-calendar date in Hebrew (data, no catalogue text). Pseudo-locales
 * wrap each word of the English line (the dashboard renders the words in
 * separate spans) so the untranslated-text check sees it as handled.
 */
function hebrewDateDisplay(date: Date, hDate: HebrewDate, lang: UiLanguage): string {
    if (lang === 'he') {
        return new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
    }
    return isPseudo(lang) ? hDate.display.split(' ').map(pseudoize).join(' ') : hDate.display
}

/**
 * Words for the greeting: the translator and its language. Omitted = the
 * plain-code translator (the browser's active language; English on the
 * server, so server callers pass their request's `t` and `lang`).
 */
export interface GreetingI18n {
    t: T
    lang: UiLanguage
}

/**
 * Generate a contextual greeting.
 * 
 * @param name - User's display name (null for guests)
 * @param date - Override date for testing (defaults to now)
 */
export function getContextualGreeting(name: string | null, date?: Date, appName?: string, i18n?: GreetingI18n): Greeting {
    const now = date || new Date()
    const hDate = getHebrewDate(now)
    const t = i18n?.t ?? plainT()
    const lang = i18n?.lang ?? plainLang()
    const hebrewDate = hebrewDateDisplay(now, hDate, lang)
    const withName = (key: string) => {
        const greeting = t(key)
        return name ? t('dashboard.greetingWithName', { greeting, firstName: name }) : greeting
    }

    // 1. Check holidays first (highest priority)
    const holidayGreeting = getHolidayGreeting(hDate)
    if (holidayGreeting) {
        return {
            text: withName(holidayGreeting),
            hebrewDate,
            isSpecial: true,
            atmosphere: 'holiday'
        }
    }

    // 2. Check Shabbat
    if (isShabbatTime(now)) {
        return {
            text: withName('dashboard.greetingShabbatShalom'),
            hebrewDate,
            isSpecial: true,
            atmosphere: 'shabbat'
        }
    }

    // 3. Time-of-day fallback
    const timeGreeting = getTimeGreeting(now)
    const hour = now.getHours()
    const atmosphere = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
    return {
        text: name ? withName(timeGreeting) : t('dashboard.welcomeTo', { appName: appName || DEFAULT_SHORT_NAME }),
        hebrewDate,
        isSpecial: false,
        atmosphere
    }
}
