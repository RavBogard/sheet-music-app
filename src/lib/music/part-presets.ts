/**
 * PERF-15: which parts of a multi-part MusicXML score to show.
 *
 * Pure helpers, shared by the Perform viewer and the MCP preset tools so the
 * dry-run a leader sees is exactly what an iPad will do.
 *
 * Precedence (Daniel, 2026-11-01): the device's own pick, then the signed-in
 * person's preset, then the preset for the device's instrument (only when the
 * device knows its instrument), then the full score. A preset that matches no
 * part never guesses: the full score is shown.
 */

export type PartPresetScope =
    | { kind: "user"; uid: string }
    | { kind: "instrument"; instrument: string }

export interface PartPreset {
    scope: PartPresetScope
    /** Part-name patterns, e.g. ["Bass", "Piano"]. */
    patterns: string[]
}

export type PartSource = "device" | "user" | "instrument" | "full"

export interface PartSelection {
    source: PartSource
    /** Indices of the parts to show, ascending. Every index when `source` is "full". */
    visible: number[]
}

/** Lower-case, strip accents and punctuation, collapse spaces. */
export function normalizePartName(s: string): string {
    return s
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
}

/** Case-insensitive loose match: "Bass" matches "Bass Guitar". */
export function partMatchesPattern(partName: string, pattern: string): boolean {
    const p = normalizePartName(pattern)
    const n = normalizePartName(partName)
    if (!p || !n) return false
    if (n === p) return true
    const words = n.split(" ")
    // Whole-word containment, so "bass" matches "Bass Guitar" but "Bas" does not guess.
    return ` ${n} `.includes(` ${p} `) || words.includes(p)
}

/** Indices of the parts any pattern matches. Empty when nothing matches. */
export function matchPartIndices(partNames: readonly string[], patterns: readonly string[]): number[] {
    const out: number[] = []
    partNames.forEach((name, i) => {
        if (patterns.some((p) => partMatchesPattern(name, p))) out.push(i)
    })
    return out
}

/** A device pick is usable only when every index is a real part and at least one is chosen. */
export function sanitizeDevicePick(pick: unknown, partCount: number): number[] | null {
    if (!Array.isArray(pick) || pick.length === 0) return null
    const set = new Set<number>()
    for (const v of pick) {
        if (!Number.isInteger(v) || v < 0 || v >= partCount) return null
        set.add(v)
    }
    return [...set].sort((a, b) => a - b)
}

export function resolvePartSelection(input: {
    partNames: readonly string[]
    devicePick?: unknown
    userPreset?: PartPreset | null
    instrumentPreset?: PartPreset | null
}): PartSelection {
    const { partNames } = input
    const all = partNames.map((_, i) => i)
    const device = sanitizeDevicePick(input.devicePick, partNames.length)
    if (device) return { source: "device", visible: device }
    for (const [source, preset] of [
        ["user", input.userPreset],
        ["instrument", input.instrumentPreset],
    ] as const) {
        if (!preset) continue
        const hit = matchPartIndices(partNames, preset.patterns)
        // A preset that selects nothing yields to the next rung, never a guess.
        if (hit.length > 0) return { source, visible: hit }
    }
    return { source: "full", visible: all }
}

/** Firestore doc id for a preset: one doc per org + scope. */
export function partPresetDocId(orgId: string, scope: PartPresetScope): string {
    const key = scope.kind === "user" ? scope.uid : normalizePartName(scope.instrument).replace(/ /g, "-")
    return `${orgId}__${scope.kind}__${key}`
}
