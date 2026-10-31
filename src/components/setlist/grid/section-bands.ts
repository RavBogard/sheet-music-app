/** The fields the bands read. Editor rows (LocalTrack) and Perform rows (SetlistTrack) both fit. */
export interface BandRow {
    id?: string
    type?: string
    title?: string
    liturgyRef?: unknown
}

/**
 * Web refresh (blend E): section header rows draw as full-hue bands that
 * carry a running head and the printed-page range of the rows under them.
 *
 * Pure, display-only. It reads the rows in the author's order and never
 * reorders, inserts or drops one.
 */

export type SectionHue = 'green' | 'oxblood' | 'ochre' | 'blue'

/** Hue order used when a header's name is not a known section. */
export const HUE_CYCLE: readonly SectionHue[] = ['green', 'oxblood', 'ochre', 'blue']

/** Full-hue band classes. Each hue carries its own ink. Shared by the editor and Perform. */
export const SECTION_BAND_CLASS: Record<SectionHue, string> = {
    green: 'bg-section-green text-section-green-foreground',
    oxblood: 'bg-section-oxblood text-section-oxblood-foreground',
    ochre: 'bg-section-ochre text-section-ochre-foreground',
    blue: 'bg-section-blue text-section-blue-foreground',
}

export interface SectionBand {
    hue: SectionHue
    /** Lowest and highest printed page among the rows in this section. */
    folioFrom?: number
    folioTo?: number
}

export function isSectionRow(track: { type?: unknown }): boolean {
    const type = track.type as string | undefined
    return type === 'header' || type === 'section'
}

function normalize(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[‘’'`’]/g, '')
        .trim()
}

/**
 * Known service sections keep the same hue from week to week, whatever
 * their position. Anything else (and every Hebrew-named header) cycles by
 * header order.
 */
export function hueForSectionName(name: string): SectionHue | null {
    const n = normalize(name)
    if (!n) return null
    const set = /^set\s*(\d+)\b/.exec(n)
    if (set) return HUE_CYCLE[Math.max(0, Number(set[1]) - 1) % HUE_CYCLE.length]
    if (/kabbalat|kabbalas|kabalat/.test(n)) return 'green'
    if (/maariv|arvit|evening service/.test(n)) return 'blue'
    if (/torah/.test(n)) return 'oxblood'
    if (/shacharit|shacharis|morning service|morning blessings|birchot|birkot|psukei|pesukei/.test(n)) return 'ochre'
    if (/conclud|closing|aleinu/.test(n)) return 'green'
    return null
}

/** Row id → band, for every section header row in `tracks`. */
export function sectionBands(tracks: readonly BandRow[]): Record<string, SectionBand> {
    const out: Record<string, SectionBand> = {}
    let headerIndex = 0
    let current: SectionBand | null = null
    for (const track of tracks) {
        if (isSectionRow(track)) {
            const hue =
                hueForSectionName(String(track.title ?? '')) ??
                HUE_CYCLE[headerIndex % HUE_CYCLE.length]
            headerIndex += 1
            current = { hue }
            if (track.id) out[track.id] = current
            continue
        }
        const folio = (track.liturgyRef as { folio?: unknown } | undefined)?.folio
        if (current && typeof folio === 'number' && Number.isFinite(folio)) {
            current.folioFrom = current.folioFrom === undefined ? folio : Math.min(current.folioFrom, folio)
            current.folioTo = current.folioTo === undefined ? folio : Math.max(current.folioTo, folio)
        }
    }
    return out
}
