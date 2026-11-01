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
        .replace(/\p{M}/gu, "")
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

/**
 * Indices of the parts the patterns select. Exact (normalised) matches win:
 * when any part equals a pattern, only those parts are used. Whole-word
 * containment applies only when nothing matches exactly. Empty when nothing matches.
 */
export function matchPartIndices(partNames: readonly string[], patterns: readonly string[]): number[] {
    const wanted = new Set(patterns.map(normalizePartName).filter(Boolean))
    const exact: number[] = []
    const loose: number[] = []
    partNames.forEach((name, i) => {
        if (wanted.has(normalizePartName(name))) exact.push(i)
        else if (patterns.some((p) => partMatchesPattern(name, p))) loose.push(i)
    })
    return exact.length > 0 ? exact : loose
}

/** Words that name both a voice range and an instrument, so a loose match on them needs a human look. */
const VOCAL_RANGE_WORDS = new Set(["soprano", "alto", "tenor", "bass"])
export function hasVocalRangeName(s: string): boolean {
    return normalizePartName(s).split(" ").some((w) => VOCAL_RANGE_WORDS.has(w))
}

/** A device's saved pick: the part names it was made against, and the visible indices. */
export interface DevicePick {
    names: string[]
    visible: number[]
}

/**
 * A device pick is usable only when it was made against this chart's current
 * part names and every index is a real part with at least one chosen. Anything
 * else is ignored, so a re-uploaded chart opens as the full score.
 */
export function sanitizeDevicePick(pick: unknown, partNames: readonly string[]): number[] | null {
    const p = pick as Partial<DevicePick> | null | undefined
    if (!p || !Array.isArray(p.names) || !Array.isArray(p.visible) || p.visible.length === 0) return null
    if (p.names.length !== partNames.length || p.names.some((n, i) => n !== partNames[i])) return null
    const set = new Set<number>()
    for (const v of p.visible) {
        if (!Number.isInteger(v) || v < 0 || v >= partNames.length) return null
        set.add(v)
    }
    return [...set].sort((a, b) => a - b)
}

/**
 * Does an instrument preset apply to a musician profile instrument? The profile
 * stores a slug (electric_bass); a preset says "bass". Loose, by whole word,
 * against the slug and its label.
 */
export function instrumentPresetApplies(presetInstrument: string, profileInstrument: string | null | undefined, label?: string | null): boolean {
    if (!profileInstrument) return false
    return [profileInstrument.replace(/_/g, " "), label ?? ""].some((c) => !!c && partMatchesPattern(c, presetInstrument))
}

/** The person's preset and the profile instrument's preset out of an org's presets. */
export function pickPresets(
    presets: readonly PartPreset[],
    uid: string | null,
    profileInstrument: string | null | undefined,
    label?: string | null,
): { userPreset: PartPreset | null; instrumentPreset: PartPreset | null } {
    if (!uid) return { userPreset: null, instrumentPreset: null }
    return {
        userPreset: presets.find((p) => p.scope.kind === "user" && p.scope.uid === uid) ?? null,
        instrumentPreset:
            presets.find((p) => p.scope.kind === "instrument" && instrumentPresetApplies(p.scope.instrument, profileInstrument, label)) ?? null,
    }
}

export function resolvePartSelection(input: {
    partNames: readonly string[]
    devicePick?: unknown
    userPreset?: PartPreset | null
    instrumentPreset?: PartPreset | null
}): PartSelection {
    const { partNames } = input
    const all = partNames.map((_, i) => i)
    const device = sanitizeDevicePick(input.devicePick, partNames)
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
