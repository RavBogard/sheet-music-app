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
    // Candidates in order: each parenthesised clarifier, then a hyphen suffix.
    // The first that still says something after cleaning is the setting.
    const candidates = [...t.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])
    const hyphen = /\s+-\s+(.+)$/.exec(t)
    if (hyphen) candidates.push(hyphen[1])
    for (const raw of candidates) {
        const setting = cleanSetting(raw)
        if (setting) return setting
    }
    return null
}

/**
 * Keep the comma segments that name a setting: drop keys, download-copy
 * counters like "(1)", and anything carrying a format word ("band format",
 * "CRC band chart"). A key written in front of a name ("Am Aly Halpert")
 * is dropped too.
 */
function cleanSetting(raw: string): string | null {
    const kept = raw
        .split(",")
        .map((s) => s.trim().replace(/^[A-G][#b]?m?\s+(?=\S)/, ""))
        .filter((s) => {
            if (!s || KEY_RE.test(s) || /^\d+$/.test(s)) return false
            const lower = s.toLowerCase()
            return ![...FORMAT_WORDS].some((w) => lower === w || lower.includes(w))
        })
    return kept.length ? kept.join(", ") : null
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
