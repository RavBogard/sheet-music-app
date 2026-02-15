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

interface Greeting {
    /** The greeting text (e.g., "Shabbat Shalom" or "Good evening") */
    text: string
    /** Optional Hebrew date for subtle display */
    hebrewDate: string
    /** Whether this is a special occasion (holiday/shabbat) */
    isSpecial: boolean
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
 * Returns a greeting phrase if the date is a holiday.
 * Covers Reform-observed holidays (single day for most).
 */
function getHolidayGreeting(hDate: HebrewDate): string | null {
    const key = `${hDate.month}-${hDate.day}`

    const holidays: Record<string, string> = {
        // High Holidays
        'Tishrei-1': 'Shanah Tovah',
        'Tishrei-2': 'Shanah Tovah',
        'Tishrei-10': 'G\'mar Chatimah Tovah',

        // Sukkot
        'Tishrei-15': 'Chag Sameach',
        'Tishrei-16': 'Chag Sameach',
        'Tishrei-17': 'Chag Sameach',
        'Tishrei-18': 'Chag Sameach',
        'Tishrei-19': 'Chag Sameach',
        'Tishrei-20': 'Chag Sameach',
        'Tishrei-21': 'Chag Sameach',

        // Shemini Atzeret / Simchat Torah
        'Tishrei-22': 'Chag Sameach',

        // Hanukkah (25 Kislev - 2 or 3 Tevet)
        'Kislev-25': 'Chag Urim Sameach',
        'Kislev-26': 'Chag Urim Sameach',
        'Kislev-27': 'Chag Urim Sameach',
        'Kislev-28': 'Chag Urim Sameach',
        'Kislev-29': 'Chag Urim Sameach',
        'Kislev-30': 'Chag Urim Sameach',
        'Tevet-1': 'Chag Urim Sameach',
        'Tevet-2': 'Chag Urim Sameach',
        'Tevet-3': 'Chag Urim Sameach',

        // Purim (14 Adar; in leap years, Adar II)
        'Adar-14': 'Chag Purim Sameach',
        'Adar II-14': 'Chag Purim Sameach',

        // Passover (15-22 Nisan)
        'Nisan-15': 'Chag Pesach Sameach',
        'Nisan-16': 'Chag Pesach Sameach',
        'Nisan-17': 'Chag Pesach Sameach',
        'Nisan-18': 'Chag Pesach Sameach',
        'Nisan-19': 'Chag Pesach Sameach',
        'Nisan-20': 'Chag Pesach Sameach',
        'Nisan-21': 'Chag Pesach Sameach',
        'Nisan-22': 'Chag Pesach Sameach',

        // Shavuot (6 Sivan)
        'Sivan-6': 'Chag Sameach',
        'Sivan-7': 'Chag Sameach',
    }

    return holidays[key] || null
}

/**
 * Check if the current time falls within Shabbat.
 * Approximation: Friday 4:00 PM through Saturday 9:00 PM.
 * (Not astronomically precise, but right for greeting context.)
 */
function isShabbatTime(date: Date): boolean {
    const day = date.getDay() // 0=Sun, 5=Fri, 6=Sat
    const hour = date.getHours()

    // Friday after 4 PM
    if (day === 5 && hour >= 16) return true

    // All day Saturday until 9 PM
    if (day === 6 && hour < 21) return true

    return false
}

/**
 * Get a time-of-day greeting.
 */
function getTimeGreeting(date: Date): string {
    const hour = date.getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
}

/**
 * Generate a contextual greeting.
 * 
 * @param name - User's display name (null for guests)
 * @param date - Override date for testing (defaults to now)
 */
export function getContextualGreeting(name: string | null, date?: Date): Greeting {
    const now = date || new Date()
    const hDate = getHebrewDate(now)

    // 1. Check holidays first (highest priority)
    const holidayGreeting = getHolidayGreeting(hDate)
    if (holidayGreeting) {
        return {
            text: name ? `${holidayGreeting}, ${name}` : holidayGreeting,
            hebrewDate: hDate.display,
            isSpecial: true
        }
    }

    // 2. Check Shabbat
    if (isShabbatTime(now)) {
        return {
            text: name ? `Shabbat Shalom, ${name}` : 'Shabbat Shalom',
            hebrewDate: hDate.display,
            isSpecial: true
        }
    }

    // 3. Time-of-day fallback
    const timeGreeting = getTimeGreeting(now)
    return {
        text: name ? `${timeGreeting}, ${name}` : 'Welcome to CRC Music',
        hebrewDate: hDate.display,
        isSpecial: false
    }
}
