import type { Recording } from "@/types/models"

/**
 * Daniel 2026-11-03: a recording's confident tempo fills EMPTY bpm fields only
 * (the song's default and the setlist rows bonded to that song). A bpm a person
 * typed is never overwritten. Pure rules here; apply_recording_tempos
 * (src/lib/mcp/tools/recording-tempos.ts) reads and writes.
 *
 * An auto-filled value carries a marker next to it:
 *   bpmSource: "recording", bpmSourceRecordingId: <recording id>, bpmSourceValue: <the bpm written>
 * It counts as auto-filled only while `bpm === bpmSourceValue`: any edit that
 * changes the bpm, on any surface, turns it into a person's value without
 * that surface having to know about the marker. (update_song also deletes the
 * marker when it sets a bpm.) An auto-filled value may be updated by a more
 * confident take; a person's value never is.
 */

export const BPM_SOURCE_RECORDING = "recording"

/** Sane bounds for a tempo we would write (the row schema allows up to 400). */
const MIN_WRITE_BPM = 30
const MAX_WRITE_BPM = 300

export interface BpmFieldState {
    bpm?: unknown
    bpmSource?: unknown
    bpmSourceRecordingId?: unknown
    bpmSourceValue?: unknown
}

export interface TempoPick {
    recordingId: string
    songId: string
    /** Rounded to a whole BPM: what the field receives. */
    bpm: number
    confidence: number
}

export type FieldAction = "fill" | "update" | "keep" | "skip"

export interface FieldDecision {
    action: FieldAction
    reason: string
    before: number | string | null
    after?: number
}

/** null, absent, "", 0 and non-numbers are empty; a non-empty string is someone's text. */
export function isEmptyBpm(v: unknown): boolean {
    if (v === null || v === undefined) return true
    if (typeof v === "number") return !Number.isFinite(v) || v <= 0
    if (typeof v === "string") return v.trim() === ""
    return false
}

export function isAutoFilled(f: BpmFieldState): boolean {
    return (
        f.bpmSource === BPM_SOURCE_RECORDING &&
        typeof f.bpm === "number" &&
        typeof f.bpmSourceValue === "number" &&
        f.bpm === f.bpmSourceValue
    )
}

function beforeOf(v: unknown): number | string | null {
    return typeof v === "number" || typeof v === "string" ? v : null
}

/** What one bpm field gets from this song's picked take. */
export function decideField(f: BpmFieldState, pick: TempoPick): FieldDecision {
    const before = beforeOf(f.bpm)
    if (isEmptyBpm(f.bpm)) {
        return { action: "fill", reason: "empty", before, after: pick.bpm }
    }
    if (isAutoFilled(f)) {
        if (f.bpm === pick.bpm && f.bpmSourceRecordingId === pick.recordingId) {
            return { action: "keep", reason: "already filled from this take", before }
        }
        return {
            action: "update",
            reason: `auto-filled from recording ${String(f.bpmSourceRecordingId)}; the most confident take now is ${pick.recordingId}`,
            before,
            after: pick.bpm,
        }
    }
    return { action: "skip", reason: "set by a person", before }
}

/** The patch that fills a row's bpm (top-level marker fields). */
export function rowTempoPatch(pick: TempoPick): Record<string, unknown> {
    return {
        bpm: pick.bpm,
        bpmSource: BPM_SOURCE_RECORDING,
        bpmSourceRecordingId: pick.recordingId,
        bpmSourceValue: pick.bpm,
    }
}

export interface RecordingVerdict {
    recordingId: string
    songId: string | null
    detectedBpm: number | null
    alt: number | null
    confidence: number | null
    confident: boolean
    /** True for the one take per song whose tempo is used. */
    used: boolean
    why: string
}

function statusOf(r: Recording): "live" | "held" | "hidden" {
    return r.status === "held" || r.status === "hidden" ? r.status : "live"
}

/**
 * Per song, the take whose tempo is used: a live take with a confident tempo,
 * the most confident first, then the featured take, then by id. Held takes
 * (an unconfirmed match: maybe another song) and hidden ones are never used.
 */
export function pickSongTempos(recs: readonly Recording[]): { picks: Map<string, TempoPick>; verdicts: RecordingVerdict[] } {
    const verdicts = new Map<string, RecordingVerdict>()
    const eligible = new Map<string, Recording[]>()
    for (const r of recs) {
        const t = r.tempo
        const v: RecordingVerdict = {
            recordingId: r.id,
            songId: r.songId ?? null,
            detectedBpm: typeof t?.bpm === "number" ? t.bpm : null,
            alt: typeof t?.alt === "number" ? t.alt : null,
            confidence: typeof t?.confidence === "number" ? t.confidence : null,
            confident: t?.confident === true,
            used: false,
            why: "",
        }
        verdicts.set(r.id, v)
        const status = statusOf(r)
        if (!r.songId) v.why = "not attached to a song"
        else if (status === "held") v.why = "held: the song match is unconfirmed"
        else if (status === "hidden") v.why = "hidden"
        else if (!t) v.why = "no tempo measured yet (run the tempo back-fill)"
        else if (t.confident !== true || typeof t.bpm !== "number") v.why = `no confident beat${t.reason ? `: ${t.reason}` : ""}`
        else if (t.bpm < MIN_WRITE_BPM || t.bpm > MAX_WRITE_BPM) v.why = `tempo ${t.bpm} is out of range`
        else eligible.set(r.songId, [...(eligible.get(r.songId) ?? []), r])
    }
    const picks = new Map<string, TempoPick>()
    for (const [songId, list] of eligible) {
        const sorted = [...list].sort(
            (a, b) =>
                (b.tempo!.confidence ?? 0) - (a.tempo!.confidence ?? 0) ||
                Number(b.featured === true) - Number(a.featured === true) ||
                a.id.localeCompare(b.id),
        )
        const best = sorted[0]
        picks.set(songId, { recordingId: best.id, songId, bpm: Math.round(best.tempo!.bpm as number), confidence: best.tempo!.confidence })
        verdicts.get(best.id)!.used = true
        verdicts.get(best.id)!.why = "used: the song's most confident take"
        for (const other of sorted.slice(1)) verdicts.get(other.id)!.why = `a more confident take of this song is used (${best.id})`
    }
    return { picks, verdicts: recs.map((r) => verdicts.get(r.id)!) }
}
