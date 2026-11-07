import { isSongType } from "@/lib/setlist-track-count"
import { titleSlotStem } from "./keys"
import { cleanLabel } from "./tiers"

/**
 * Pinned rows (Daniel 2026-11-07). A profile's running order is learned from
 * its last regular services; a pinned row is always in it, in its pinned
 * place, whatever that history shows. Daniel or a band leader pins and unpins
 * (pin_profile_row / unpin_profile_row). Pure: no Firestore.
 *
 * Pins live beside the learned rows on the profile doc (`pins`), never inside
 * `tracks`, so no re-learn can drop one. They are laid over the learned order
 * whenever the order is used: a draft, a re-learn report, get_service_profile.
 *
 * A pin names its place one of three ways: `position` (1 is first), `after`
 * (the row it follows, by its label), or neither (it stays where the learned
 * order has it, else goes last). A pin that is already a learned row (the
 * same slot, the same chart or the same name) moves that row rather than
 * adding a second one. A pinned song is filled like any row: from its
 * standard, else its usual. Nothing here picks a chart.
 */

export interface ProfilePin {
    id: string
    /** The row's title, said in the order and the readback. */
    title: string
    /** Row type: `song` unless it is a header, reading, note or transition. */
    type: string
    /** Songs: the slot the row fills (the same key standards and history use). */
    slotKey: string | null
    momentId?: string | null
    /** The chart named when it was pinned; its standard is what fills the draft. */
    fileId?: string | null
    chartName?: string | null
    key?: string | null
    /** 1-based place in the order. */
    position?: number | null
    /** The label of the row it follows. */
    after?: string | null
    by: string
    byName: string
    at: string
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

/** The stored `pins` field of a profile doc; malformed entries are dropped. */
export function parsePins(raw: unknown): ProfilePin[] {
    if (!Array.isArray(raw)) return []
    const out: ProfilePin[] = []
    for (const r of raw) {
        if (!r || typeof r !== "object") continue
        const o = r as Record<string, unknown>
        const id = str(o.id)
        const title = str(o.title)
        if (!id || !title) continue
        const position = typeof o.position === "number" && Number.isInteger(o.position) && o.position >= 1 ? o.position : null
        out.push({
            id,
            title,
            type: str(o.type) ?? "song",
            slotKey: str(o.slotKey),
            momentId: str(o.momentId),
            fileId: str(o.fileId),
            chartName: str(o.chartName),
            key: str(o.key),
            position,
            after: str(o.after),
            by: str(o.by) ?? "",
            byName: str(o.byName) ?? "",
            at: str(o.at) ?? "",
        })
    }
    return out
}

/** A row's name as a slot label: before any clarifier, no file extension, normalised. */
export function labelStem(title: string): string {
    const lead = cleanLabel(title.split(/\s+[—–-]\s+|\s*\(|\s+>\s+/)[0]) || cleanLabel(title) || title
    return titleSlotStem(lead)
}

/** The slot of a profile row: the key it was learned under, else the one the resolver gives. */
export type RowSlotOf = (row: Record<string, unknown>) => string | null

function rowTitle(row: Record<string, unknown>): string {
    return typeof row.title === "string" ? row.title : ""
}

function rowType(row: Record<string, unknown>): string {
    return typeof row.type === "string" ? row.type : "song"
}

/** True when a learned row is the row a pin names. */
export function pinMatchesRow(pin: ProfilePin, row: Record<string, unknown>, slotOf: RowSlotOf): boolean {
    const song = isSongType(pin.type)
    if (song !== isSongType(rowType(row))) return false
    if (song) {
        const slot = slotOf(row)
        if (pin.slotKey && slot && slot === pin.slotKey) return true
        if (pin.slotKey && typeof row.slotKey === "string" && row.slotKey === pin.slotKey) return true
        if (pin.fileId && typeof row.fileId === "string" && row.fileId === pin.fileId) return true
    } else if (rowType(row) !== pin.type) {
        return false
    }
    const a = labelStem(pin.title)
    return !!a && a === labelStem(rowTitle(row))
}

/** The row of a pin that is not in the learned order. */
function pinnedRow(pin: ProfilePin): Record<string, unknown> {
    if (!isSongType(pin.type)) return { type: pin.type, title: pin.title, pinned: true }
    const row: Record<string, unknown> = {
        type: "song",
        title: pin.title,
        slotKind: "open",
        slotKey: pin.slotKey,
        house: null,
        pinned: true,
    }
    if (pin.momentId) row.momentId = pin.momentId
    return row
}

function anchorIndex(rows: Record<string, unknown>[], after: string): number {
    const want = labelStem(after)
    if (!want) return -1
    const exact = rows.findIndex((r) => labelStem(rowTitle(r)) === want)
    if (exact >= 0) return exact
    return rows.findIndex((r) => titleSlotStem(rowTitle(r)).startsWith(want))
}

export interface PinnedOrder {
    tracks: Record<string, unknown>[]
    /** Pins whose `after` row is not in the order: placed last, and said. */
    notices: string[]
}

/**
 * Lay pins over a learned order. Every pin ends up in the order exactly once,
 * marked `pinned: true`.
 */
export function applyPins(tracks: Record<string, unknown>[], pins: ProfilePin[], slotOf: RowSlotOf): PinnedOrder {
    if (pins.length === 0) return { tracks, notices: [] }
    const rows = tracks.map((t) => ({ ...t }))
    const used = new Set<number>()
    const matched = new Map<string, number>()
    for (const pin of pins) {
        const i = rows.findIndex((r, j) => !used.has(j) && pinMatchesRow(pin, r, slotOf))
        if (i >= 0) {
            used.add(i)
            matched.set(pin.id, i)
        }
    }
    // A pin with no place keeps its learned place; the others are lifted out first.
    const own = new Map<string, Record<string, unknown>>()
    const lifted = new Set<number>()
    for (const pin of pins) {
        const i = matched.get(pin.id)
        const row = i !== undefined ? { ...rows[i], pinned: true } : pinnedRow(pin)
        own.set(pin.id, row)
        if (i !== undefined) {
            if (pin.position || pin.after) lifted.add(i)
            else rows[i] = row
        }
    }
    let order = rows.filter((_, i) => !lifted.has(i))
    const notices: string[] = []
    for (const pin of pins) {
        if (pin.position || pin.after || matched.has(pin.id)) continue
        order.push(own.get(pin.id)!)
    }
    for (const pin of pins.filter((p) => !p.position && p.after)) {
        const at = anchorIndex(order, pin.after!)
        if (at < 0) {
            order.push(own.get(pin.id)!)
            notices.push(`Pinned ${pin.title} goes after ${pin.after}, which is not in this order: placed last`)
        } else {
            order = [...order.slice(0, at + 1), own.get(pin.id)!, ...order.slice(at + 1)]
        }
    }
    for (const pin of pins.filter((p) => !!p.position).sort((a, b) => a.position! - b.position!)) {
        const at = Math.min(Math.max(pin.position! - 1, 0), order.length)
        order = [...order.slice(0, at), own.get(pin.id)!, ...order.slice(at)]
    }
    return { tracks: order, notices }
}
