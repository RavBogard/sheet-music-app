/**
 * Tonight-only chart swaps (David's ask 4, 2026-09-22).
 *
 * In Perform the rabbi sometimes calls a different tune. A band leader swaps
 * the chart on one row FOR TONIGHT: the swap lives in
 * `setlists/{setlistId}/performance/overrides`, every iPad lays it over the
 * planned rows, and each swap / undo / reset appends a record to
 * `setlists/{setlistId}/performedDeviations`.
 *
 * The plan is never written. `tracks/*` and `setlists/{id}` are untouched;
 * row identity, order and count come from the plan and nothing here can
 * change them (R11-b). An override is an ADDITIVE layer: when the overrides
 * doc is missing, unreadable, from another service date, or the service day
 * has passed in America/Chicago, the planned setlist renders exactly as it
 * would without this module.
 *
 * Everything in this file is pure (no Firestore, no React) so the web, the
 * signed-out server route and `reconcile_service` all derive the same answer.
 */

/** One row's swap, keyed by track id in `OverridesDoc.rows`. */
export interface RowOverride {
    fileId: string
    songId: string
    title: string
    key: string | null
    mimeType: string | null
    /** The plan's chart at the moment of the swap — context, never applied. */
    plannedFileId: string | null
    swappedBy: string
    swappedAt: number
}

/** `setlists/{id}/performance/overrides`. */
export interface OverridesDoc {
    rows: Record<string, RowOverride>
    /** The service day (`YYYY-MM-DD`, America/Chicago) the swaps are for. */
    eventDay: string
    /** Bumped by exactly one on every write: the stale-write guard. */
    rev: number
    updatedAt: number
    updatedBy: string
}

export type DeviationKind = "swap" | "undo" | "reset"

/** `setlists/{id}/performedDeviations/{eventDay}-{rev}-{rowId}` — append-only. */
export interface Deviation {
    rowId: string
    kind: DeviationKind
    plannedFileId: string | null
    plannedTitle: string
    /** The chart the row showed just before this event. */
    beforeFileId: string | null
    beforeTitle: string
    /** The chart the row shows after this event (the plan's for undo/reset). */
    performedFileId: string | null
    performedTitle: string
    at: number
    by: string
    eventDay: string
    /** `OverridesDoc.rev` this event produced — orders replay. */
    rev: number
}

export const OVERRIDES_COLLECTION = "performance"
export const OVERRIDES_DOC_ID = "overrides"
export const DEVIATIONS_COLLECTION = "performedDeviations"

/**
 * Deterministic id: a retried write targets the same doc, and the rules allow
 * create only, so an event can never be recorded twice.
 */
export function deviationId(d: Pick<Deviation, "eventDay" | "rev" | "rowId">): string {
    return `${d.eventDay}-${String(d.rev).padStart(6, "0")}-${d.rowId}`
}

// ──────────────────────────────────────────────────────────────────────────
// Dates
// ──────────────────────────────────────────────────────────────────────────

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** The `YYYY-MM-DD` calendar day an instant falls on in America/Chicago. */
export function chicagoDay(ms: number): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(ms))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")}`
}

function validDay(s: string): boolean {
    const m = DAY_RE.exec(s)
    if (!m) return false
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const probe = new Date(Date.UTC(y, mo - 1, d))
    return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d
}

/**
 * The service day a setlist's `eventDate` names, in America/Chicago, or null.
 *
 * A date-only `YYYY-MM-DD` IS the day — it is never parsed as UTC midnight
 * (which would land on the previous Chicago day). Instants (ISO strings with a
 * time, epoch ms, Date, Firestore Timestamp shapes) are converted to the
 * Chicago calendar day they fall on. Anything else — missing, empty, garbage —
 * is null, and a null day means NO override applies: a swap without a service
 * day would otherwise stay live forever.
 */
export function eventDayOf(value: unknown): string | null {
    if (value == null) return null
    if (typeof value === "string") {
        const s = value.trim()
        if (!s) return null
        if (DAY_RE.test(s)) return validDay(s) ? s : null
        const ms = Date.parse(s)
        return Number.isFinite(ms) ? chicagoDay(ms) : null
    }
    if (typeof value === "number") return Number.isFinite(value) ? chicagoDay(value) : null
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? chicagoDay(value.getTime()) : null
    if (typeof value === "object") {
        const v = value as { toMillis?: () => number; seconds?: number; _seconds?: number }
        if (typeof v.toMillis === "function") return eventDayOf(v.toMillis())
        const secs = typeof v.seconds === "number" ? v.seconds : v._seconds
        if (typeof secs === "number") return eventDayOf(secs * 1000)
    }
    return null
}

/**
 * Whether an overrides doc applies right now to a setlist on `setlistDay`.
 *
 * All three must hold: the setlist has a service day; the doc was written for
 * THAT day (a setlist re-dated for a later service does not inherit old
 * swaps); and that day has not passed in America/Chicago.
 */
export function overridesApply(
    doc: OverridesDoc | null | undefined,
    setlistDay: string | null,
    nowMs: number,
): boolean {
    if (!doc || !setlistDay) return false
    if (doc.eventDay !== setlistDay) return false
    return chicagoDay(nowMs) <= setlistDay
}

// ──────────────────────────────────────────────────────────────────────────
// Reading an overrides doc defensively
// ──────────────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null
}

/** Parse whatever Firestore delivered; null for anything malformed. */
export function parseOverridesDoc(raw: unknown): OverridesDoc | null {
    if (!raw || typeof raw !== "object") return null
    const r = raw as Record<string, unknown>
    const eventDay = str(r.eventDay)
    if (!eventDay || !validDay(eventDay)) return null
    const rev = typeof r.rev === "number" && Number.isInteger(r.rev) ? r.rev : null
    if (rev === null) return null
    const rows: Record<string, RowOverride> = {}
    const src = r.rows && typeof r.rows === "object" ? (r.rows as Record<string, unknown>) : {}
    for (const [rowId, v] of Object.entries(src)) {
        if (!v || typeof v !== "object") continue
        const o = v as Record<string, unknown>
        const fileId = str(o.fileId)
        if (!fileId) continue
        rows[rowId] = {
            fileId,
            songId: str(o.songId) ?? fileId,
            title: str(o.title) ?? "",
            key: str(o.key),
            mimeType: str(o.mimeType),
            plannedFileId: str(o.plannedFileId),
            swappedBy: str(o.swappedBy) ?? "",
            swappedAt: typeof o.swappedAt === "number" ? o.swappedAt : 0,
        }
    }
    return {
        rows,
        eventDay,
        rev,
        updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
        updatedBy: str(r.updatedBy) ?? "",
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Applying
// ──────────────────────────────────────────────────────────────────────────

/** What the plan had on a row that is swapped tonight. */
export interface TonightMark {
    plannedFileId: string | null
    plannedTitle: string
    swappedAt: number
}

interface ChartRow {
    id: string
    title: string
    fileId?: string
    songId?: string
    key?: string
    mimeType?: string
}

/**
 * A row as Perform DISPLAYS it: `tonight` is present only when a swap is laid
 * over it. Display-only — never a field of `tracks/*` or of SetlistTrack.
 */
export type WithTonight<T> = T & { tonight?: TonightMark }

/**
 * The planned rows with tonight's swaps laid over them.
 *
 * Same array length, same order, same ids — only the chart fields of a
 * swapped row change (fileId, songId, title, key, mimeType), and the row
 * gains `tonight` naming what was planned. A row the plan itself now bonds to
 * the override's chart is left alone (the swap was saved, or the author made
 * the same change). When nothing applies the input array is returned as is.
 */
export function applyTonight<T extends ChartRow>(
    tracks: T[],
    doc: OverridesDoc | null | undefined,
    setlistDay: string | null,
    nowMs: number,
): WithTonight<T>[] {
    if (!overridesApply(doc, setlistDay, nowMs)) return tracks
    const rows = doc!.rows
    if (Object.keys(rows).length === 0) return tracks
    let changed = false
    const out = tracks.map((t) => {
        const o = t.id ? rows[t.id] : undefined
        if (!o || o.fileId === t.fileId) return t
        changed = true
        return {
            ...t,
            fileId: o.fileId,
            songId: o.songId,
            title: o.title || t.title,
            key: o.key ?? undefined,
            mimeType: o.mimeType ?? undefined,
            tonight: { plannedFileId: t.fileId ?? null, plannedTitle: t.title, swappedAt: o.swappedAt },
        }
    })
    return changed ? out : tracks
}

// ──────────────────────────────────────────────────────────────────────────
// Planning a write (the transaction body calls these)
// ──────────────────────────────────────────────────────────────────────────

export interface ChartChoice {
    fileId: string
    songId?: string
    title: string
    key?: string | null
    mimeType?: string | null
}

export interface SwapRequest {
    rowId: string
    /** The planned row as the operator's screen had it. */
    planned: { fileId: string | null; title: string }
    /**
     * The chart the operator SAW on the row when they chose. If another
     * leader changed the row since, the request is stale and refused.
     */
    expectedBeforeFileId: string | null
    /** The chart to show. The planned chart (or null) means undo. */
    choice: ChartChoice | null
    by: string
    at: number
    eventDay: string
}

export type WritePlan =
    | { kind: "write"; next: OverridesDoc; deviations: Deviation[] }
    | { kind: "noop"; reason: string }
    | { kind: "stale"; currentFileId: string | null; currentTitle: string }

function effective(doc: OverridesDoc | null, rowId: string, planned: { fileId: string | null; title: string }) {
    const o = doc?.rows[rowId]
    return o ? { fileId: o.fileId, title: o.title } : { fileId: planned.fileId, title: planned.title }
}

/** Only the doc for THIS service day counts; an older day's doc is replaced. */
function current(doc: OverridesDoc | null, eventDay: string): OverridesDoc | null {
    return doc && doc.eventDay === eventDay ? doc : null
}

/**
 * Plan one swap or undo against the doc as the transaction read it.
 *
 * Idempotent: asking for what the row already shows is a noop (a retried
 * request whose first attempt committed lands here, so reconnects do not
 * append duplicate events). Stale: if the row no longer shows what the
 * operator saw, nothing is written and the caller is told what it shows now.
 */
export function planSwap(docIn: OverridesDoc | null, req: SwapRequest): WritePlan {
    const doc = current(docIn, req.eventDay)
    const before = effective(doc, req.rowId, req.planned)
    const toPlan = !req.choice || req.choice.fileId === req.planned.fileId
    const afterFileId = toPlan ? req.planned.fileId : req.choice!.fileId

    if (before.fileId === afterFileId) return { kind: "noop", reason: "row already shows that chart" }
    if (before.fileId !== req.expectedBeforeFileId) {
        return { kind: "stale", currentFileId: before.fileId, currentTitle: before.title }
    }

    const rev = (docIn?.rev ?? 0) + 1
    const rows = { ...(doc?.rows ?? {}) }
    let performedTitle: string
    if (toPlan) {
        delete rows[req.rowId]
        performedTitle = req.planned.title
    } else {
        const c = req.choice!
        rows[req.rowId] = {
            fileId: c.fileId,
            songId: c.songId ?? c.fileId,
            title: c.title,
            key: c.key ?? null,
            mimeType: c.mimeType ?? null,
            plannedFileId: req.planned.fileId,
            swappedBy: req.by,
            swappedAt: req.at,
        }
        performedTitle = c.title
    }
    const next: OverridesDoc = { rows, eventDay: req.eventDay, rev, updatedAt: req.at, updatedBy: req.by }
    const deviation: Deviation = {
        rowId: req.rowId,
        kind: toPlan ? "undo" : "swap",
        plannedFileId: req.planned.fileId,
        plannedTitle: req.planned.title,
        beforeFileId: before.fileId,
        beforeTitle: before.title,
        performedFileId: afterFileId,
        performedTitle,
        at: req.at,
        by: req.by,
        eventDay: req.eventDay,
        rev,
    }
    return { kind: "write", next, deviations: [deviation] }
}

export interface ResetRequest {
    /** Planned rows by id, as the operator's screen had them. */
    planned: Record<string, { fileId: string | null; title: string }>
    by: string
    at: number
    eventDay: string
}

/**
 * Reset to plan: clear every override, one `reset` event per row that was
 * swapped. The deviations stay — the audit trail survives the reset.
 */
export function planReset(docIn: OverridesDoc | null, req: ResetRequest): WritePlan {
    const doc = current(docIn, req.eventDay)
    const ids = Object.keys(doc?.rows ?? {})
    if (ids.length === 0) return { kind: "noop", reason: "nothing is swapped" }
    const rev = (docIn?.rev ?? 0) + 1
    const deviations: Deviation[] = ids.sort().map((rowId) => {
        const o = doc!.rows[rowId]
        const planned = req.planned[rowId] ?? { fileId: o.plannedFileId, title: "" }
        return {
            rowId,
            kind: "reset",
            plannedFileId: planned.fileId,
            plannedTitle: planned.title,
            beforeFileId: o.fileId,
            beforeTitle: o.title,
            performedFileId: planned.fileId,
            performedTitle: planned.title,
            at: req.at,
            by: req.by,
            eventDay: req.eventDay,
            rev,
        }
    })
    return {
        kind: "write",
        next: { rows: {}, eventDay: req.eventDay, rev, updatedAt: req.at, updatedBy: req.by },
        deviations,
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Replay (reconcile_service, audit)
// ──────────────────────────────────────────────────────────────────────────

/** A row's chart story for one service, rebuilt from its deviations. */
export interface RowChartHistory {
    rowId: string
    plannedFileId: string | null
    plannedTitle: string
    /** What the row showed when the log ends. */
    finalFileId: string | null
    finalTitle: string
    /** True when the final chart is not the plan's. */
    swapped: boolean
    /** Every chart the row showed tonight, in order, starting from the plan. */
    sequence: Array<{ fileId: string | null; title: string }>
    events: number
}

/**
 * Rebuild each row's chart history from its deviation records.
 *
 * Ordered by `rev` then `at` then row id, so the answer does not depend on
 * the order Firestore returned them. Only events for `eventDay` count when it
 * is given. Undo and reset both return a row to its plan.
 */
export function replayDeviations(
    deviations: Deviation[],
    eventDay?: string | null,
): Map<string, RowChartHistory> {
    const list = deviations
        .filter((d) => !eventDay || d.eventDay === eventDay)
        .sort((a, b) => a.rev - b.rev || a.at - b.at || a.rowId.localeCompare(b.rowId))
    const out = new Map<string, RowChartHistory>()
    for (const d of list) {
        let h = out.get(d.rowId)
        if (!h) {
            h = {
                rowId: d.rowId,
                plannedFileId: d.plannedFileId,
                plannedTitle: d.plannedTitle,
                finalFileId: d.plannedFileId,
                finalTitle: d.plannedTitle,
                swapped: false,
                sequence: [{ fileId: d.plannedFileId, title: d.plannedTitle }],
                events: 0,
            }
            out.set(d.rowId, h)
        }
        h.events += 1
        const toPlan = d.kind !== "swap"
        h.finalFileId = toPlan ? h.plannedFileId : d.performedFileId
        h.finalTitle = toPlan ? h.plannedTitle : d.performedTitle
        h.swapped = h.finalFileId !== h.plannedFileId
        const last = h.sequence[h.sequence.length - 1]
        if (last.fileId !== h.finalFileId) h.sequence.push({ fileId: h.finalFileId, title: h.finalTitle })
    }
    return out
}

/** Parse one deviation doc; null when malformed. */
export function parseDeviation(raw: unknown): Deviation | null {
    if (!raw || typeof raw !== "object") return null
    const r = raw as Record<string, unknown>
    const rowId = str(r.rowId)
    const kind = r.kind === "swap" || r.kind === "undo" || r.kind === "reset" ? r.kind : null
    const eventDay = str(r.eventDay)
    if (!rowId || !kind || !eventDay || typeof r.rev !== "number" || typeof r.at !== "number") return null
    return {
        rowId,
        kind,
        plannedFileId: str(r.plannedFileId),
        plannedTitle: typeof r.plannedTitle === "string" ? r.plannedTitle : "",
        beforeFileId: str(r.beforeFileId),
        beforeTitle: typeof r.beforeTitle === "string" ? r.beforeTitle : "",
        performedFileId: str(r.performedFileId),
        performedTitle: typeof r.performedTitle === "string" ? r.performedTitle : "",
        at: r.at,
        by: str(r.by) ?? "",
        eventDay,
        rev: r.rev,
    }
}
