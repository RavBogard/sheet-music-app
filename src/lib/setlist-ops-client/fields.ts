/**
 * The fields the browser may send in an op, mirrored from the server's table
 * (src/lib/setlist-ops/fields.ts; `fields-mirror.test.ts` holds the two lists
 * equal). The server refuses an unknown field for the WHOLE batch, so the
 * client drops anything else (`version`, `updatedAt`, `orgId`, …) before it
 * sends: a copied row can never carry a server stamp or an `undefined`.
 */

export const ROW_FIELDS = [
    'title',
    'type',
    'key',
    'bpm',
    'leadMusician',
    'referenceLink',
    'notes',
    'songId',
    'fileId',
    'fileName',
    'mimeType',
    'performer',
    'description',
    'estimatedMinutes',
    'liturgyRef',
    'momentId',
    'fixed',
    'honors',
    'durationSec',
    'segue',
    'singerKeys',
] as const

/** Row fields the server will not clear with `null`: a clear becomes ''. */
const NOT_NULLABLE_ROW = new Set<string>(['title', 'type'])

export const SETLIST_FIELDS = [
    'name',
    'eventDate',
    'templateType',
    'rabbi',
    'serviceNotes',
    'startsAtLocal',
    'special',
    'gig',
] as const

const NOT_NULLABLE_SETLIST = new Set<string>(['name', 'eventDate'])

const ROW_SET = new Set<string>(ROW_FIELDS)
const SETLIST_SET = new Set<string>(SETLIST_FIELDS)

function isPlain(v: unknown): v is Record<string, unknown> {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
    const p = Object.getPrototypeOf(v)
    return p === Object.prototype || p === null
}

/** Deep copy without `undefined` (Firestore and the server both refuse it). */
export function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.filter((v) => v !== undefined).map(clean)
    if (isPlain(value)) {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = clean(v)
        return out
    }
    return value
}

/** A new row's fields: known fields only, no `undefined`, no `null`. */
export function rowForInsert(src: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const k of ROW_FIELDS) {
        const v = src[k]
        if (v === undefined || v === null) continue
        out[k] = clean(v)
    }
    if (typeof out.title !== 'string') out.title = ''
    if (typeof out.type !== 'string') out.type = 'song'
    return out
}

/**
 * An edit's `set`: known fields only. `undefined` means "cleared" (the cells
 * commit `{bpm: undefined}`), which goes out as `null`; a field the server
 * will not clear goes out as ''.
 */
export function rowEditSet(patch: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
        if (!ROW_SET.has(k)) continue
        if (v === undefined || v === null || (k === 'bpm' && typeof v === 'number' && !Number.isFinite(v))) {
            out[k] = NOT_NULLABLE_ROW.has(k) ? '' : null
            continue
        }
        out[k] = clean(v)
    }
    return out
}

/** Base values for `fields`, read from what the author saw. Missing = null. */
export function baseOf(row: Record<string, unknown> | undefined, fields: Iterable<string>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const k of fields) {
        const v = row?.[k]
        out[k] = v === undefined ? null : clean(v)
    }
    return out
}

/** A setlist edit's `set`: known fields only; a date in ms or Date goes out as ISO. */
export function setlistEditSet(patch: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
        if (!SETLIST_SET.has(k)) continue
        if (v === undefined || v === null) {
            if (NOT_NULLABLE_SETLIST.has(k)) continue
            out[k] = null
            continue
        }
        if (k === 'eventDate') {
            const iso = toIso(v)
            if (iso) out[k] = iso
            continue
        }
        out[k] = clean(v)
    }
    return out
}

/** The cached setlist's value for a field, in wire form (eventDate as ISO). */
export function setlistBaseOf(doc: Record<string, unknown> | undefined, fields: Iterable<string>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const k of fields) {
        const v = doc?.[k]
        if (k === 'eventDate') {
            out[k] = v === undefined || v === null ? null : (toIso(v) ?? null)
            continue
        }
        out[k] = v === undefined ? null : clean(v)
    }
    return out
}

export function toIso(v: unknown): string | null {
    if (typeof v === 'string') return Number.isNaN(Date.parse(v)) ? null : new Date(v).toISOString()
    if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString()
    if (v instanceof Date) return v.toISOString()
    const ts = v as { toMillis?: () => number; seconds?: number } | null
    if (ts && typeof ts.toMillis === 'function') return new Date(ts.toMillis()).toISOString()
    if (ts && typeof ts.seconds === 'number') return new Date(ts.seconds * 1000).toISOString()
    return null
}
