import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    assertEditor,
} from "@/lib/mcp/server-tracks-write"
import {
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { rowOrg } from "@/lib/org/membership"

/**
 * Cycle-5 C5C-014 — unified "who's playing & leading this week" pivot.
 *
 * The MCP surface already exposes `list_musicians_on_date` (band rows
 * grouped by scheduling assignment status) and `get_setlist` (every track
 * including its per-row `leadMusician` vocal-lead), but nothing combined
 * the two into the single ergonomic the weekly-flow author actually wants:
 * "give me the assigned band PLUS the distinct vocal leads for this
 * service." This tool wraps the join.
 *
 * Accepts EITHER `setlistId` (direct lookup of one service's roster) OR
 * `eventDate` (UTC-day window across all setlists on that date). Both
 * paths return the same shape: `scheduling_assignments` (one entry per
 * `scheduling_assignments` row grouped by status — pending / confirmed /
 * declined / cancelled, same shape `list_musicians_on_date` emits) +
 * `vocal_leads` (distinct, non-null `track.leadMusician` strings across
 * every bonded track on the matched setlists).
 *
 * Auth: trusted-leader (admin OR band_leader). Mirrors the roster tools
 * — same gate as the in-app /schedule surface.
 */

type DB = FirebaseFirestore.Firestore

interface AssignmentSummary {
    assignmentId: string
    setlistId: string
    setlistName: string
    musicianUid: string
    musicianName: string
    instrument: string | null
    status: "pending" | "confirmed" | "declined" | "cancelled"
    autoConfirmed: boolean
}

interface MatchedSetlist {
    id: string
    name: string
    eventDate: string | null
}

export interface ListServicePersonnelArgs {
    setlistId?: string
    eventDate?: string
}

export interface ListServicePersonnelResult {
    ok: true
    setlistId: string | null
    eventDate: string | null
    matchedSetlists: MatchedSetlist[]
    scheduling_assignments: {
        pending: AssignmentSummary[]
        confirmed: AssignmentSummary[]
        declined: AssignmentSummary[]
        cancelled: AssignmentSummary[]
    }
    vocal_leads: string[]
    total: number
}

function summarizeAssignment(
    id: string,
    data: FirebaseFirestore.DocumentData,
): AssignmentSummary {
    const status =
        data.status === "pending" ||
        data.status === "confirmed" ||
        data.status === "declined" ||
        data.status === "cancelled"
            ? (data.status as AssignmentSummary["status"])
            : "pending"
    return {
        assignmentId: id,
        setlistId: typeof data.setlistId === "string" ? data.setlistId : "",
        setlistName:
            typeof data.setlistName === "string" ? data.setlistName : "",
        musicianUid:
            typeof data.musicianUid === "string" ? data.musicianUid : "",
        musicianName:
            typeof data.musicianName === "string" ? data.musicianName : "",
        instrument:
            typeof data.instrument === "string"
                ? (data.instrument as string)
                : null,
        status,
        autoConfirmed: data.autoConfirmed === true,
    }
}

function dayBoundsUtc(dateStr: string): { start: Date; end: Date } | null {
    let d: Date
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        d = new Date(`${dateStr}T00:00:00.000Z`)
    } else {
        d = new Date(dateStr)
    }
    if (Number.isNaN(d.getTime())) return null
    const start = new Date(d)
    start.setUTCHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 1)
    return { start, end }
}

function isoOfTimestampOrString(value: unknown): string | null {
    if (typeof value === "string") return value
    if (
        value &&
        typeof value === "object" &&
        "toDate" in value &&
        typeof (value as { toDate: unknown }).toDate === "function"
    ) {
        try {
            return (value as { toDate(): Date }).toDate().toISOString()
        } catch {
            return null
        }
    }
    return null
}

async function fetchSetlistsByDate(
    db: DB,
    eventDate: string,
    org: OrgId,
): Promise<{ ok: true; setlists: MatchedSetlist[] } | { ok: false; envelope: RichErrorEnvelope }> {
    const bounds = dayBoundsUtc(eventDate)
    if (!bounds) {
        return {
            ok: false,
            envelope: richError(
                "invalid_argument",
                `\`eventDate\` could not be parsed as a date: '${eventDate}'.`,
                { eventDate },
                "Use YYYY-MM-DD or a full ISO timestamp.",
            ),
        }
    }
    const { Timestamp } = await import("firebase-admin/firestore")
    const startTs = Timestamp.fromDate(bounds.start)
    const endTs = Timestamp.fromDate(bounds.end)
    const snap = await db
        .collection("setlists")
        .where("eventDate", ">=", startTs)
        .where("eventDate", "<", endTs)
        .get()
    const setlists: MatchedSetlist[] = snap.docs
        // v11-05-03: org-scope at the setlist seam — assignments are read by
        // these setlist ids below, so dropping cross-tenant setlists walls
        // their personnel too. rowOrg: missing → 'crc'.
        .filter((d) => rowOrg(d.data().orgId) === org)
        .map((d) => {
            const data = d.data()
            return {
                id: d.id,
                name: typeof data.name === "string" ? data.name : "",
                eventDate: isoOfTimestampOrString(data.eventDate),
            }
        })
    return { ok: true, setlists }
}

async function fetchSetlistById(
    db: DB,
    setlistId: string,
    org: OrgId,
): Promise<{ ok: true; setlist: MatchedSetlist | null } | { ok: false; envelope: RichErrorEnvelope }> {
    const snap = await db.collection("setlists").doc(setlistId).get()
    // v11-05-03: cross-tenant wall — a setlist in another org reads as
    // not-found (mirrors the v11-02 get_setlist pattern; no cross_tenant_denied
    // leak). rowOrg: missing → 'crc'.
    if (!snap.exists || rowOrg(snap.data()?.orgId) !== org) {
        return {
            ok: false,
            envelope: richError(
                "setlist_not_found",
                `Setlist '${setlistId}' was not found.`,
                { setlistId },
                "Verify the id via list_setlists.",
            ),
        }
    }
    const data = snap.data() ?? {}
    return {
        ok: true,
        setlist: {
            id: snap.id,
            name: typeof data.name === "string" ? data.name : "",
            eventDate: isoOfTimestampOrString(data.eventDate),
        },
    }
}

export async function listServicePersonnel(
    callerUid: string,
    args: ListServicePersonnelArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ListServicePersonnelResult | RichErrorEnvelope> {
    const hasSetlistId =
        typeof args?.setlistId === "string" && args.setlistId.trim().length > 0
    const hasEventDate =
        typeof args?.eventDate === "string" && args.eventDate.trim().length > 0
    if (!hasSetlistId && !hasEventDate) {
        return richError(
            "invalid_argument",
            "Pass either `setlistId` or `eventDate`.",
            { setlistId: args?.setlistId ?? null, eventDate: args?.eventDate ?? null },
            "Use `setlistId` for one specific service or `eventDate` for every setlist on a UTC day.",
        )
    }

    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, callerUid)
    if (!gate.ok) return gate

    // 1. Resolve matched setlists.
    let matchedSetlists: MatchedSetlist[]
    if (hasSetlistId) {
        const r = await fetchSetlistById(db, args.setlistId!.trim(), org)
        if (!r.ok) return r.envelope
        matchedSetlists = r.setlist ? [r.setlist] : []
    } else {
        const r = await fetchSetlistsByDate(db, args.eventDate!.trim(), org)
        if (!r.ok) return r.envelope
        matchedSetlists = r.setlists
    }

    const grouped: ListServicePersonnelResult["scheduling_assignments"] = {
        pending: [],
        confirmed: [],
        declined: [],
        cancelled: [],
    }
    const vocalLeadSet = new Set<string>()
    let total = 0

    if (matchedSetlists.length === 0) {
        return {
            ok: true,
            setlistId: hasSetlistId ? args.setlistId!.trim() : null,
            eventDate: hasEventDate ? args.eventDate!.trim() : null,
            matchedSetlists,
            scheduling_assignments: grouped,
            vocal_leads: [],
            total: 0,
        }
    }

    // 2. Assignments for the matched setlists (Firestore `in` cap = 30).
    const ids = matchedSetlists.map((s) => s.id)
    const CHUNK = 30
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const snap = await db
            .collection("scheduling_assignments")
            .where("setlistId", "in", chunk)
            .get()
        for (const d of snap.docs) {
            const summary = summarizeAssignment(d.id, d.data())
            grouped[summary.status].push(summary)
            total++
        }
    }

    // 3. Vocal leads — distinct `track.leadMusician` strings across every
    // bonded track on the matched setlists. Same chunking discipline.
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const snap = await db
            .collection("tracks")
            .where("setlistId", "in", chunk)
            .get()
        for (const d of snap.docs) {
            const data = d.data() as Record<string, unknown>
            const lead = typeof data.leadMusician === "string" ? data.leadMusician.trim() : ""
            if (lead) vocalLeadSet.add(lead)
        }
    }

    return {
        ok: true,
        setlistId: hasSetlistId ? args.setlistId!.trim() : null,
        eventDate: hasEventDate ? args.eventDate!.trim() : null,
        matchedSetlists,
        scheduling_assignments: grouped,
        vocal_leads: Array.from(vocalLeadSet).sort((a, b) => a.localeCompare(b)),
        total,
    }
}
