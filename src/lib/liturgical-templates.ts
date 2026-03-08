/**
 * Liturgical service templates for Reform Jewish worship.
 *
 * Each template defines an ordered sequence of liturgical "slots."
 * Each slot has search queries that match files in the library by name/topic.
 * The template engine finds the best match for each slot and builds
 * a pre-populated setlist that the music director can review and adjust.
 *
 * Template structure:
 * - 7 regular templates (full liturgical slot structures, 10+ slots)
 * - 9 holiday stubs (basic structures, 5-8 slots, refineable later)
 * - Rabbi variants via onlyFor conditionals on shared templates
 */

import { DriveFile, SetlistTrack, TrackType } from '@/types/models'
import { ServiceContext } from './liturgical-calendar'
import Fuse from 'fuse.js'

// ── Slot Definition ──

export interface TemplateSlot {
    /** Liturgical name displayed in the setlist */
    label: string
    /** Track type to generate (default: 'song') */
    type?: TrackType
    /** @deprecated Use type: 'header' instead. Kept for backward compat. */
    isHeader?: boolean
    /** Search queries to find matching files, tried in order */
    queries: string[]
    /** Topic tags to match against enriched metadata */
    topics?: string[]
    /** If true, this slot should be filled with a Torah-portion-specific piece */
    parashaSpecific?: boolean
    /** Only include this slot when context.rabbi matches one of these values */
    onlyFor?: string[]
    /** If true, skip this slot if a holiday overrides it */
    skipOnHoliday?: boolean
    /** Default performer for non-song items (e.g., "Rabbi", "Cantor", "Congregation") */
    defaultPerformer?: string
    /** Default estimated duration in minutes */
    estimatedMinutes?: number
    /** Default description text */
    description?: string
}

// ── Shared Slot Sequences ──
// Reusable building blocks to keep total template code DRY

const TORAH_SERVICE_SLOTS: TemplateSlot[] = [
    { label: 'Torah Service', type: 'header', queries: [] },
    { label: 'Ein Kamocha', type: 'song', queries: ['ein kamocha', 'en kamocha'] },
    { label: 'Avot / Torah Processional', type: 'song', queries: ['torah processional', 'avot', 'ki mitzion'] },
    { label: 'Torah Reading', type: 'reading', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 15 },
    { label: 'Haftarah Blessing', type: 'song', queries: ['haftarah', 'haftorah bless'] },
    { label: 'Returning the Torah', type: 'song', queries: ['returning torah', 'eitz chaim', 'etz hayim', 'tree of life'] },
]

const CLOSING_SLOTS: TemplateSlot[] = [
    { label: 'Aleinu', type: 'song', queries: ['aleinu', 'alenu'] },
    { label: 'Mourner\'s Kaddish', type: 'prayer', queries: [], defaultPerformer: 'Congregation', estimatedMinutes: 3 },
]

// ── Template Definitions ──

export const FRIDAY_NIGHT_TEMPLATE: TemplateSlot[] = [
    { label: 'Welcome & Announcements', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 3 },
    { label: 'Candle Lighting', type: 'song', queries: ['candle lighting', 'hadlakat nerot', 'candle bless'] },
    { label: 'Kabbalat Shabbat', type: 'header', queries: [] },
    { label: 'Hinei Mah Tov', type: 'song', queries: ['hinei mah tov', 'hine ma tov'] },
    { label: 'Shalom Aleichem', type: 'song', queries: ['shalom aleichem', 'shalom alechem'] },
    { label: 'L\'cha Dodi', type: 'song', queries: ['l\'cha dodi', 'lecha dodi', 'l\'chah dodi'] },
    // Rabbi Daniel/Karen: meditation moment before Bar'chu
    { label: 'Meditation Moment', type: 'prayer', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2, onlyFor: ['daniel_karen'], description: 'Guided breathing and intention setting' },
    // Rabbi Randy: different opening niggun
    { label: 'Opening Niggun', type: 'song', queries: ['niggun', 'opening niggun', 'wordless melody'], onlyFor: ['randy'] },
    { label: 'Bar\'chu', type: 'song', queries: ['barchu', 'bar\'chu', 'barechu'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    { label: 'V\'ahavta', type: 'song', queries: ['v\'ahavta', 'vahavta', 'veahavta'] },
    { label: 'Mi Chamocha', type: 'song', queries: ['mi chamocha', 'mi chamochah', 'who is like you'] },
    { label: 'Hashkiveinu', type: 'song', queries: ['hashkiveinu', 'hashkivenu'] },
    { label: 'T\'filah', type: 'header', queries: [] },
    { label: 'Silent Prayer', type: 'prayer', queries: [], defaultPerformer: 'Congregation', estimatedMinutes: 2 },
    { label: 'Oseh Shalom', type: 'song', queries: ['oseh shalom', 'osse shalom'] },
    { label: 'Torah Service', type: 'header', queries: [], skipOnHoliday: false },
    { label: 'Torah Reading', type: 'reading', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 10 },
    ...CLOSING_SLOTS,
    { label: 'Closing Song', type: 'song', queries: ['adon olam', 'closing hymn', 'ein keloheinu'] },
    { label: 'Kiddush', type: 'transition', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2, description: 'Blessing over wine' },
]

export const SHIR_SHABBAT_TEMPLATE: TemplateSlot[] = [
    { label: 'Welcome', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2 },
    { label: 'Candle Lighting', type: 'song', queries: ['candle lighting', 'hadlakat nerot'] },
    { label: 'Shir Shabbat', type: 'header', queries: [] },
    { label: 'Opening Song', type: 'song', queries: ['shabbat song', 'shabbat shalom', 'good shabbos'] },
    { label: 'Shalom Aleichem', type: 'song', queries: ['shalom aleichem', 'shalom alechem'] },
    { label: 'L\'cha Dodi', type: 'song', queries: ['l\'cha dodi', 'lecha dodi'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    { label: 'Mi Chamocha', type: 'song', queries: ['mi chamocha', 'mi chamochah'] },
    { label: 'Healing Prayer', type: 'song', queries: ['mi shebeirach', 'healing', 'refuah'] },
    { label: 'Oseh Shalom', type: 'song', queries: ['oseh shalom', 'osse shalom'] },
    ...CLOSING_SLOTS,
    { label: 'Closing Song', type: 'song', queries: ['adon olam', 'ein keloheinu', 'shir chadash'] },
    { label: 'Oneg', type: 'transition', queries: [], defaultPerformer: 'Congregation', estimatedMinutes: 2, description: 'Shabbat celebration' },
]

export const SHABBAT_MORNING_TEMPLATE: TemplateSlot[] = [
    { label: 'Birchot HaShachar', type: 'header', queries: [] },
    { label: 'Modeh Ani / Morning Blessings', type: 'song', queries: ['modeh ani', 'morning bless', 'nisim b\'chol'] },
    { label: 'P\'sukei D\'zimra', type: 'header', queries: [] },
    { label: 'Ashrei', type: 'song', queries: ['ashrei', 'happy are they'] },
    { label: 'Psalm of the Day', type: 'song', queries: ['psalm', 'mizmor'] },
    { label: 'Nishmat', type: 'song', queries: ['nishmat', 'nishmat kol chai'] },
    { label: 'Bar\'chu', type: 'song', queries: ['barchu', 'bar\'chu', 'barechu'] },
    { label: 'Yotzeir Or', type: 'song', queries: ['yotzeir', 'yotzer or'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    { label: 'V\'ahavta', type: 'song', queries: ['v\'ahavta', 'vahavta', 'veahavta'] },
    { label: 'Mi Chamocha', type: 'song', queries: ['mi chamocha', 'mi chamochah'] },
    { label: 'T\'filah', type: 'header', queries: [] },
    // Rabbi Daniel/Karen: extended silent meditation
    { label: 'Extended Meditation', type: 'prayer', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 3, onlyFor: ['daniel_karen'], description: 'Guided silent meditation with kavanah' },
    // Rabbi Randy: responsive reading
    { label: 'Responsive Reading', type: 'reading', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 3, onlyFor: ['randy'], description: 'Congregation participates in responsive text' },
    { label: 'Silent Prayer', type: 'prayer', queries: [], defaultPerformer: 'Congregation', estimatedMinutes: 2 },
    ...TORAH_SERVICE_SLOTS,
    { label: 'Sermon', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 15 },
    { label: 'Musaf', type: 'header', queries: [] },
    ...CLOSING_SLOTS,
    { label: 'Adon Olam / Ein Keloheinu', type: 'song', queries: ['adon olam', 'ein keloheinu', 'ain keloheinu'] },
    { label: 'Kiddush', type: 'transition', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2, description: 'Blessing over wine and challah' },
]

const BNEI_MITZVAH_CEREMONY_SLOTS: TemplateSlot[] = [
    { label: "B'nei Mitzvah Ceremony", type: 'header', queries: [] },
    { label: "B'nei Mitzvah Torah Reading", type: 'reading', queries: [], defaultPerformer: 'Student', estimatedMinutes: 10 },
    { label: 'Haftarah Reading', type: 'reading', queries: [], defaultPerformer: 'Student', estimatedMinutes: 8 },
    { label: "D'var Torah", type: 'note', queries: [], defaultPerformer: 'Student', estimatedMinutes: 8, description: "Student's Torah commentary" },
    { label: 'Parent Blessing', type: 'reading', queries: [], defaultPerformer: 'Parents', estimatedMinutes: 5, description: 'Parents address the student' },
]

export const BNEI_MITZVAH_SATURDAY_TEMPLATE: TemplateSlot[] = [
    { label: 'Birchot HaShachar', type: 'header', queries: [] },
    { label: 'Modeh Ani / Morning Blessings', type: 'song', queries: ['modeh ani', 'morning bless'] },
    { label: 'P\'sukei D\'zimra', type: 'header', queries: [] },
    { label: 'Ashrei', type: 'song', queries: ['ashrei', 'happy are they'] },
    { label: 'Psalm of the Day', type: 'song', queries: ['psalm', 'mizmor'] },
    { label: 'Bar\'chu', type: 'song', queries: ['barchu', 'bar\'chu', 'barechu'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    { label: 'V\'ahavta', type: 'song', queries: ['v\'ahavta', 'vahavta', 'veahavta'] },
    { label: 'Mi Chamocha', type: 'song', queries: ['mi chamocha', 'mi chamochah'] },
    { label: 'T\'filah', type: 'header', queries: [] },
    { label: 'Silent Prayer', type: 'prayer', queries: [], defaultPerformer: 'Congregation', estimatedMinutes: 2 },
    ...TORAH_SERVICE_SLOTS,
    ...BNEI_MITZVAH_CEREMONY_SLOTS,
    { label: 'Sermon', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 10 },
    { label: 'Musaf', type: 'header', queries: [] },
    ...CLOSING_SLOTS,
    { label: 'Adon Olam / Ein Keloheinu', type: 'song', queries: ['adon olam', 'ein keloheinu'] },
    { label: 'Kiddush', type: 'transition', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2, description: 'Blessing over wine and challah' },
]

export const HAVDALAH_BNEI_MITZVAH_TEMPLATE: TemplateSlot[] = [
    { label: 'Welcome', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2 },
    { label: 'Afternoon Service', type: 'header', queries: [] },
    { label: 'Ashrei', type: 'song', queries: ['ashrei', 'happy are they'] },
    { label: 'Torah Reading', type: 'reading', queries: [], defaultPerformer: 'Student', estimatedMinutes: 8 },
    ...BNEI_MITZVAH_CEREMONY_SLOTS,
    ...CLOSING_SLOTS,
    { label: 'Havdalah', type: 'header', queries: [] },
    { label: 'Eliahu HaNavi', type: 'song', queries: ['eliahu hanavi', 'elijah', 'eliahu'] },
    { label: 'Havdalah Blessings', type: 'song', queries: ['havdalah', 'havdala bless'] },
    { label: 'Shavua Tov', type: 'song', queries: ['shavua tov', 'good week'] },
]

// ── Holiday Stub Templates ──
// Marked as stubs — basic structures to be refined later

const ROSH_HASHANAH_EVENING_TEMPLATE: TemplateSlot[] = [
    { label: 'Welcome & Rosh Hashanah Greeting', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 3 },
    { label: 'Candle Lighting', type: 'song', queries: ['candle lighting', 'rosh hashanah candle'] },
    { label: 'Shehecheyanu', type: 'song', queries: ['shehecheyanu', 'shehechiyanu'] },
    { label: 'Bar\'chu', type: 'song', queries: ['barchu', 'bar\'chu'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    { label: 'Avinu Malkeinu', type: 'song', queries: ['avinu malkeinu', 'avinu malkenu'] },
    ...CLOSING_SLOTS,
    { label: 'Kiddush & Apples and Honey', type: 'transition', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 3, description: 'New Year blessings' },
]

const ROSH_HASHANAH_MORNING_TEMPLATE: TemplateSlot[] = [
    { label: 'Morning Blessings', type: 'header', queries: [] },
    { label: 'Modeh Ani', type: 'song', queries: ['modeh ani', 'morning bless'] },
    { label: 'Bar\'chu', type: 'song', queries: ['barchu', 'bar\'chu'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    { label: 'Shofar Service', type: 'header', queries: [] },
    { label: 'Shofar Blowing', type: 'reading', queries: [], defaultPerformer: 'Shofar Blower', estimatedMinutes: 10, description: 'Tekiah, Shevarim, Teruah' },
    { label: 'Avinu Malkeinu', type: 'song', queries: ['avinu malkeinu', 'avinu malkenu'] },
    ...TORAH_SERVICE_SLOTS,
    ...CLOSING_SLOTS,
]

const YOM_KIPPUR_KOL_NIDRE_TEMPLATE: TemplateSlot[] = [
    { label: 'Kol Nidre', type: 'header', queries: [] },
    { label: 'Kol Nidre Chant', type: 'song', queries: ['kol nidre', 'kol nidrei'] },
    { label: 'Bar\'chu', type: 'song', queries: ['barchu', 'bar\'chu'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    { label: 'Avinu Malkeinu', type: 'song', queries: ['avinu malkeinu', 'avinu malkenu'] },
    { label: 'Silent Confession', type: 'prayer', queries: [], defaultPerformer: 'Congregation', estimatedMinutes: 5 },
    ...CLOSING_SLOTS,
]

const YOM_KIPPUR_MORNING_TEMPLATE: TemplateSlot[] = [
    { label: 'Morning Blessings', type: 'header', queries: [] },
    { label: 'Modeh Ani', type: 'song', queries: ['modeh ani', 'morning bless'] },
    { label: 'Bar\'chu', type: 'song', queries: ['barchu', 'bar\'chu'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    ...TORAH_SERVICE_SLOTS,
    { label: 'Yizkor Memorial', type: 'reading', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 15, description: 'Memorial prayers for the departed' },
    ...CLOSING_SLOTS,
]

const YOM_KIPPUR_AFTERNOON_TEMPLATE: TemplateSlot[] = [
    { label: 'Afternoon Service', type: 'header', queries: [] },
    { label: 'Torah Reading', type: 'reading', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 10 },
    { label: 'Jonah Reading', type: 'reading', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 10, description: 'Book of Jonah' },
    { label: 'Neilah', type: 'header', queries: [] },
    { label: 'Neilah Opening', type: 'song', queries: ['neilah', 'open the gates'] },
    { label: 'Avinu Malkeinu', type: 'song', queries: ['avinu malkeinu', 'avinu malkenu'] },
    { label: 'Final Shofar', type: 'reading', queries: [], defaultPerformer: 'Shofar Blower', estimatedMinutes: 2, description: 'Tekiah Gedolah' },
    { label: 'L\'shanah HaBaah', type: 'song', queries: ['l\'shanah habaah', 'next year', 'l\'shana haba'] },
]

const SUKKOT_TEMPLATE: TemplateSlot[] = [
    { label: 'Welcome & Sukkot Greeting', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2 },
    { label: 'Candle Lighting', type: 'song', queries: ['candle lighting', 'sukkot candle'] },
    { label: 'Lulav & Etrog Blessing', type: 'reading', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 3, description: 'Waving the four species' },
    { label: 'Bar\'chu', type: 'song', queries: ['barchu', 'bar\'chu'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    ...CLOSING_SLOTS,
    { label: 'Kiddush in the Sukkah', type: 'transition', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 3, description: 'Blessings in the sukkah' },
]

const SIMCHAT_TORAH_TEMPLATE: TemplateSlot[] = [
    { label: 'Welcome', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2 },
    { label: 'Hakafot', type: 'header', queries: [] },
    { label: 'Sisu et Yerushalayim', type: 'song', queries: ['sisu', 'yerushalayim', 'rejoice'] },
    { label: 'Torah Processional', type: 'song', queries: ['torah processional', 'hakafot'] },
    { label: 'Torah Reading — End & Beginning', type: 'reading', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 10, description: 'Final and first Torah portions' },
    ...CLOSING_SLOTS,
    { label: 'Celebration', type: 'transition', queries: [], defaultPerformer: 'Congregation', estimatedMinutes: 5, description: 'Dancing and celebration' },
]

const PASSOVER_TEMPLATE: TemplateSlot[] = [
    { label: 'Welcome to Passover', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2 },
    { label: 'Candle Lighting', type: 'song', queries: ['candle lighting', 'pesach candle'] },
    { label: 'Shehecheyanu', type: 'song', queries: ['shehecheyanu', 'shehechiyanu'] },
    { label: 'Ma Nishtanah', type: 'song', queries: ['ma nishtanah', 'four questions', 'mah nishtanah'] },
    { label: 'Dayeinu', type: 'song', queries: ['dayeinu', 'dayenu'] },
    { label: 'Hallel', type: 'song', queries: ['hallel', 'halleluyah'] },
    ...CLOSING_SLOTS,
]

const SHAVUOT_TEMPLATE: TemplateSlot[] = [
    { label: 'Welcome to Shavuot', type: 'note', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 2 },
    { label: 'Candle Lighting', type: 'song', queries: ['candle lighting', 'shavuot candle'] },
    { label: 'Bar\'chu', type: 'song', queries: ['barchu', 'bar\'chu'] },
    { label: 'Shema', type: 'song', queries: ['shema', 'sh\'ma'] },
    { label: 'Ten Commandments Reading', type: 'reading', queries: [], defaultPerformer: 'Rabbi', estimatedMinutes: 10, description: 'Revelation at Sinai' },
    ...CLOSING_SLOTS,
]

// ── Template Registry ──

const TEMPLATES: Record<string, TemplateSlot[]> = {
    // Regular templates (7)
    friday_night: FRIDAY_NIGHT_TEMPLATE,
    shir_shabbat: SHIR_SHABBAT_TEMPLATE,
    shabbat_morning: SHABBAT_MORNING_TEMPLATE,
    bnei_mitzvah_saturday: BNEI_MITZVAH_SATURDAY_TEMPLATE,
    havdalah_bnei_mitzvah: HAVDALAH_BNEI_MITZVAH_TEMPLATE,
    // Holiday stubs (9)
    rosh_hashanah_evening: ROSH_HASHANAH_EVENING_TEMPLATE,
    rosh_hashanah_morning: ROSH_HASHANAH_MORNING_TEMPLATE,
    yom_kippur_kol_nidre: YOM_KIPPUR_KOL_NIDRE_TEMPLATE,
    yom_kippur_morning: YOM_KIPPUR_MORNING_TEMPLATE,
    yom_kippur_afternoon: YOM_KIPPUR_AFTERNOON_TEMPLATE,
    sukkot: SUKKOT_TEMPLATE,
    simchat_torah: SIMCHAT_TORAH_TEMPLATE,
    passover: PASSOVER_TEMPLATE,
    shavuot: SHAVUOT_TEMPLATE,
}

/**
 * Get the appropriate template for a service type.
 * If customTemplates contains an override for this key, use that instead.
 * Returns null if no template exists for that type.
 */
export function getTemplate(
    serviceType: string,
    customTemplates?: Record<string, TemplateSlot[]>,
): TemplateSlot[] | null {
    if (customTemplates?.[serviceType]) return customTemplates[serviceType]
    return TEMPLATES[serviceType] || null
}

/**
 * Get the hardcoded default template (ignores any custom overrides).
 */
export function getDefaultTemplate(serviceType: string): TemplateSlot[] | null {
    return TEMPLATES[serviceType] || null
}

/**
 * Get all available template keys for the template picker UI.
 */
export function getAllTemplateKeys(): string[] {
    return Object.keys(TEMPLATES)
}

/**
 * Template metadata for the template picker UI.
 */
export const TEMPLATE_LABELS: Record<string, { label: string; category: 'regular' | 'holiday'; slotCount: number }> = {
    friday_night: { label: 'Friday Night', category: 'regular', slotCount: FRIDAY_NIGHT_TEMPLATE.length },
    shir_shabbat: { label: 'Shir Shabbat', category: 'regular', slotCount: SHIR_SHABBAT_TEMPLATE.length },
    shabbat_morning: { label: 'Shabbat Morning', category: 'regular', slotCount: SHABBAT_MORNING_TEMPLATE.length },
    bnei_mitzvah_saturday: { label: "B'nei Mitzvah Saturday", category: 'regular', slotCount: BNEI_MITZVAH_SATURDAY_TEMPLATE.length },
    havdalah_bnei_mitzvah: { label: "Havdalah B'nei Mitzvah", category: 'regular', slotCount: HAVDALAH_BNEI_MITZVAH_TEMPLATE.length },
    rosh_hashanah_evening: { label: 'Rosh Hashanah Evening', category: 'holiday', slotCount: ROSH_HASHANAH_EVENING_TEMPLATE.length },
    rosh_hashanah_morning: { label: 'Rosh Hashanah Morning', category: 'holiday', slotCount: ROSH_HASHANAH_MORNING_TEMPLATE.length },
    yom_kippur_kol_nidre: { label: 'Yom Kippur Kol Nidre', category: 'holiday', slotCount: YOM_KIPPUR_KOL_NIDRE_TEMPLATE.length },
    yom_kippur_morning: { label: 'Yom Kippur Morning', category: 'holiday', slotCount: YOM_KIPPUR_MORNING_TEMPLATE.length },
    yom_kippur_afternoon: { label: 'Yom Kippur Afternoon/Neilah', category: 'holiday', slotCount: YOM_KIPPUR_AFTERNOON_TEMPLATE.length },
    sukkot: { label: 'Sukkot', category: 'holiday', slotCount: SUKKOT_TEMPLATE.length },
    simchat_torah: { label: 'Simchat Torah', category: 'holiday', slotCount: SIMCHAT_TORAH_TEMPLATE.length },
    passover: { label: 'Passover', category: 'holiday', slotCount: PASSOVER_TEMPLATE.length },
    shavuot: { label: 'Shavuot', category: 'holiday', slotCount: SHAVUOT_TEMPLATE.length },
}

// ── Template Engine: Match Slots to Library Files ──

const FUSE_OPTIONS = {
    keys: ['name'],
    threshold: 0.4,
    distance: 150,
    includeScore: true,
}

/**
 * Search the library for the best file match for a slot.
 * Tries each query in order; returns the first good match.
 */
function findBestMatch(
    slot: TemplateSlot,
    fuse: Fuse<DriveFile>,
    usedFileIds: Set<string>
): DriveFile | null {
    for (const query of slot.queries) {
        const results = fuse.search(query)
        for (const result of results) {
            // Skip folders and already-used files
            if (result.item.mimeType.includes('folder')) continue
            if (usedFileIds.has(result.item.id)) continue

            // Accept if score is reasonable (lower is better in Fuse.js)
            if (result.score !== undefined && result.score <= 0.5) {
                return result.item
            }
        }
    }

    // Also try matching against metadata topics if available
    if (slot.topics) {
        for (const topic of slot.topics) {
            const results = fuse.search(topic)
            for (const result of results) {
                if (result.item.mimeType.includes('folder')) continue
                if (usedFileIds.has(result.item.id)) continue
                if (result.score !== undefined && result.score <= 0.4) {
                    return result.item
                }
            }
        }
    }

    return null
}

/**
 * Build a complete setlist from a template by matching slots to library files.
 *
 * @param template - The liturgical template slots
 * @param library - All files in the library
 * @param context - Service context (date, parasha, holiday, rabbi)
 * @returns Pre-populated tracks ready for setlist creation
 */
export function buildSetlistFromTemplate(
    template: TemplateSlot[],
    library: DriveFile[],
    context: ServiceContext
): SetlistTrack[] {
    const fuse = new Fuse(library, FUSE_OPTIONS)
    const usedFileIds = new Set<string>()
    const tracks: SetlistTrack[] = []

    // Extract rabbi from context (may be on extended context)
    const rabbi = (context as any).rabbi as string | undefined

    for (const slot of template) {
        // Rabbi-variant filtering: skip slots not meant for this rabbi
        if (slot.onlyFor && rabbi && !slot.onlyFor.includes(rabbi)) continue
        // If no rabbi set, include all slots (show the full template)

        // Determine effective type: new `type` field takes precedence over legacy `isHeader`
        const effectiveType: TrackType = slot.type || (slot.isHeader ? 'header' : 'song')

        // Headers become header tracks
        if (effectiveType === 'header') {
            let label = slot.label
            if (slot.label.includes('Torah') && context.parasha) {
                label = `${slot.label} — Parashat ${context.parasha}`
            }
            tracks.push({
                id: crypto.randomUUID(),
                title: label,
                type: 'header',
            })
            continue
        }

        // Non-song service flow items (reading, prayer, transition, note)
        if (effectiveType !== 'song') {
            tracks.push({
                id: crypto.randomUUID(),
                title: slot.label,
                type: effectiveType,
                performer: slot.defaultPerformer,
                estimatedMinutes: slot.estimatedMinutes,
                description: slot.description || (
                    // Auto-annotate Torah readings with parasha
                    effectiveType === 'reading' && slot.label.includes('Torah') && context.parasha
                        ? `Parashat ${context.parasha}`
                        : undefined
                ),
            })
            continue
        }

        // Songs — try to find a matching file
        const match = findBestMatch(slot, fuse, usedFileIds)

        if (match) {
            usedFileIds.add(match.id)
            const cleanName = match.name.replace(/\.[^/.]+$/, '')
            tracks.push({
                id: crypto.randomUUID(),
                title: cleanName,
                fileId: match.id,
                fileName: match.name,
                key: match.metadata?.key,
                type: 'song',
            })
        } else {
            // No match — create a placeholder track with the liturgical name
            tracks.push({
                id: crypto.randomUUID(),
                title: `${slot.label} (unmatched)`,
                type: 'song',
                notes: `No matching file found. Search for: ${slot.queries.join(', ')}`,
            })
        }
    }

    return tracks
}

/**
 * Generate a setlist name from the service context.
 * e.g., "Shabbat Morning — Parashat Ki Tisa — February 21"
 */
export function generateSetlistName(context: ServiceContext): string {
    const dateStr = context.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

    const typeLabels: Record<string, string> = {
        friday_night: 'Friday Night',
        shir_shabbat: 'Shir Shabbat',
        shabbat_morning: 'Shabbat Morning',
        bnei_mitzvah_saturday: "B'nei Mitzvah Saturday",
        havdalah_bnei_mitzvah: "Havdalah B'nei Mitzvah",
        rosh_hashanah: 'Rosh Hashanah',
        rosh_hashanah_evening: 'Rosh Hashanah Evening',
        rosh_hashanah_morning: 'Rosh Hashanah Morning',
        yom_kippur: 'Yom Kippur',
        yom_kippur_kol_nidre: 'Yom Kippur Kol Nidre',
        yom_kippur_morning: 'Yom Kippur Morning',
        yom_kippur_afternoon: 'Yom Kippur Afternoon',
        sukkot: 'Sukkot',
        simchat_torah: 'Simchat Torah',
        hanukkah_shabbat: 'Hanukkah Shabbat',
        passover: 'Passover',
        shavuot: 'Shavuot',
        purim: 'Purim',
        regular: 'Service',
    }

    const label = typeLabels[context.type] || 'Service'
    const parts = [label]

    if (context.parasha && (context.type === 'friday_night' || context.type === 'shabbat_morning' || (context.type as string) === 'shir_shabbat')) {
        parts.push(`Parashat ${context.parasha}`)
    }

    parts.push(dateStr)
    return parts.join(' — ')
}
