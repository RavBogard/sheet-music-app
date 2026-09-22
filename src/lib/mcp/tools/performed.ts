import "server-only"

import crypto from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor, readUserRole } from "@/lib/mcp/server-tracks-write"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { rowOrg } from "@/lib/mcp/org-context"
import { cloneSetlist } from "./clone-setlist"
import { fetchHistory, historyConfigured } from "@/lib/performed/history-client"
import { chapters as buildChapters, reconcile, type PlannedRow } from "@/lib/performed/reconcile"
import type { Diff, DiffRow } from "@/lib/performed/types"
import {
    DEVIATIONS_COLLECTION,
    eventDayOf,
    parseDeviation,
    replayDeviations,
    type Deviation,
    type RowChartHistory,
} from "@/lib/performance/tonight"

/**
 * `reconcile_service` — what actually happened, beside what was planned.
 *
 * **The plan is never overwritten.** `dryRun` (the default) returns a staged
 * view and writes nothing. `dryRun:false` PROMOTES: it clones the setlist into
 * a new one named "<name> (as performed)", stamps each row's `performedAt` from
 * the cue that fired it, drops the rows the service skipped and splices in the
 * audibles. The planned setlist is untouched and stays in the list beside it.
 *
 * Nothing here fires anything or touches the live relay. The only outbound call
 * is a read of Overlays' bounded cue history.
 */

type DB = FirebaseFirestore.Firestore

/** Window either side of the service, per the handoff: −30 min, +4 h. */
const DEFAULT_BEFORE_MINUTES = 30
const DEFAULT_AFTER_HOURS = 4

export interface ReconcileServiceArgs {
    setlistId: string
    /** Default TRUE — stage the diff, write nothing. */
    dryRun?: boolean
    /** Seconds to shift the chapter list by. Default 0. */
    chapterOffsetSeconds?: number
    /** Override the history window (ISO instants). Both or neither. */
    since?: string
    until?: string
}

export interface ReconcileServiceResult {
    ok: true
    setlistId: string
    setlistName: string
    dryRun: boolean
    window: { since: string; until: string }
    diff: Diff
    /** `mm:ss  Title`, one per fired row, for a recording description. */
    chapters: string[]
    /** A sentence for the person reading this, not a number to interpret. */
    summary: string
    promoted: null | {
        setlistId: string
        name: string
        rowsRemoved: number
        rowsAdded: number
        rowsStamped: number
    }
}

function isoOrNull(v: unknown): string | null {
    if (typeof v === "string") return v
    if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
        try {
            return (v as { toDate(): Date }).toDate().toISOString()
        } catch {
            return null
        }
    }
    return null
}

async function loadPlan(
    db: DB,
    setlistId: string,
): Promise<{ rows: PlannedRow[]; order: string[] } | null> {
    const snap = await db.collection("tracks").where("setlistId", "==", setlistId).get()
    if (snap.empty) return { rows: [], order: [] }
    const docs = snap.docs
        .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
        .sort((a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0))
    return {
        rows: docs.map((d) => ({
            trackId: d.id,
            title: typeof d.data.title === "string" ? d.data.title : "",
            type: typeof d.data.type === "string" ? d.data.type : "song",
            liturgyRef:
                (d.data.liturgyRef as PlannedRow["liturgyRef"] | undefined) ?? null,
            momentId: typeof d.data.momentId === "string" ? d.data.momentId : null,
        })),
        order: docs.map((d) => d.id),
    }
}

/**
 * The band's recorded chart choices for this service (David's ask 4): the
 * append-only `performedDeviations`, replayed per row for the service day.
 * A read failure is an empty map — reconciliation then speaks only to cues.
 */
async function loadChartHistory(
    db: DB,
    setlistId: string,
    eventDay: string | null,
): Promise<Map<string, RowChartHistory>> {
    if (!eventDay) return new Map()
    try {
        const snap = await db
            .collection("setlists")
            .doc(setlistId)
            .collection(DEVIATIONS_COLLECTION)
            .where("eventDay", "==", eventDay)
            .get()
        const devs = snap.docs.map((d) => parseDeviation(d.data())).filter((d): d is Deviation => d !== null)
        return replayDeviations(devs, eventDay)
    } catch (err) {
        logger.warn(`[reconcile_service] deviations unreadable for ${setlistId}`, err)
        return new Map()
    }
}

function summarize(diff: Diff, configured: boolean): string {
    const swaps = diff.chartSwaps
        ? ` ${diff.chartSwaps} row${diff.chartSwaps === 1 ? "" : "s"} ended on a chart the band swapped in for tonight; each row's \`chart\` names the planned and the played chart.`
        : ""
    return summarizeCues(diff, configured) + swaps
}

function summarizeCues(diff: Diff, configured: boolean): string {
    const c = diff.counts
    if (diff.historyRows === 0) {
        return configured
            ? "No cues were logged for this service, so nothing can be said about what fired. Every row is untracked — that is a statement about the cue log, not about the service."
            : "The cue history is not configured, so nothing can be said about what fired."
    }
    const parts = [
        `${c.performed} performed`,
        c.reordered ? `${c.reordered} out of order` : null,
        c.skipped ? `${c.skipped} skipped` : null,
        c.added ? `${c.added} audible` : null,
        `${c.untracked} untracked`,
    ].filter(Boolean)
    return (
        `${parts.join(", ")}. ` +
        "Untracked rows are ones the cue log cannot speak to — band-only songs, headers, " +
        "and anything outside the stretch where cues fired. They are not misses."
    )
}

export async function reconcileService(
    uid: string,
    args: ReconcileServiceArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ReconcileServiceResult | RichErrorEnvelope> {
    if (!args?.setlistId?.trim()) {
        return richError("invalid_argument", "setlistId is required.", {
            setlistId: args?.setlistId ?? null,
        })
    }
    if ((args.since && !args.until) || (!args.since && args.until)) {
        return richError(
            "invalid_argument",
            "Pass both `since` and `until`, or neither.",
            { since: args.since ?? null, until: args.until ?? null },
            "Omit both to use the service's own window: 30 minutes before the event, 4 hours after.",
        )
    }

    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    const role = await readUserRole(db, uid)
    const limited = await checkUserRateLimit(uid, "api", {
        bypass: role === "admin" || role === "band_leader",
    })
    if (limited) return richError("rate_limited", limited.error)

    const snap = await db.collection("setlists").doc(args.setlistId).get()
    if (!snap.exists) {
        return richError("setlist_not_found", `Setlist '${args.setlistId}' was not found.`, {
            setlistId: args.setlistId,
        })
    }
    const setlist = snap.data() as Record<string, unknown>
    if (rowOrg(setlist.orgId) !== org) {
        return richError("setlist_not_found", `Setlist '${args.setlistId}' was not found.`, {
            setlistId: args.setlistId,
        })
    }
    const setlistName = typeof setlist.name === "string" ? setlist.name : "Untitled"

    // The window. Without an eventDate there is nothing to centre it on, and a
    // guessed window would quietly reconcile against the wrong service.
    let since: string
    let until: string
    if (args.since && args.until) {
        if (Number.isNaN(Date.parse(args.since)) || Number.isNaN(Date.parse(args.until))) {
            return richError("invalid_argument", "`since` and `until` must be ISO instants.", {
                since: args.since,
                until: args.until,
            })
        }
        since = new Date(args.since).toISOString()
        until = new Date(args.until).toISOString()
    } else {
        const eventIso = isoOrNull(setlist.eventDate) ?? isoOrNull(setlist.date)
        const eventMs = eventIso ? Date.parse(eventIso) : NaN
        if (Number.isNaN(eventMs)) {
            return richError(
                "no_event_date",
                `Setlist '${args.setlistId}' has no usable eventDate, so the history window cannot be centred on it.`,
                { setlistId: args.setlistId },
                "Set an eventDate with update_setlist, or pass `since` and `until` explicitly.",
            )
        }
        since = new Date(eventMs - DEFAULT_BEFORE_MINUTES * 60_000).toISOString()
        until = new Date(eventMs + DEFAULT_AFTER_HOURS * 3_600_000).toISOString()
    }

    const plan = await loadPlan(db, args.setlistId)
    if (!plan) {
        return richError("setlist_not_found", `Setlist '${args.setlistId}' has no tracks.`, {
            setlistId: args.setlistId,
        })
    }

    const history = await fetchHistory({ since, until })
    if (!history.ok) {
        // Not a refusal of the tool — a refusal of the READ. Say which, so the
        // caller knows whether to retry or to configure something.
        return richError(
            history.code,
            history.message,
            { setlistId: args.setlistId, since, until },
            "The cue log lives in Overlays; `.live` only reads it. Nothing was written.",
        )
    }

    const chartHistory = await loadChartHistory(
        db,
        args.setlistId,
        eventDayOf(setlist.eventDate ?? setlist.date),
    )
    const diff = reconcile(args.setlistId, plan.rows, history.rows, chartHistory)
    const chapterLines = buildChapters(diff, args.chapterOffsetSeconds ?? 0).map((c) => c.line)
    const summary = summarize(diff, historyConfigured())

    const dryRun = args.dryRun !== false
    if (dryRun) {
        return {
            ok: true,
            setlistId: args.setlistId,
            setlistName,
            dryRun: true,
            window: { since, until },
            diff,
            chapters: chapterLines,
            summary,
            promoted: null,
        }
    }

    const promoted = await promote(db, uid, args.setlistId, setlistName, diff, org)
    if ("error" in promoted) return promoted

    return {
        ok: true,
        setlistId: args.setlistId,
        setlistName,
        dryRun: false,
        window: { since, until },
        diff,
        chapters: chapterLines,
        summary,
        promoted,
    }
}

/**
 * Create the "as performed" version beside the plan.
 *
 * A CLONE, never an edit: `cloneSetlist` writes a fresh setlist whose rows sit
 * at the same positions as the source's, so the diff's `plannedPosition` maps
 * straight onto the clone's `order`. Every mutation below lands on the CLONE.
 * The planned setlist is not opened for writing at any point.
 */
async function promote(
    db: DB,
    uid: string,
    sourceSetlistId: string,
    sourceName: string,
    diff: Diff,
    org: OrgId,
): Promise<
    | { setlistId: string; name: string; rowsRemoved: number; rowsAdded: number; rowsStamped: number }
    | RichErrorEnvelope
> {
    const name = `${sourceName} (as performed)`
    const cloned = await cloneSetlist(uid, { sourceSetlistId, newName: name }, org)
    if (!("ok" in cloned) || cloned.ok !== true) return cloned as RichErrorEnvelope

    const cloneId = cloned.setlistId
    const snap = await db.collection("tracks").where("setlistId", "==", cloneId).get()
    const cloneDocs = snap.docs
        .map((d) => ({
            ref: d.ref,
            id: d.id,
            order: Number((d.data() as { order?: unknown }).order) || 0,
        }))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

    const batch = db.batch()
    const nowIso = new Date().toISOString()
    let rowsRemoved = 0
    let rowsStamped = 0

    // Rows the service skipped come OUT of the performed version — that is what
    // makes it a record of the service rather than a copy of the plan. They are
    // still in the planned setlist, which is the point of not overwriting it.
    const removed = new Set<number>()
    for (const row of diff.rows) {
        if (row.plannedPosition === undefined) continue
        const target = cloneDocs[row.plannedPosition]
        if (!target) continue
        if (row.status === "skipped") {
            batch.delete(target.ref)
            removed.add(row.plannedPosition)
            rowsRemoved += 1
        } else {
            const patch: Record<string, unknown> = {}
            if (row.performedAt) patch.performedAt = row.performedAt
            // The performed version carries the tune actually played: a row
            // the band swapped for tonight is re-bonded, on the CLONE only.
            if (row.chart?.swapped && row.chart.performedFileId) {
                patch.fileId = row.chart.performedFileId
                patch.songId = row.chart.performedFileId
                patch.title = row.chart.performedTitle || row.title
            }
            if (Object.keys(patch).length > 0) {
                batch.update(target.ref, { ...patch, lastModifiedAt: nowIso })
                rowsStamped += 1
            }
        }
    }

    // Audibles, spliced at the position the diff already worked out. Order is
    // renumbered below, so a fractional slot here would only be temporary —
    // simpler to place them by their index in the diff's row list.
    const added = diff.rows.filter((r) => r.status === "added")
    const newIds: string[] = []
    for (const row of added) {
        const id = crypto.randomUUID()
        newIds.push(id)
        batch.set(db.collection("tracks").doc(id), {
            id,
            setlistId: cloneId,
            orgId: org,
            title: row.title,
            type: row.type ?? "prayer",
            ...(row.liturgyRef ? { liturgyRef: row.liturgyRef } : {}),
            performedAt: row.performedAt ?? null,
            order: 0, // renumbered below
            version: 1,
            lastModifiedAt: nowIso,
            lastModifiedBy: uid,
        })
    }

    // Renumber `order` over the surviving + added rows, in the diff's own order,
    // so the performed version reads top-to-bottom as the service ran.
    let position = 0
    let addedCursor = 0
    for (const row of diff.rows) {
        if (row.status === "added") {
            batch.update(db.collection("tracks").doc(newIds[addedCursor++]), { order: position++ })
            continue
        }
        if (row.plannedPosition === undefined) continue
        if (removed.has(row.plannedPosition)) continue
        const target = cloneDocs[row.plannedPosition]
        if (!target) continue
        batch.update(target.ref, { order: position++ })
    }

    batch.update(db.collection("setlists").doc(cloneId), {
        trackCount: position,
        performedFromSetlistId: sourceSetlistId,
        lastModifiedAt: nowIso,
        lastModifiedBy: uid,
    })

    await batch.commit()
    logger.info("[mcp] reconcile_service promoted", {
        sourceSetlistId,
        cloneId,
        rowsRemoved,
        rowsAdded: added.length,
        rowsStamped,
    })

    return { setlistId: cloneId, name, rowsRemoved, rowsAdded: added.length, rowsStamped }
}

/** Re-exported for the tests and the browser action. */
export type { Diff, DiffRow }
