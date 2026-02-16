/**
 * Liturgical service templates for Reform Jewish worship.
 * 
 * Each template defines an ordered sequence of liturgical "slots."
 * Each slot has search queries that match files in the library by name/topic.
 * The template engine finds the best match for each slot and builds
 * a pre-populated setlist that the music director can review and adjust.
 */

import { DriveFile, SetlistTrack } from '@/types/models'
import { ServiceContext } from './liturgical-calendar'
import Fuse from 'fuse.js'

// ── Slot Definition ──

export interface TemplateSlot {
    /** Liturgical name displayed in the setlist */
    label: string
    /** Whether this is a section header (no file link) */
    isHeader?: boolean
    /** Search queries to find matching files, tried in order */
    queries: string[]
    /** Topic tags to match against enriched metadata */
    topics?: string[]
    /** If true, this slot should be filled with a Torah-portion-specific piece */
    parashaSpecific?: boolean
    /** If true, only include this slot on certain service types */
    onlyFor?: string[]
    /** If true, skip this slot if a holiday overrides it */
    skipOnHoliday?: boolean
}

// ── Template Definitions ──

export const FRIDAY_NIGHT_TEMPLATE: TemplateSlot[] = [
    { label: 'Candle Lighting', isHeader: false, queries: ['candle lighting', 'hadlakat nerot', 'candle bless'] },
    { label: 'Welcome / Opening', isHeader: true, queries: [] },
    { label: 'Hinei Mah Tov', queries: ['hinei mah tov', 'hine ma tov'] },
    { label: 'Shalom Aleichem', queries: ['shalom aleichem', 'shalom alechem'] },
    { label: 'L\'cha Dodi', queries: ['l\'cha dodi', 'lecha dodi', 'l\'chah dodi'] },
    { label: 'Bar\'chu', queries: ['barchu', 'bar\'chu', 'barechu'] },
    { label: 'Shema', queries: ['shema', 'sh\'ma'] },
    { label: 'V\'ahavta', queries: ['v\'ahavta', 'vahavta', 'veahavta'] },
    { label: 'Mi Chamocha', queries: ['mi chamocha', 'mi chamochah', 'who is like you'] },
    { label: 'Hashkiveinu', queries: ['hashkiveinu', 'hashkivenu'] },
    { label: 'Amidah / T\'filah', isHeader: true, queries: [] },
    { label: 'Oseh Shalom', queries: ['oseh shalom', 'osse shalom'] },
    { label: 'Torah Service', isHeader: true, queries: [], skipOnHoliday: false },
    { label: 'Aleinu', queries: ['aleinu', 'alenu'] },
    { label: 'Mourner\'s Kaddish', queries: ['mourner kaddish', 'kaddish yatom', 'kaddish'] },
    { label: 'Closing / Adon Olam', queries: ['adon olam', 'closing hymn'] },
]

export const SHABBAT_MORNING_TEMPLATE: TemplateSlot[] = [
    { label: 'Birchot HaShachar', isHeader: true, queries: [] },
    { label: 'Modeh Ani / Morning Blessings', queries: ['modeh ani', 'morning bless', 'nisim b\'chol'] },
    { label: 'P\'sukei D\'zimra', isHeader: true, queries: [] },
    { label: 'Ashrei', queries: ['ashrei', 'happy are they'] },
    { label: 'Psalm of the Day', queries: ['psalm', 'mizmor'] },
    { label: 'Nishmat', queries: ['nishmat', 'nishmat kol chai'] },
    { label: 'Bar\'chu', queries: ['barchu', 'bar\'chu', 'barechu'] },
    { label: 'Yotzeir Or', queries: ['yotzeir', 'yotzer or'] },
    { label: 'Shema', queries: ['shema', 'sh\'ma'] },
    { label: 'V\'ahavta', queries: ['v\'ahavta', 'vahavta', 'veahavta'] },
    { label: 'Mi Chamocha', queries: ['mi chamocha', 'mi chamochah'] },
    { label: 'Amidah / T\'filah', isHeader: true, queries: [] },
    { label: 'Torah Service', isHeader: true, queries: [] },
    { label: 'Ein Kamocha', queries: ['ein kamocha', 'en kamocha'] },
    { label: 'Avot / Torah Processional', queries: ['torah processional', 'avot', 'ki mitzion'] },
    { label: 'Torah Reading', isHeader: true, queries: [] },
    { label: 'Haftarah Blessing', queries: ['haftarah', 'haftorah bless'] },
    { label: 'Returning the Torah', queries: ['returning torah', 'eitz chaim', 'etz hayim', 'tree of life'] },
    { label: 'Sermon', isHeader: true, queries: [] },
    { label: 'Musaf / Additional Prayers', isHeader: true, queries: [] },
    { label: 'Aleinu', queries: ['aleinu', 'alenu'] },
    { label: 'Mourner\'s Kaddish', queries: ['mourner kaddish', 'kaddish yatom', 'kaddish'] },
    { label: 'Adon Olam / Ein Keloheinu', queries: ['adon olam', 'ein keloheinu', 'ain keloheinu'] },
]

// ── Template Registry ──

const TEMPLATES: Record<string, TemplateSlot[]> = {
    friday_night: FRIDAY_NIGHT_TEMPLATE,
    shabbat_morning: SHABBAT_MORNING_TEMPLATE,
}

/**
 * Get the appropriate template for a service type.
 * Returns null if no template exists for that type.
 */
export function getTemplate(serviceType: string): TemplateSlot[] | null {
    return TEMPLATES[serviceType] || null
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
 * @param context - Service context (date, parasha, holiday)
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

    for (const slot of template) {
        // Skip slots not meant for this service type
        if (slot.onlyFor && !slot.onlyFor.includes(context.type)) continue

        // Section headers become header tracks
        if (slot.isHeader) {
            let label = slot.label
            // Annotate Torah headers with parasha
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

        // Try to find a matching file
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
        shabbat_morning: 'Shabbat Morning',
        rosh_hashanah: 'Rosh Hashanah',
        yom_kippur: 'Yom Kippur',
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

    if (context.parasha && (context.type === 'friday_night' || context.type === 'shabbat_morning')) {
        parts.push(`Parashat ${context.parasha}`)
    }

    parts.push(dateStr)
    return parts.join(' — ')
}
