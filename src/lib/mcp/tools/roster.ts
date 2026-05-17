import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { checkUserRateLimit } from "@/lib/rate-limit"
import {
    assertEditor,
    readUserRole,
} from "@/lib/mcp/server-tracks-write"
import {
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import {
    rankMusicians,
    REQUIRED_INSTRUMENTS,
    type MusicianCandidate,
} from "@/lib/musician-suggestions"
import {
    assignMusiciansService,
    unassignAssignmentService,
    respondToAssignmentService,
    findActiveAssignment,
} from "@/lib/scheduling/assignment-service"

/**
 * Cycle-3 c1 — roster + scheduling MCP tools.
 *
 * Daniel's weekly authoring flow is "clone last week's setlist, tweak a few
 * songs, send it to the band". Per [[user_mcp_is_primary_author_workflow]]
 * + [[project_david_band_leader]], David Lazaroff is now the second
 * band_leader, so both trusted leaders (admin + band_leader) must reach
 * the scheduling surface through Claude Desktop without opening the
 * in-app `/schedule` page.
 *
 * Nine tools, READ + assignment side only. NO `set_unavailability` —
 * deferred to c1.5 pending Daniel-ratified data-model call (revive
 * `musician_availability` collection vs. model as `declined`-status
 * pre-assignments). Daniel ratified this scope 2026-05-18T17:10Z.
 *
 * Auth model:
 *   - trusted-leader gate (admin OR band_leader) for everything except
 *     `respond_to_assignment` — uses `assertEditor` from
 *     `mcp/server-tracks-write.ts`, returning the rich `forbidden_role`
 *     envelope on refusal.
 *   - `respond_to_assignment` is musician-self-write — gated via
 *     `assignment.musicianUid === callerUid`, NOT trusted-leader. Any
 *     authenticated user can accept/decline their OWN pending assignment.
 *
 * dryRun + force discipline (F-05 standing rule per
 * [[feedback_dryrun_is_observability]]):
 *   - `assign_musician` + `unassign_musician` default `dryRun: true` and
 *     refuse without `force: true` on real writes. dryRun returns the
 *     resolved plan (denormalized musician fields, current/projected
 *     assignment status) without writing. The rationale: assign/unassign
 *     trigger email + SMS + push fan-out, so the agent should be able
 *     to PREVIEW the side-effect surface before committing.
 *
 * Trusted-leader rate-limit bypass per
 * [[feedback_admin_rate_limit_bypass]]: assign + unassign call
 * `checkUserRateLimit(uid, 'api', {bypass: trusted-leader})` so admins
 * and band_leaders aren't capped during bulk setlist authoring. Other
 * trusted-leader tools (list_*, get_*, suggest_*, list_pending) are
 * cheap reads — no per-tool rate-limit (the global MCP-wire limiter
 * still applies).
 *
 * Rich envelope on every refusal/validation failure per b1's contract:
 *   - `forbidden_role` (non-admin/band_leader on trusted-leader tools)
 *   - `not_found` (missing setlistId / assignmentId / uid)
 *   - `invalid_argument` (input shape mismatch)
 *   - `rate_limited` (per-uid limiter triggered, only for non-trusted)
 *   - `validation_error` (zod via remap layer)
 *
 * Write tools delegate to `src/lib/scheduling/assignment-service.ts`
 * (also called by the HTTP routes) so Firestore writes + notification
 * fan-out semantics are byte-identical regardless of caller surface.
 */

type DB = FirebaseFirestore.Firestore

// ────────────────────────────────────────────────────────────────────────────
// shared types
// ────────────────────────────────────────────────────────────────────────────

interface MusicianRow {
    uid: string
    displayName: string
    email: string
    role: string
    instrument: string | null
    instrumentLabel: string | null
    schedulingTier: "core" | "regular" | "guest"
    phone: string | null
    notificationPreferences: {
        email: boolean
        sms: boolean
        push: boolean
    }
}

function buildMusicianRow(
    uid: string,
    data: FirebaseFirestore.DocumentData,
): MusicianRow | null {
    const profile = data.musicianProfile as
        | Record<string, unknown>
        | undefined
    const instrument =
        profile && typeof profile.instrument === "string"
            ? (profile.instrument as string)
            : null
    if (!instrument) return null

    const presetLabel = INSTRUMENT_PRESETS[instrument]?.label ?? null
    const rawTier =
        profile && typeof profile.schedulingTier === "string"
            ? (profile.schedulingTier as string)
            : "regular"
    const schedulingTier =
        rawTier === "core" || rawTier === "regular" || rawTier === "guest"
            ? (rawTier as "core" | "regular" | "guest")
            : "regular"

    const prefs =
        (profile?.notificationPreferences as
            | Record<string, unknown>
            | undefined) ?? {}
    const notificationPreferences = {
        email: prefs.email !== false, // default true
        sms: prefs.sms === true, // default false
        push: prefs.push !== false, // default true
    }

    return {
        uid,
        displayName:
            typeof data.displayName === "string" && data.displayName
                ? (data.displayName as string)
                : typeof data.email === "string"
                  ? (data.email as string).split("@")[0]
                  : uid,
        email: typeof data.email === "string" ? (data.email as string) : "",
        role: typeof data.role === "string" ? (data.role as string) : "musician",
        instrument,
        instrumentLabel: presetLabel,
        schedulingTier,
        phone:
            profile && typeof profile.phone === "string"
                ? (profile.phone as string)
                : null,
        notificationPreferences,
    }
}

async function loadUserMusicianRow(
    db: DB,
    uid: string,
): Promise<MusicianRow | null> {
    const snap = await db.collection("users").doc(uid).get()
    if (!snap.exists) return null
    return buildMusicianRow(uid, snap.data() ?? {})
}

// ────────────────────────────────────────────────────────────────────────────
// list_musicians
// ────────────────────────────────────────────────────────────────────────────

export interface ListMusiciansArgs {
    instrument?: string
    schedulingTier?: "core" | "regular" | "guest"
}

export interface ListMusiciansResult {
    ok: true
    musicians: MusicianRow[]
    count: number
}

export async function listMusicians(
    uid: string,
    args: ListMusiciansArgs = {},
): Promise<ListMusiciansResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, uid)
    if (!gate.ok) return gate

    try {
        const snap = await db
            .collection("users")
            .where("role", "in", ["musician", "band_leader", "admin"])
            .get()

        const filterInstrument = args.instrument?.trim().toLowerCase()
        const filterTier = args.schedulingTier

        const rows: MusicianRow[] = []
        for (const d of snap.docs) {
            const row = buildMusicianRow(d.id, d.data())
            if (!row) continue
            if (filterTier && row.schedulingTier !== filterTier) continue
            if (filterInstrument) {
                const key = row.instrument?.toLowerCase() ?? ""
                const label = row.instrumentLabel?.toLowerCase() ?? ""
                if (
                    key !== filterInstrument &&
                    !key.includes(filterInstrument) &&
                    !filterInstrument.includes(key) &&
                    !label.includes(filterInstrument)
                ) {
                    continue
                }
            }
            rows.push(row)
        }

        rows.sort((a, b) =>
            a.displayName.localeCompare(b.displayName, undefined, {
                sensitivity: "base",
            }),
        )

        return { ok: true, musicians: rows, count: rows.length }
    } catch (err) {
        return richError(
            "list_musicians_failed",
            `Failed to enumerate musicians: ${
                err instanceof Error ? err.message : String(err)
            }`,
            {},
            "Check Firestore connectivity; the users collection is the source.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// get_musician_profile
// ────────────────────────────────────────────────────────────────────────────

export interface GetMusicianProfileArgs {
    uid: string
}

export interface GetMusicianProfileResult {
    ok: true
    musician: MusicianRow
}

export async function getMusicianProfile(
    callerUid: string,
    args: GetMusicianProfileArgs,
): Promise<GetMusicianProfileResult | RichErrorEnvelope> {
    if (!args?.uid || typeof args.uid !== "string") {
        return richError(
            "invalid_argument",
            "`uid` must be a non-empty string.",
            { field: "uid" },
            "Pass a valid Firebase user uid (use list_musicians to discover one).",
        )
    }
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, callerUid)
    if (!gate.ok) return gate

    try {
        const row = await loadUserMusicianRow(db, args.uid)
        if (!row) {
            return richError(
                "not_found",
                `User '${args.uid}' has no musician profile (instrument not set, or user does not exist).`,
                { uid: args.uid },
                "Verify the uid via list_musicians, or have the user complete their MusicianProfileSettings.",
            )
        }
        return { ok: true, musician: row }
    } catch (err) {
        return richError(
            "get_musician_profile_failed",
            `Failed to read musician profile: ${
                err instanceof Error ? err.message : String(err)
            }`,
            { uid: args.uid },
            "Check Firestore connectivity.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// list_musicians_on_date
// ────────────────────────────────────────────────────────────────────────────

export interface ListMusiciansOnDateArgs {
    /** ISO date string (YYYY-MM-DD or full ISO). */
    eventDate: string
    /** Optional templateType to narrow when multiple services share a date. */
    templateType?:
        | "shabbat_morning"
        | "friday_night"
        | "rosh_hashanah"
        | "yom_kippur"
        | "festival"
        | "other"
}

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

export interface ListMusiciansOnDateResult {
    ok: true
    eventDate: string
    matchedSetlists: { id: string; name: string; templateType: string | null }[]
    grouped: {
        pending: AssignmentSummary[]
        confirmed: AssignmentSummary[]
        declined: AssignmentSummary[]
        cancelled: AssignmentSummary[]
    }
    total: number
}

function dayBoundsUtc(dateStr: string): { start: Date; end: Date } | null {
    // Parse as date-only when input looks like YYYY-MM-DD; otherwise full ISO.
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

export async function listMusiciansOnDate(
    callerUid: string,
    args: ListMusiciansOnDateArgs,
): Promise<ListMusiciansOnDateResult | RichErrorEnvelope> {
    if (!args?.eventDate || typeof args.eventDate !== "string") {
        return richError(
            "invalid_argument",
            "`eventDate` must be a non-empty ISO date string.",
            { field: "eventDate" },
            "Pass YYYY-MM-DD or a full ISO timestamp like 2026-06-07T19:00:00Z.",
        )
    }
    const bounds = dayBoundsUtc(args.eventDate)
    if (!bounds) {
        return richError(
            "invalid_argument",
            `\`eventDate\` could not be parsed as a date: '${args.eventDate}'.`,
            { eventDate: args.eventDate },
            "Use YYYY-MM-DD or a full ISO timestamp.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, callerUid)
    if (!gate.ok) return gate

    try {
        // Resolve setlists for the date window. eventDate field is a
        // Firestore Timestamp in modern setlists, but legacy rows may store
        // the string ISO. Use a range query on the timestamp side; legacy
        // rows can be matched via a follow-up grep if needed.
        const { Timestamp } = await import("firebase-admin/firestore")
        const startTs = Timestamp.fromDate(bounds.start)
        const endTs = Timestamp.fromDate(bounds.end)

        const setlistsSnap = await db
            .collection("setlists")
            .where("eventDate", ">=", startTs)
            .where("eventDate", "<", endTs)
            .get()

        const matchedSetlists: ListMusiciansOnDateResult["matchedSetlists"] = []
        for (const d of setlistsSnap.docs) {
            const data = d.data()
            if (
                args.templateType &&
                data.templateType !== args.templateType
            ) {
                continue
            }
            matchedSetlists.push({
                id: d.id,
                name: typeof data.name === "string" ? data.name : "",
                templateType:
                    typeof data.templateType === "string"
                        ? (data.templateType as string)
                        : null,
            })
        }

        if (matchedSetlists.length === 0) {
            return {
                ok: true,
                eventDate: args.eventDate,
                matchedSetlists: [],
                grouped: {
                    pending: [],
                    confirmed: [],
                    declined: [],
                    cancelled: [],
                },
                total: 0,
            }
        }

        // Query assignments for the matched setlists. Firestore `in` query
        // is capped at 30 ids — chunk if needed (rare for one day's services).
        const ids = matchedSetlists.map((s) => s.id)
        const CHUNK = 30
        const grouped: ListMusiciansOnDateResult["grouped"] = {
            pending: [],
            confirmed: [],
            declined: [],
            cancelled: [],
        }
        let total = 0
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

        return {
            ok: true,
            eventDate: args.eventDate,
            matchedSetlists,
            grouped,
            total,
        }
    } catch (err) {
        return richError(
            "list_musicians_on_date_failed",
            `Failed to list musicians on date: ${
                err instanceof Error ? err.message : String(err)
            }`,
            { eventDate: args.eventDate },
            "Check Firestore connectivity + that the eventDate is a parseable date string.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// list_pending_assignments
// ────────────────────────────────────────────────────────────────────────────

export interface ListPendingAssignmentsArgs {
    uid?: string
}

export interface ListPendingAssignmentsResult {
    ok: true
    assignments: AssignmentSummary[]
    count: number
}

export async function listPendingAssignments(
    callerUid: string,
    args: ListPendingAssignmentsArgs = {},
): Promise<ListPendingAssignmentsResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, callerUid)
    if (!gate.ok) return gate

    try {
        let q: FirebaseFirestore.Query = db
            .collection("scheduling_assignments")
            .where("status", "==", "pending")
        if (args.uid) {
            q = q.where("musicianUid", "==", args.uid)
        }
        const snap = await q.get()
        const assignments = snap.docs.map((d) =>
            summarizeAssignment(d.id, d.data()),
        )
        // Stable order: by setlistName then musicianName.
        assignments.sort((a, b) => {
            const s = a.setlistName.localeCompare(
                b.setlistName,
                undefined,
                { sensitivity: "base" },
            )
            if (s !== 0) return s
            return a.musicianName.localeCompare(b.musicianName, undefined, {
                sensitivity: "base",
            })
        })
        return { ok: true, assignments, count: assignments.length }
    } catch (err) {
        return richError(
            "list_pending_assignments_failed",
            `Failed to list pending assignments: ${
                err instanceof Error ? err.message : String(err)
            }`,
            args.uid ? { uid: args.uid } : {},
            "Check Firestore connectivity.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// suggest_musicians
// ────────────────────────────────────────────────────────────────────────────

export interface SuggestMusiciansArgs {
    setlistId: string
    instrument?: string
}

export interface SuggestMusiciansResult {
    ok: true
    suggestions: {
        uid: string
        name: string
        email: string
        instrument: string | null
        instrumentLabel: string | null
        schedulingTier: "core" | "regular" | "guest"
        phone: string | null
        instrumentMatch: boolean | null
    }[]
}

export async function suggestMusicians(
    callerUid: string,
    args: SuggestMusiciansArgs,
): Promise<SuggestMusiciansResult | RichErrorEnvelope> {
    if (!args?.setlistId || typeof args.setlistId !== "string") {
        return richError(
            "invalid_argument",
            "`setlistId` must be a non-empty string.",
            { field: "setlistId" },
            "Get a setlistId from list_setlists or create_setlist.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, callerUid)
    if (!gate.ok) return gate

    try {
        const setlistSnap = await db
            .collection("setlists")
            .doc(args.setlistId)
            .get()
        if (!setlistSnap.exists) {
            return richError(
                "not_found",
                `Setlist '${args.setlistId}' was not found.`,
                { setlistId: args.setlistId },
                "Verify the id via list_setlists.",
            )
        }

        const usersSnap = await db
            .collection("users")
            .where("role", "in", ["musician", "band_leader", "admin"])
            .get()
        const musicians: MusicianRow[] = []
        for (const d of usersSnap.docs) {
            const row = buildMusicianRow(d.id, d.data())
            if (row) musicians.push(row)
        }

        const assignmentsSnap = await db
            .collection("scheduling_assignments")
            .where("setlistId", "==", args.setlistId)
            .where("status", "in", ["pending", "confirmed"])
            .get()
        const assignedUids = new Set(
            assignmentsSnap.docs.map((d) => d.data().musicianUid as string),
        )

        type Suggestion = MusicianRow & { instrumentMatch?: boolean }
        let suggestions: Suggestion[] = musicians.filter(
            (m) => !assignedUids.has(m.uid),
        )

        if (args.instrument) {
            const want = args.instrument.toLowerCase()
            const matches = suggestions.filter((m) => {
                if (!m.instrument) return false
                const key = m.instrument.toLowerCase()
                if (key === want) return true
                const keyWords = key.replace(/_/g, " ")
                return keyWords.includes(want) || want.includes(keyWords)
            })
            const nonMatches = suggestions.filter(
                (m) => !matches.some((im) => im.uid === m.uid),
            )
            suggestions = [
                ...matches.map((m) => ({ ...m, instrumentMatch: true })),
                ...nonMatches.map((m) => ({ ...m, instrumentMatch: false })),
            ]
        }

        const tierOrder: Record<string, number> = {
            core: 0,
            regular: 1,
            guest: 2,
        }
        suggestions.sort(
            (a, b) =>
                (tierOrder[a.schedulingTier] ?? 1) -
                (tierOrder[b.schedulingTier] ?? 1),
        )

        return {
            ok: true,
            suggestions: suggestions.slice(0, 10).map((m) => ({
                uid: m.uid,
                name: m.displayName,
                email: m.email,
                instrument: m.instrument,
                instrumentLabel: m.instrumentLabel,
                schedulingTier: m.schedulingTier,
                phone: m.phone,
                instrumentMatch: m.instrumentMatch ?? null,
            })),
        }
    } catch (err) {
        return richError(
            "suggest_musicians_failed",
            `Failed to suggest musicians: ${
                err instanceof Error ? err.message : String(err)
            }`,
            { setlistId: args.setlistId },
            "Check Firestore connectivity.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// suggest_band
// ────────────────────────────────────────────────────────────────────────────

export interface SuggestBandArgs {
    setlistId: string
}

export interface SuggestBandResult {
    ok: true
    rabbiGuidance: string | null
    coverageGap: string[]
    suggestions: ReturnType<typeof rankMusicians>
}

const RECENT_WINDOW = 10

export async function suggestBand(
    callerUid: string,
    args: SuggestBandArgs,
): Promise<SuggestBandResult | RichErrorEnvelope> {
    if (!args?.setlistId || typeof args.setlistId !== "string") {
        return richError(
            "invalid_argument",
            "`setlistId` must be a non-empty string.",
            { field: "setlistId" },
            "Get a setlistId from list_setlists or create_setlist.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, callerUid)
    if (!gate.ok) return gate

    try {
        const setlistSnap = await db
            .collection("setlists")
            .doc(args.setlistId)
            .get()
        if (!setlistSnap.exists) {
            return richError(
                "not_found",
                `Setlist '${args.setlistId}' was not found.`,
                { setlistId: args.setlistId },
                "Verify the id via list_setlists.",
            )
        }
        const setlistData = setlistSnap.data() ?? {}
        const rabbiName =
            typeof setlistData.rabbi === "string"
                ? (setlistData.rabbi as string)
                : null
        const selectedUids = Array.isArray(setlistData.assignedUids)
            ? (setlistData.assignedUids as string[]).filter(Boolean)
            : []

        const [usersSnap, recentSnap, configSnap] = await Promise.all([
            db
                .collection("users")
                .where("role", "in", ["musician", "band_leader", "admin"])
                .get(),
            db
                .collection("scheduling_assignments")
                .where("status", "==", "confirmed")
                .orderBy("assignedAt", "desc")
                .limit(RECENT_WINDOW * 20)
                .get(),
            db.collection("config").doc("congregation").get(),
        ])

        const congData = configSnap.data()
        const rabbiProfiles =
            (congData?.scheduling?.rabbiProfiles as
                | Array<{
                      name?: string
                      musicalRole?: string
                      bandSizeGuidance?: string
                      instruments?: string[]
                  }>
                | undefined) ?? []
        const rabbiProfile = rabbiName
            ? rabbiProfiles.find((p) => {
                  const n = String(p?.name ?? "").toLowerCase()
                  const r = rabbiName.toLowerCase()
                  return n && (r.includes(n) || n.includes(r))
              }) ?? null
            : null

        const playCountMap = new Map<string, number>()
        recentSnap.docs.forEach((d) => {
            const uid = d.data().musicianUid as string | undefined
            if (!uid) return
            playCountMap.set(
                uid,
                Math.min((playCountMap.get(uid) ?? 0) + 1, RECENT_WINDOW),
            )
        })
        const totalRecentServices = new Set(
            recentSnap.docs
                .map((d) => d.data().setlistId)
                .filter((x): x is string => typeof x === "string"),
        ).size
        const windowSize = Math.min(totalRecentServices, RECENT_WINDOW)

        const candidates: MusicianCandidate[] = []
        const selectedInstrumentKeys: string[] = []
        for (const d of usersSnap.docs) {
            const row = buildMusicianRow(d.id, d.data())
            if (!row) continue
            candidates.push({
                uid: row.uid,
                name: row.displayName,
                email: row.email,
                phone: row.phone,
                instrumentKey: row.instrument,
                instrumentLabel: row.instrumentLabel,
                schedulingTier: row.schedulingTier,
                confirmedCount: playCountMap.get(row.uid) ?? 0,
                recentWindowSize: windowSize,
            })
            if (selectedUids.includes(row.uid) && row.instrument) {
                selectedInstrumentKeys.push(row.instrument)
            }
        }

        const ranked = rankMusicians({
            candidates,
            alreadySelectedUids: new Set(selectedUids),
            currentInstrumentKeys: selectedInstrumentKeys,
            rabbiProfile:
                rabbiProfile && rabbiProfile.musicalRole
                    ? {
                          musicalRole: rabbiProfile.musicalRole,
                          bandSizeGuidance:
                              rabbiProfile.bandSizeGuidance ?? "",
                          instruments: rabbiProfile.instruments,
                      }
                    : null,
        })

        const coverageGap = [...REQUIRED_INSTRUMENTS].filter(
            (k) => !selectedInstrumentKeys.includes(k),
        )

        return {
            ok: true,
            rabbiGuidance: rabbiProfile?.bandSizeGuidance ?? null,
            coverageGap,
            suggestions: ranked.slice(0, 12),
        }
    } catch (err) {
        return richError(
            "suggest_band_failed",
            `Failed to suggest band: ${
                err instanceof Error ? err.message : String(err)
            }`,
            { setlistId: args.setlistId },
            "Check Firestore connectivity.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// assign_musician
// ────────────────────────────────────────────────────────────────────────────

export interface AssignMusicianArgs {
    setlistId: string
    uid: string
    instrument?: string
    dryRun?: boolean
    force?: boolean
}

export interface AssignMusicianResult {
    ok: true
    setlistId: string
    setlistName: string
    musician: {
        uid: string
        name: string
        email: string
        instrument: string | null
        schedulingTier: "core" | "regular" | "guest"
    }
    /** Status the assignment WOULD land in (auto-confirmed for core; pending otherwise). */
    projectedStatus: "confirmed" | "pending"
    /** True when the musician was already actively assigned (no-op idempotent path). */
    alreadyAssigned: boolean
    /** True for the previewed plan (dryRun only — real-run refusals return rich force_required). */
    dryRun: boolean
    /** True when force:true completed an actual Firestore write + notifications. */
    committed: boolean
}

export async function assignMusician(
    callerUid: string,
    args: AssignMusicianArgs,
): Promise<AssignMusicianResult | RichErrorEnvelope> {
    if (!args?.setlistId || typeof args.setlistId !== "string") {
        return richError(
            "invalid_argument",
            "`setlistId` must be a non-empty string.",
            { field: "setlistId" },
        )
    }
    if (!args?.uid || typeof args.uid !== "string") {
        return richError(
            "invalid_argument",
            "`uid` must be a non-empty string.",
            { field: "uid" },
            "Discover candidate uids via list_musicians or suggest_musicians.",
        )
    }
    initAdmin()
    const db = getFirestore()

    const gate = await assertEditor(db, callerUid)
    if (!gate.ok) return gate

    // Trusted-leader rate-limit bypass per feedback_admin_rate_limit_bypass.
    const role = await readUserRole(db, callerUid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(callerUid, "api", { bypass })
    if (limited) {
        return richError(
            "rate_limited",
            limited.error,
            { retryAfterSec: limited.retryAfterSec },
            "Retry after the cooldown window, or ask an admin to elevate the caller role.",
        )
    }

    const dryRun = args.dryRun !== false
    const force = args.force === true

    const setlistSnap = await db
        .collection("setlists")
        .doc(args.setlistId)
        .get()
    if (!setlistSnap.exists) {
        return richError(
            "not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    }
    const setlistData = setlistSnap.data() ?? {}
    const setlistName =
        typeof setlistData.name === "string" ? setlistData.name : ""
    const eventDateRaw = setlistData.eventDate
    let eventDateIso: string | null = null
    if (eventDateRaw) {
        if (typeof eventDateRaw === "string") {
            eventDateIso = eventDateRaw
        } else if (
            typeof eventDateRaw === "object" &&
            eventDateRaw !== null &&
            "toDate" in eventDateRaw &&
            typeof (eventDateRaw as { toDate: () => Date }).toDate === "function"
        ) {
            try {
                eventDateIso = (eventDateRaw as { toDate: () => Date })
                    .toDate()
                    .toISOString()
            } catch {
                eventDateIso = null
            }
        }
    }
    const serviceType =
        typeof setlistData.templateType === "string"
            ? (setlistData.templateType as string)
            : null

    const musicianRow = await loadUserMusicianRow(db, args.uid)
    if (!musicianRow) {
        return richError(
            "not_found",
            `User '${args.uid}' has no musician profile (instrument not set, or user does not exist).`,
            { uid: args.uid },
            "Verify the uid via list_musicians, or have the user complete their MusicianProfileSettings.",
        )
    }

    const instrument = args.instrument ?? musicianRow.instrument ?? undefined
    const projectedStatus: "confirmed" | "pending" =
        musicianRow.schedulingTier === "core" ? "confirmed" : "pending"

    // Resolve "already assigned" idempotency BEFORE committing.
    const existing = await findActiveAssignment(db, args.setlistId, args.uid)
    const alreadyAssigned = existing !== null

    const baseResult: Omit<AssignMusicianResult, "dryRun" | "committed"> = {
        ok: true,
        setlistId: args.setlistId,
        setlistName,
        musician: {
            uid: musicianRow.uid,
            name: musicianRow.displayName,
            email: musicianRow.email,
            instrument: instrument ?? null,
            schedulingTier: musicianRow.schedulingTier,
        },
        projectedStatus,
        alreadyAssigned,
    }

    if (dryRun) {
        return { ...baseResult, dryRun: true, committed: false }
    }
    if (!force) {
        // Cycle-3 REG-003: real-run without force → rich force_required.
        return richError(
            "force_required",
            "Pass force:true to commit the musician assignment.",
            {
                setlistId: args.setlistId,
                dryRunPlan: { ...baseResult, dryRun: false, committed: false },
            },
            "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
        )
    }

    if (alreadyAssigned) {
        // Idempotent — service would skip on already_active anyway.
        return {
            ...baseResult,
            dryRun: false,
            committed: false,
        }
    }

    try {
        const callerSnap = await db.collection("users").doc(callerUid).get()
        const actorEmail =
            callerSnap.exists &&
            typeof callerSnap.data()?.email === "string"
                ? (callerSnap.data()!.email as string)
                : null

        await assignMusiciansService(db, {
            setlistId: args.setlistId,
            setlistName,
            eventDate: eventDateIso,
            serviceType,
            musicians: [
                {
                    uid: musicianRow.uid,
                    name: musicianRow.displayName,
                    email: musicianRow.email,
                    phone: musicianRow.phone ?? undefined,
                    instrument: instrument,
                    schedulingTier: musicianRow.schedulingTier,
                },
            ],
            actor: { uid: callerUid, email: actorEmail },
        })

        logger.info("[mcp] assign_musician committed", {
            callerUid,
            setlistId: args.setlistId,
            uid: args.uid,
            projectedStatus,
        })

        return {
            ...baseResult,
            dryRun: false,
            committed: true,
        }
    } catch (err) {
        return richError(
            "assign_musician_failed",
            `Failed to assign musician: ${
                err instanceof Error ? err.message : String(err)
            }`,
            { setlistId: args.setlistId, uid: args.uid },
            "Inspect logs; the underlying transaction or notification fan-out failed.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// unassign_musician
// ────────────────────────────────────────────────────────────────────────────

export interface UnassignMusicianArgs {
    setlistId: string
    uid: string
    dryRun?: boolean
    force?: boolean
}

export interface UnassignMusicianResult {
    ok: true
    setlistId: string
    uid: string
    /** Set when an active assignment exists; null when no-op. */
    assignmentId: string | null
    /** Status the assignment was in before this call (null when no active assignment). */
    previousStatus: "pending" | "confirmed" | null
    dryRun: boolean
    committed: boolean
}

export async function unassignMusician(
    callerUid: string,
    args: UnassignMusicianArgs,
): Promise<UnassignMusicianResult | RichErrorEnvelope> {
    if (!args?.setlistId || typeof args.setlistId !== "string") {
        return richError(
            "invalid_argument",
            "`setlistId` must be a non-empty string.",
            { field: "setlistId" },
        )
    }
    if (!args?.uid || typeof args.uid !== "string") {
        return richError(
            "invalid_argument",
            "`uid` must be a non-empty string.",
            { field: "uid" },
        )
    }
    initAdmin()
    const db = getFirestore()

    const gate = await assertEditor(db, callerUid)
    if (!gate.ok) return gate

    const role = await readUserRole(db, callerUid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(callerUid, "api", { bypass })
    if (limited) {
        return richError(
            "rate_limited",
            limited.error,
            { retryAfterSec: limited.retryAfterSec },
            "Retry after the cooldown window, or ask an admin to elevate the caller role.",
        )
    }

    const dryRun = args.dryRun !== false
    const force = args.force === true

    const setlistSnap = await db
        .collection("setlists")
        .doc(args.setlistId)
        .get()
    if (!setlistSnap.exists) {
        return richError(
            "not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    }

    const existing = await findActiveAssignment(db, args.setlistId, args.uid)
    const previousStatus =
        existing && (existing.data.status === "pending" ||
            existing.data.status === "confirmed")
            ? (existing.data.status as "pending" | "confirmed")
            : null
    const baseResult: Omit<UnassignMusicianResult, "dryRun" | "committed"> = {
        ok: true,
        setlistId: args.setlistId,
        uid: args.uid,
        assignmentId: existing?.id ?? null,
        previousStatus,
    }

    if (dryRun) {
        return { ...baseResult, dryRun: true, committed: false }
    }
    if (!force) {
        // Cycle-3 REG-003: real-run without force → rich force_required.
        return richError(
            "force_required",
            "Pass force:true to commit the musician unassignment.",
            {
                setlistId: args.setlistId,
                uid: args.uid,
                dryRunPlan: { ...baseResult, dryRun: false, committed: false },
            },
            "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
        )
    }
    if (!existing) {
        // No-op: nothing to cancel.
        return { ...baseResult, dryRun: false, committed: false }
    }

    const result = await unassignAssignmentService(db, existing.id)
    if (!result.ok) {
        if (result.kind === "not_found") {
            // Race: assignment vanished between findActive + service call.
            return {
                ...baseResult,
                assignmentId: null,
                previousStatus: null,
                dryRun: false,
                committed: false,
            }
        }
        // invalid_transition
        return richError(
            "validation_error",
            `Cannot cancel assignment in '${result.currentStatus}' state.`,
            {
                setlistId: args.setlistId,
                uid: args.uid,
                assignmentId: existing.id,
                currentStatus: result.currentStatus,
            },
            "The assignment has already been declined or cancelled — no further action needed.",
        )
    }

    logger.info("[mcp] unassign_musician committed", {
        callerUid,
        setlistId: args.setlistId,
        uid: args.uid,
        assignmentId: existing.id,
    })

    return { ...baseResult, dryRun: false, committed: true }
}

// ────────────────────────────────────────────────────────────────────────────
// respond_to_assignment
// ────────────────────────────────────────────────────────────────────────────

export interface RespondToAssignmentArgs {
    assignmentId: string
    /** New status — 'confirmed' (accept) or 'declined' (decline). */
    status: "confirmed" | "declined"
    declineReason?: string
}

export interface RespondToAssignmentResult {
    ok: true
    assignmentId: string
    status: "confirmed" | "declined"
}

export async function respondToAssignment(
    callerUid: string,
    args: RespondToAssignmentArgs,
): Promise<RespondToAssignmentResult | RichErrorEnvelope> {
    if (!args?.assignmentId || typeof args.assignmentId !== "string") {
        return richError(
            "invalid_argument",
            "`assignmentId` must be a non-empty string.",
            { field: "assignmentId" },
            "Discover assignmentIds via list_pending_assignments.",
        )
    }
    if (args?.status !== "confirmed" && args?.status !== "declined") {
        return richError(
            "invalid_argument",
            "`status` must be 'confirmed' or 'declined'.",
            { field: "status", got: args?.status ?? null },
        )
    }
    initAdmin()
    const db = getFirestore()

    // No trusted-leader gate — own-assignment check is enforced inside the
    // service module via assignment.musicianUid === actorUid. Any
    // authenticated caller may respond to their OWN pending assignment.

    const action: "accept" | "decline" =
        args.status === "confirmed" ? "accept" : "decline"

    const result = await respondToAssignmentService(db, {
        assignmentId: args.assignmentId,
        actorUid: callerUid,
        action,
        declineReason: args.declineReason,
    })

    if (!result.ok) {
        if (result.kind === "not_found") {
            return richError(
                "not_found",
                `Assignment '${args.assignmentId}' was not found.`,
                { assignmentId: args.assignmentId },
                "Verify the assignmentId via list_pending_assignments.",
            )
        }
        if (result.kind === "forbidden") {
            return richError(
                "forbidden_assignment",
                "You may only respond to your own pending assignment.",
                { assignmentId: args.assignmentId, callerUid },
                "Ask the assigned musician to respond, or cancel via unassign_musician (band_leader).",
            )
        }
        // already_responded
        return richError(
            "validation_error",
            `Assignment already ${result.currentStatus}.`,
            {
                assignmentId: args.assignmentId,
                currentStatus: result.currentStatus,
            },
            "The assignment is no longer in pending state — no further action needed.",
        )
    }

    return {
        ok: true,
        assignmentId: result.assignmentId,
        status: result.status,
    }
}
