import { MAX_DURATION_SEC, type Gig } from "./model"
import { anyDuration, setTotals, type SetTotal, type SetTotalsRow } from "./set-totals"

/**
 * BET-5 (B5b): display helpers shared by the band UI (editor, Perform, print).
 * Pure, so the server-side PDF and the client screens read the same numbers.
 */

/** A row the band helpers read. Editor rows (LocalTrack) and Perform rows (SetlistTrack) both fit. */
export interface GigRow extends SetTotalsRow {
    key?: unknown
    leadMusician?: unknown
    segue?: unknown
    singerKeys?: unknown
}

/** "3:05", or "1:02:05" past an hour. Whole seconds; a negative value is shown as its size. */
export function formatDuration(totalSec: number): string {
    const s = Math.round(Math.abs(totalSec))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = String(s % 60).padStart(2, "0")
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`
}

/**
 * Reads what the author typed into a length field: "3:45" (minutes and
 * seconds) or "4" (whole minutes). Empty clears the length (`null`). Anything
 * else, or a length past the 2-hour row limit, is `undefined`: not a length.
 */
export function parseDuration(text: string): number | null | undefined {
    const v = text.trim()
    if (v === "") return null
    let sec: number
    const mmss = /^(\d{1,3}):([0-5]\d)$/.exec(v)
    if (mmss) sec = Number(mmss[1]) * 60 + Number(mmss[2])
    else if (/^\d{1,3}$/.test(v)) sec = Number(v) * 60
    else return undefined
    return sec <= MAX_DURATION_SEC ? sec : undefined
}

/** The row's stored length, or null when it has none. */
export function rowDuration(row: GigRow): number | null {
    const d = row.durationSec
    return typeof d === "number" && Number.isFinite(d) && d > 0 ? d : null
}

/** Section rows are written as "header" or "section"; set totals count both as a set break. */
function asSetRows(tracks: readonly GigRow[]): SetTotalsRow[] {
    return tracks.map((t) => (t.type === "section" ? { ...t, type: "header" } : t))
}

/** Each set's total (see setTotals), keyed by the header row that opens it. */
export function setTotalsByHeader(
    tracks: readonly GigRow[],
    gig?: Pick<Gig, "setTargets" | "start" | "end"> | null,
): { byHeaderId: Record<string, SetTotal>; totals: SetTotal[]; seconds: number; untimed: number } {
    const totals = setTotals(asSetRows(tracks), gig ?? null)
    const byHeaderId: Record<string, SetTotal> = {}
    let seconds = 0
    let untimed = 0
    for (const s of totals) {
        if (s.header?.id) byHeaderId[s.header.id] = s
        seconds += s.seconds
        untimed += s.untimed
    }
    return { byHeaderId, totals, seconds, untimed }
}

/**
 * Whether a screen shows the band's timing (lengths, set totals, the gig
 * total). Always for a band tenant; for any other tenant only once a row
 * carries a length, so a CRC setlist without lengths renders as before.
 */
export function showsTiming(isBand: boolean, tracks: readonly GigRow[]): boolean {
    return isBand || anyDuration(tracks)
}

/**
 * The key the row's lead singer sings it in, when the author recorded one for
 * them. Names are compared without case. Never picks a key for anyone: no
 * lead, or no entry for the lead, is null.
 */
export function leadSingerKey(row: GigRow): string | null {
    const lead = typeof row.leadMusician === "string" ? row.leadMusician.trim().toLowerCase() : ""
    if (!lead || !Array.isArray(row.singerKeys)) return null
    for (const e of row.singerKeys as unknown[]) {
        if (!e || typeof e !== "object") continue
        const { musician, key } = e as { musician?: unknown; key?: unknown }
        if (typeof musician === "string" && musician.trim().toLowerCase() === lead && typeof key === "string" && key) {
            return key
        }
    }
    return null
}

/** The key the row's key tag shows: the lead singer's key when recorded, else the row's key. */
export function displayKeyOf(row: GigRow): string | null {
    const sung = leadSingerKey(row)
    if (sung) return sung
    return typeof row.key === "string" && row.key ? row.key : null
}

/** The row's singer keys, read defensively. */
export function singerKeysOf(row: GigRow): Array<{ musician: string; key: string }> {
    if (!Array.isArray(row.singerKeys)) return []
    return (row.singerKeys as unknown[]).flatMap((e) => {
        if (!e || typeof e !== "object") return []
        const { musician, key } = e as { musician?: unknown; key?: unknown }
        return typeof musician === "string" && typeof key === "string" ? [{ musician, key }] : []
    })
}

/** True when the row runs straight into the next one. */
export function isSegue(row: GigRow): boolean {
    return row.segue === true
}

/**
 * The band fields a print request carries for one row: only the ones the row
 * holds, so a row without them (every CRC row today) is sent exactly as before.
 */
export function gigTrackFields(
    row: GigRow,
    gig?: Pick<Gig, "setTargets"> | null,
): {
    id?: string
    durationSec?: number
    segue?: true
    singerKeys?: Array<{ musician: string; key: string }>
} {
    const out: { id?: string; durationSec?: number; segue?: true; singerKeys?: Array<{ musician: string; key: string }> } = {}
    // A set target names its header row by id; the print request carries the
    // id of a header row only when the gig has targets to match.
    const isHeader = row.type === "header" || row.type === "section"
    if (isHeader && gig?.setTargets?.length && typeof row.id === "string") out.id = row.id
    const d = rowDuration(row)
    if (d !== null) out.durationSec = d
    if (isSegue(row)) out.segue = true
    const keys = singerKeysOf(row)
    if (keys.length > 0) out.singerKeys = keys
    return out
}
