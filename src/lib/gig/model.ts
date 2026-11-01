import { z } from "zod"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * BET-5 (band mode): the gig model. Every field is optional and additive; a
 * setlist, track, song or contact without them behaves exactly as before.
 *
 * - Setlist `gig`: venue, address, times (`HH:mm`, the tenant's local time),
 *   free-text contact and notes, and per-set target lengths.
 * - Track: `durationSec`, `segue` (runs straight into the next song) and
 *   `singerKeys` (a key per singer, recorded by the author, never chosen).
 * - Song: `durationSec`, the default length a new row copies.
 * - Contact: `instrument` and `transposition`, for a sub's part.
 *
 * Validation lives here so the MCP write paths and the B5b UI share it.
 */

export const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

const hhmm = z.string().regex(HHMM_RE, "24-hour HH:mm, e.g. '19:30'")
const text = (max: number) => z.string().trim().max(max)

/** One set's target length. `headerRowId` names the header row that opens the set. */
export const SetTargetSchema = z.object({
    headerRowId: z.string().trim().min(1).max(200).optional(),
    minutes: z.number().int().min(1).max(600),
})

/**
 * A gig patch. Each field is set when given and removed when `null`;
 * an omitted field is left alone. `setTargets` is replaced whole.
 */
export const GigPatchSchema = z
    .object({
        venue: text(200).nullable().optional(),
        address: text(500).nullable().optional(),
        loadIn: hhmm.nullable().optional(),
        soundcheck: hhmm.nullable().optional(),
        start: hhmm.nullable().optional(),
        end: hhmm.nullable().optional(),
        contact: text(500).nullable().optional(),
        notes: text(2000).nullable().optional(),
        setTargets: z.array(SetTargetSchema).max(20).nullable().optional(),
    })
    .strict()

export type GigPatch = z.infer<typeof GigPatchSchema>

export const GIG_FIELDS = [
    "venue",
    "address",
    "loadIn",
    "soundcheck",
    "start",
    "end",
    "contact",
    "notes",
    "setTargets",
] as const

export interface SetTarget {
    headerRowId?: string
    minutes: number
}

export interface Gig {
    venue?: string
    address?: string
    loadIn?: string
    soundcheck?: string
    start?: string
    end?: string
    contact?: string
    notes?: string
    setTargets?: SetTarget[]
}

/** Longest row a set can hold: 2 hours. */
export const MAX_DURATION_SEC = 7200

export const DurationSecSchema = z.number().int().min(0).max(MAX_DURATION_SEC)

/** A key as a singer gives it: A–G, an optional # or b, an optional m ("F#m", "Bb", "C"). */
export const KEY_RE = /^[A-G](#|b)?m?$/

export const SingerKeySchema = z.object({
    musician: z.string().trim().min(1).max(100),
    key: z.string().trim().regex(KEY_RE, "a key such as 'G', 'Bb' or 'F#m'"),
})

export type SingerKey = z.infer<typeof SingerKeySchema>

/** Up to 12 singer keys, one per musician (names compared without case). */
export const SingerKeysSchema = z
    .array(SingerKeySchema)
    .max(12)
    .refine((list) => new Set(list.map((e) => e.musician.toLowerCase())).size === list.length, {
        message: "each musician appears once",
    })

/** The band fields `update_track` takes. `durationSec: null` clears the length. */
export const TrackGigPatchSchema = z.object({
    durationSec: DurationSecSchema.nullable().optional(),
    segue: z.boolean().optional(),
    singerKeys: SingerKeysSchema.optional(),
})

export type TrackGigPatch = z.infer<typeof TrackGigPatchSchema>

export const TRANSPOSITIONS = ["C", "Bb", "Eb", "F", "bass"] as const
export type Transposition = (typeof TRANSPOSITIONS)[number]
export const TranspositionSchema = z.enum(TRANSPOSITIONS)

/**
 * Semitones from concert pitch to the written part, the same numbers as
 * INSTRUMENT_PRESETS (Bb trumpet +2, Eb alto sax -3, F horn +7). A bass
 * part reads concert pitch.
 */
export const TRANSPOSITION_SEMITONES: Record<Transposition, number> = {
    C: 0,
    Bb: 2,
    Eb: -3,
    F: 7,
    bass: 0,
}

function issuesOf(error: z.ZodError, prefix: string) {
    return error.issues.map((i) => ({
        path: [prefix, ...i.path.map(String)].filter(Boolean).join("."),
        message: i.message,
    }))
}

/** A validation failure as the rich envelope every MCP write returns. */
function invalid(field: string, message: string, error: z.ZodError, hint: string): RichErrorEnvelope {
    return richError("invalid_argument", message, { field, issues: issuesOf(error, field) }, hint)
}

/** Parse a `gig` argument: the patch, or `null` (clear the whole gig), or a rich error. */
export function parseGigArg(
    value: unknown,
): { ok: true; gig: GigPatch | null } | { ok: false; error: RichErrorEnvelope } {
    if (value === null) return { ok: true, gig: null }
    const parsed = GigPatchSchema.safeParse(value)
    if (!parsed.success) {
        return {
            ok: false,
            error: invalid(
                "gig",
                "`gig` has a field that is not valid.",
                parsed.error,
                "Times are 24-hour HH:mm in the local time ('19:30'); setTargets is [{headerRowId?, minutes}]; null removes a field.",
            ),
        }
    }
    return { ok: true, gig: parsed.data }
}

/** Parse the band fields of a track patch, or a rich error. */
export function parseTrackGigPatch(
    value: { durationSec?: unknown; segue?: unknown; singerKeys?: unknown },
): { ok: true; patch: TrackGigPatch } | { ok: false; error: RichErrorEnvelope } {
    const picked: Record<string, unknown> = {}
    for (const k of ["durationSec", "segue", "singerKeys"] as const) {
        if (value[k] !== undefined) picked[k] = value[k]
    }
    const parsed = TrackGigPatchSchema.safeParse(picked)
    if (!parsed.success) {
        return {
            ok: false,
            error: invalid(
                "patch",
                "A band field on this row is not valid.",
                parsed.error,
                `durationSec is whole seconds, 0 to ${MAX_DURATION_SEC} (null clears it); segue is true/false; singerKeys is [{musician, key}], at most 12, one per musician, keys like 'G', 'Bb' or 'F#m'.`,
            ),
        }
    }
    return { ok: true, patch: parsed.data }
}

/** Parse a song's `durationSec`, or a rich error. */
export function parseSongDuration(
    value: unknown,
): { ok: true; durationSec: number } | { ok: false; error: RichErrorEnvelope } {
    const parsed = DurationSecSchema.safeParse(value)
    if (!parsed.success) {
        return {
            ok: false,
            error: invalid("durationSec", "`durationSec` is not valid.", parsed.error, `Whole seconds, 0 to ${MAX_DURATION_SEC}.`),
        }
    }
    return { ok: true, durationSec: parsed.data }
}

/** Parse a contact's `instrument` and `transposition`, or a rich error. */
export function parseContactPart(
    value: { instrument?: unknown; transposition?: unknown },
): { ok: true; instrument?: string; transposition?: Transposition } | { ok: false; error: RichErrorEnvelope } {
    const parsed = z
        .object({ instrument: text(100).min(1).optional(), transposition: TranspositionSchema.optional() })
        .safeParse({ instrument: value.instrument, transposition: value.transposition })
    if (!parsed.success) {
        return {
            ok: false,
            error: invalid(
                "contact",
                "`instrument` or `transposition` is not valid.",
                parsed.error,
                `transposition is one of ${TRANSPOSITIONS.join(", ")}; instrument is free text up to 100 characters.`,
            ),
        }
    }
    return { ok: true, ...parsed.data }
}

/**
 * True when the show ends after midnight: an `end` earlier than `start` is
 * read that way rather than refused.
 */
export function gigCrossesMidnight(gig: Pick<Gig, "start" | "end"> | null | undefined): boolean {
    if (!gig?.start || !gig.end || !HHMM_RE.test(gig.start) || !HHMM_RE.test(gig.end)) return false
    return gig.end < gig.start
}

/** A stored gig, read defensively: only well-typed fields survive. */
export function readGig(value: unknown): Gig | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const src = value as Record<string, unknown>
    const out: Gig = {}
    for (const k of ["venue", "address", "loadIn", "soundcheck", "start", "end", "contact", "notes"] as const) {
        if (typeof src[k] === "string" && src[k]) out[k] = src[k] as string
    }
    if (Array.isArray(src.setTargets)) {
        const targets = src.setTargets
            .map((t) => SetTargetSchema.safeParse(t))
            .filter((r) => r.success)
            .map((r) => r.data as SetTarget)
        if (targets.length > 0) out.setTargets = targets
    }
    return Object.keys(out).length > 0 ? out : null
}
