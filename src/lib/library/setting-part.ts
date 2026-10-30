import { STRIPPABLE_EXTENSION_RE, normalizeStem } from "@/lib/mcp/title-specificity"

/**
 * Setlist memory, release 1 — a chart's `setting` (whose melody or
 * arrangement: "Friedman", "trad", "Moshav") and instrument `part`
 * ("Bb", "Tenor Saxophone"), parsed from its title. `partGroup` ties every
 * instrument copy of one arrangement together: "Barchu (Walkdown) Eb" and
 * "Barchu (Walkdown)" share one group.
 *
 * Title parsing only — it names what the chart already says. It never
 * chooses a setting. A person's own edit (`settingSource: 'human'`) wins
 * over every recompute.
 */

/** Trailing instrument labels, longest first so "Clarinet in Bb" beats "Bb". */
const PART_LABELS = [
    "Bb",
    "Eb",
    "C",
    "Bass Clef",
    "Bass",
    "C Lead",
    "Alto Saxophone",
    "Tenor Saxophone",
    "Soprano Saxophone",
    "Clarinet in Bb",
    "Trumpet in Bb",
    "Flute",
    "Trombone",
    "Piano",
    "Vocals",
    "Guitar",
].sort((a, b) => b.length - a.length)

/**
 * Labels that are also ordinary words or keys ("All About That Bass", "in C").
 * They count as a part only after " - " or right after a parenthesised
 * clarifier: "Shema (Major) Bass", "Porter Haus - C".
 */
const SHORT_LABELS = new Set(["C", "Bass", "Piano", "Guitar", "Vocals", "Flute"])
/** The only labels that may follow the word "in". */
const IN_LABELS = new Set(["Clarinet in Bb", "Trumpet in Bb"])

const FORMAT_WORDS = new Set([
    "band format",
    "chords",
    "band chart",
    "lyrics",
    "lead sheet",
    "leadsheet",
    "full score",
    "score",
    "draft",
    "simpler",
    "compact",
    "licensed scan",
])

const KEY_RE = /^[A-G][#b]?m?$/

function stripExtension(title: string): string {
    return title.trim().replace(STRIPPABLE_EXTENSION_RE, "").trim()
}

export function parsePart(title: string): { baseTitle: string; part: string } | null {
    const t = stripExtension(title)
    for (const label of PART_LABELS) {
        if (!t.endsWith(label)) continue
        const before = t.slice(0, t.length - label.length)
        // The label must stand alone: preceded by whitespace or " - ".
        const m = /^(.*?\S)\s*(?:\s-\s*|\s)$/.exec(before)
        if (!m) continue
        const hyphenated = /\s-\s*$/.test(before)
        const baseTitle = m[1].replace(/\s+-$/, "").trim()
        if (!baseTitle) continue
        // "Ain't No Sunshine in C", "Song in Bb": a key, not a part.
        if (!IN_LABELS.has(label) && /(^|\s)in$/i.test(baseTitle)) continue
        if (SHORT_LABELS.has(label) && !hyphenated && !baseTitle.endsWith(")")) continue
        return { baseTitle, part: label }
    }
    return null
}

export function parseSetting(title: string): string | null {
    const t = parsePart(title)?.baseTitle ?? stripExtension(title)
    let raw: string | null = null
    const paren = /\(([^)]*)\)/.exec(t)
    if (paren && paren[1].trim()) {
        raw = paren[1]
    } else {
        const hyphen = /\s+-\s+(.+)$/.exec(t)
        if (hyphen) raw = hyphen[1]
    }
    if (raw === null) return null
    let setting = raw.trim()
    const comma = /^(.*?),\s*([A-G][#b]?m?)$/.exec(setting)
    if (comma) setting = comma[1].trim()
    if (!setting) return null
    if (KEY_RE.test(setting)) return null
    if (FORMAT_WORDS.has(setting.toLowerCase())) return null
    return setting
}

export function partGroupFor(title: string): string {
    return normalizeStem(parsePart(title)?.baseTitle ?? stripExtension(title))
}

export interface SettingPartFields {
    setting: string | null
    part: string | null
    partGroup: string
}

export function computeSettingPartFields(title: string): SettingPartFields {
    return {
        setting: parseSetting(title),
        part: parsePart(title)?.part ?? null,
        partGroup: partGroupFor(title),
    }
}

/**
 * The fields a `library_index` write stores alongside `stem`. `partGroup`
 * always follows the title. When a person set the setting/part
 * (`settingSource: 'human'`), only `partGroup` is returned, so a rename or
 * re-ingest never overwrites their choice.
 */
export function settingPartWriteFields(
    title: string,
    existing?: Record<string, unknown> | null,
): Partial<SettingPartFields> {
    if (existing && existing.settingSource === "human") {
        return { partGroup: partGroupFor(title) }
    }
    return computeSettingPartFields(title)
}
