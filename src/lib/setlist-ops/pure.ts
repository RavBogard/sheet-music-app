/**
 * Pure helpers for the setlist op engine. No Firestore here, so every rule in
 * the contract that is about order or fields is testable without an emulator.
 */

/** Is this a plain `{}` object (not a FieldValue, Timestamp, Date, array…)? */
function isPlainObject(v: unknown): v is Record<string, unknown> {
    if (v === null || typeof v !== "object") return false
    const proto = Object.getPrototypeOf(v)
    return proto === Object.prototype || proto === null
}

/**
 * Drop every `undefined`, at any depth of plain objects and arrays. Firestore
 * rejects `undefined`; the old browser path dead-lettered on `{bpm: undefined}`.
 * `null` is kept: it means "clear". Sentinels (FieldValue) and Timestamps are
 * not plain objects and pass through untouched.
 */
export function stripUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.filter((v) => v !== undefined).map((v) => stripUndefined(v)) as unknown as T
    }
    if (isPlainObject(value)) {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value)) {
            if (v === undefined) continue
            out[k] = stripUndefined(v)
        }
        return out as T
    }
    return value
}

function normalise(v: unknown): unknown {
    if (v === undefined || v === null) return null
    if (Array.isArray(v)) return v.map(normalise)
    if (v && typeof v === "object") {
        const maybeTs = v as { toMillis?: () => number }
        if (typeof maybeTs.toMillis === "function") return { __ts: maybeTs.toMillis() }
        if (v instanceof Date) return { __ts: v.getTime() }
        const out: Record<string, unknown> = {}
        for (const k of Object.keys(v as Record<string, unknown>).sort()) {
            const inner = (v as Record<string, unknown>)[k]
            if (inner === undefined) continue
            out[k] = normalise(inner)
        }
        return out
    }
    return v
}

/** Deep value equality for field merge. A missing field equals `null`. */
export function valuesEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b))
}

export interface OrderedRow {
    id: string
    order: number
}

/** Canonical sequence: stored order, then id. */
export function canonicalSort<T extends OrderedRow>(rows: readonly T[]): T[] {
    return [...rows].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/**
 * Where an inserted or moved row lands in the CURRENT sequence (which no
 * longer contains the row itself). After `afterRowId` if it is present;
 * else before `beforeRowId` if that is present; else at the end.
 * `null`/`null` means the start.
 */
export function placementIndex(
    sequence: readonly string[],
    afterRowId: string | null,
    beforeRowId: string | null,
): number {
    if (afterRowId === null && beforeRowId === null) return 0
    if (afterRowId !== null) {
        const i = sequence.indexOf(afterRowId)
        if (i >= 0) return i + 1
    }
    if (beforeRowId !== null) {
        const j = sequence.indexOf(beforeRowId)
        if (j >= 0) return j
    }
    return sequence.length
}

export interface FieldConflict {
    field: string
    server: unknown
    mine: unknown
}

/**
 * Per-field three-way merge. A field applies when the server still holds the
 * client's `base` value, or already holds the client's new value. Otherwise
 * it is a conflict and the server keeps its value. Undefined values in `set`
 * are not fields at all (stripped); `null` means clear.
 *
 * `apply` holds only fields whose value actually changes.
 */
export function mergeFields(
    server: Record<string, unknown>,
    set: Record<string, unknown>,
    base: Record<string, unknown>,
    reserved: ReadonlySet<string>,
): { apply: Record<string, unknown>; conflicts: FieldConflict[]; considered: number } {
    const apply: Record<string, unknown> = {}
    const conflicts: FieldConflict[] = []
    let considered = 0
    for (const [field, raw] of Object.entries(set ?? {})) {
        if (raw === undefined || reserved.has(field)) continue
        considered++
        const mine = stripUndefined(raw)
        const current = server[field]
        if (valuesEqual(current, mine)) continue // already there
        if (valuesEqual(current, base?.[field])) {
            apply[field] = mine
            continue
        }
        conflicts.push({ field, server: current ?? null, mine })
    }
    return { apply, conflicts, considered }
}

/** Drop reserved keys and undefined values from a client row payload. */
export function cleanRowPayload(
    row: Record<string, unknown>,
    reserved: ReadonlySet<string>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(stripUndefined(row ?? {}))) {
        if (reserved.has(k)) continue
        if (v === null) continue // a new row has nothing to clear
        out[k] = v
    }
    return out
}
