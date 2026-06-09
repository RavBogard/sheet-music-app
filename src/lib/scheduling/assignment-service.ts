import "server-only"

import { logger } from "@/lib/logger"
import { BASE_URL } from "@/lib/constants"
import { formatEventDate } from "@/lib/firestore-helpers"
import { detectNewSongs, type TrackRef } from "@/lib/new-song-detector"
import { sendSchedulingEmail } from "@/lib/email-scheduling"
import {
    sendSchedulingAssignmentSMS,
    sendSchedulingCancellationSMS,
} from "@/lib/sms"
import { sendPushToUsers } from "@/lib/push-send"
import { rowOrg } from "@/lib/org/membership"

/**
 * Shared scheduling service module.
 *
 * Cycle-3 c1 — extracted (additive, non-breaking) from the inline
 * implementations in `src/app/api/scheduling/{assign,unassign,respond}/route.ts`
 * so the MCP tool layer in `src/lib/mcp/tools/roster.ts` can call the
 * SAME transactional + notification logic. The HTTP route handlers
 * delegate to these functions and keep their public wire contracts
 * unchanged — only the route's body changes; method, schema, role gate,
 * rate-limit posture, and response shape are all preserved.
 *
 * Why a shared module:
 *  - Daniel authors via MCP per [[user_mcp_is_primary_author_workflow]];
 *    David still uses the in-app `/schedule` page. Both surfaces must
 *    produce identical Firestore writes + notification fan-out. One
 *    copy of the logic eliminates drift.
 *  - The transaction structure (per-musician active-assignments dedup,
 *    canonical setlist.musicians[] rebuild preserving uid-less guests,
 *    state-machine guards on respond/unassign) is non-trivial; we want
 *    one place to fix bugs.
 *
 * Auth + rate-limit live OUTSIDE this module. The HTTP routes use
 * `createApiHandler({role})` + `checkRateLimit(req, 'api')`; the MCP
 * tools use `assertEditor(db, uid)` + `checkUserRateLimit(uid, 'api',
 * {bypass: trusted-leader})`. Both call into here with already-
 * authenticated inputs.
 */

type DB = FirebaseFirestore.Firestore

// ────────────────────────────────────────────────────────────────────────────
// assignMusicians
// ────────────────────────────────────────────────────────────────────────────

export interface AssignServiceMusician {
    uid: string
    name: string
    email: string
    phone?: string
    instrument?: string
    schedulingTier?: "core" | "regular" | "guest"
}

export interface AssignServiceArgs {
    setlistId: string
    setlistName: string
    /** ISO date string, or null when undated. */
    eventDate: string | null
    /** Free-form denormalized service type (`'shabbat_morning'` etc.). */
    serviceType: string | null
    musicians: AssignServiceMusician[]
    actor: {
        uid: string
        email: string | null
    }
}

export interface AssignServiceResult {
    success: true
    assigned: number
    errors?: string[]
}

interface CreatedAssignment {
    musician: AssignServiceMusician
    assignmentId: string
    newSongs: { title: string; fileId: string }[]
}

type SetlistMusicianEntry = {
    uid?: string
    name?: string
    email?: string
    instrument?: string | null
}

/**
 * Assign one or more musicians to a setlist. Mirrors the wire shape of
 * `POST /api/scheduling/assign` (`{success, assigned, errors?}`).
 *
 * Per musician:
 *   1. Read setlist tracks once for new-song detection (read-only — outside
 *      the per-musician transaction so concurrent writes don't enlarge the
 *      contention set).
 *   2. Run a transaction that: (a) reads the setlist's active
 *      (`pending|confirmed`) assignments, (b) dedups against them (skip on
 *      `already_active`), (c) creates the new assignment doc, (d) rebuilds
 *      `setlists/{id}.musicians[]` + `assignedUids[]` from the canonical
 *      active-assignments snapshot, preserving uid-less guest entries
 *      verbatim. v4.4 DL-001 / DL-012 / DL-013.
 *   3. Fire the notification cascade post-commit (email + SMS + push +
 *      in-app), gated by the musician's notification preferences.
 *
 * Core musicians (`schedulingTier === 'core'`) are auto-confirmed; everyone
 * else lands in `'pending'`.
 */
export async function assignMusiciansService(
    db: DB,
    args: AssignServiceArgs,
): Promise<AssignServiceResult> {
    const { FieldValue } = await import("firebase-admin/firestore")
    const created: CreatedAssignment[] = []
    const errors: string[] = []

    // Fetch setlist tracks once for new-song detection across all musicians.
    let setlistTracks: TrackRef[] = []
    try {
        const setlistDoc = await db
            .collection("setlists")
            .doc(args.setlistId)
            .get()
        if (setlistDoc.exists) {
            setlistTracks = (setlistDoc.data()?.tracks ?? []).map(
                (t: { fileId?: string; title?: string }) => ({
                    fileId: t.fileId,
                    title: t.title || "",
                }),
            )
        }
    } catch (e) {
        logger.warn(
            "[Scheduling] Failed to fetch setlist tracks for new-song detection:",
            e,
        )
    }

    const setlistRef = db.collection("setlists").doc(args.setlistId)
    const activeAssignmentsQuery = db
        .collection("scheduling_assignments")
        .where("setlistId", "==", args.setlistId)
        .where("status", "in", ["pending", "confirmed"])

    for (const musician of args.musicians) {
        try {
            const isCore = musician.schedulingTier === "core"

            // New-song detection BEFORE writing the assignment so the new
            // assignment doesn't appear in the musician's history yet.
            let newSongs: { title: string; fileId: string }[] = []
            if (setlistTracks.length > 0) {
                try {
                    const detected = await detectNewSongs(
                        db,
                        musician.uid,
                        setlistTracks,
                    )
                    newSongs = detected
                        .filter((s) => s.fileId)
                        .map((s) => ({ title: s.title, fileId: s.fileId! }))
                } catch (e) {
                    logger.warn(
                        `[Scheduling] New song detection failed for ${musician.name}:`,
                        e,
                    )
                }
            }

            const txResult = await db.runTransaction(async (transaction) => {
                const [activeSnap, setlistSnap] = await Promise.all([
                    transaction.get(
                        activeAssignmentsQuery,
                    ) as unknown as Promise<FirebaseFirestore.QuerySnapshot>,
                    transaction.get(
                        setlistRef,
                    ) as unknown as Promise<FirebaseFirestore.DocumentSnapshot>,
                ])

                const activeDocs = activeSnap.docs.map((d) => ({
                    id: d.id,
                    data: d.data() as Record<string, unknown>,
                }))

                const alreadyActive = activeDocs.some(
                    (d) => d.data.musicianUid === musician.uid,
                )
                if (alreadyActive) {
                    return { skipped: true as const, reason: "already_active" }
                }

                const newAssignmentRef = db
                    .collection("scheduling_assignments")
                    .doc()
                // v11-05-03: denormalize the parent setlist's tenant onto the
                // assignment so the cross-tenant roster reads can scope by orgId
                // without a setlist join. Read from the in-tx setlist snapshot so
                // the stamp is transactionally consistent with the musicians[]
                // rebuild below; missing/unstamped setlist → 'crc' (rowOrg).
                const assignmentOrg = rowOrg(setlistSnap.data()?.orgId)
                const assignmentData = {
                    orgId: assignmentOrg,
                    setlistId: args.setlistId,
                    setlistName: args.setlistName,
                    eventDate: args.eventDate || null,
                    serviceType: args.serviceType || null,
                    musicianUid: musician.uid,
                    musicianName: musician.name,
                    musicianEmail: musician.email,
                    musicianPhone: musician.phone || null,
                    instrument: musician.instrument || null,
                    status: isCore ? "confirmed" : "pending",
                    autoConfirmed: isCore,
                    assignedBy: args.actor.uid,
                    assignedByName: args.actor.email || "Unknown",
                    assignedAt: FieldValue.serverTimestamp(),
                    notifiedVia: [] as string[],
                }
                transaction.set(newAssignmentRef, assignmentData)

                // Rebuild canonical musicians[] from active assignments + new one.
                const canonical: SetlistMusicianEntry[] = activeDocs.map((d) => ({
                    uid: d.data.musicianUid as string | undefined,
                    name: (d.data.musicianName as string | undefined) ?? "",
                    email: (d.data.musicianEmail as string | undefined) ?? "",
                    instrument:
                        (d.data.instrument as string | null | undefined) ?? null,
                }))
                canonical.push({
                    uid: musician.uid,
                    name: musician.name,
                    email: musician.email,
                    instrument: musician.instrument ?? null,
                })

                const existingMusicians = setlistSnap.exists
                    ? ((setlistSnap.data()?.musicians ??
                          []) as SetlistMusicianEntry[])
                    : []
                const guests = existingMusicians.filter((m) => !m.uid)

                const seen = new Set<string>()
                const finalMusicians: SetlistMusicianEntry[] = []
                for (const entry of canonical) {
                    if (entry.uid && !seen.has(entry.uid)) {
                        seen.add(entry.uid)
                        finalMusicians.push(entry)
                    }
                }
                for (const g of guests) finalMusicians.push(g)

                if (setlistSnap.exists) {
                    transaction.update(setlistRef, {
                        musicians: finalMusicians,
                        assignedUids: finalMusicians
                            .map((m) => m.uid)
                            .filter(Boolean),
                    })
                }

                return {
                    skipped: false as const,
                    assignmentId: newAssignmentRef.id,
                }
            })

            if (txResult.skipped) {
                errors.push(`${musician.name}: already has an active assignment`)
                continue
            }

            created.push({ musician, assignmentId: txResult.assignmentId, newSongs })
        } catch (e) {
            logger.error(
                `[Scheduling] Failed to assign ${musician.name}:`,
                e,
            )
            errors.push(
                `${musician.name}: ${e instanceof Error ? e.message : "unknown error"}`,
            )
        }
    }

    // Notification cascade — runs AFTER each musician's transaction commits.
    const baseUrl = BASE_URL
    for (const { musician, assignmentId, newSongs } of created) {
        const isCore = musician.schedulingTier === "core"

        const musicianDoc = await db.collection("users").doc(musician.uid).get()
        const musicianData = musicianDoc.data()
        const notifPrefs =
            musicianData?.musicianProfile?.notificationPreferences || {}
        const emailEnabled = notifPrefs.email !== false // default true
        const smsEnabled = notifPrefs.sms === true // default false
        const pushEnabled = notifPrefs.push !== false // default true

        if (emailEnabled) {
            sendSchedulingEmail({
                to: musician.email,
                recipientName: musician.name,
                setlistName: args.setlistName,
                eventDate: args.eventDate || "TBD",
                instrument: musician.instrument,
                status: isCore ? "confirmed" : "pending",
                scheduleUrl: `${baseUrl}/schedule`,
                assignmentId,
                newSongs: newSongs.length > 0 ? newSongs : undefined,
            })
                .then((result) => {
                    if (result.ok) {
                        db.collection("scheduling_assignments")
                            .doc(assignmentId)
                            .update({
                                notifiedVia: FieldValue.arrayUnion("email"),
                            })
                            .catch((e) =>
                                logger.warn(
                                    `[Scheduling] Failed to track email delivery for assignment ${assignmentId}:`,
                                    e,
                                ),
                            )
                    }
                })
                .catch((e) =>
                    logger.warn(
                        `[Scheduling] Email failed for ${musician.email}:`,
                        e,
                    ),
                )
        }

        if (musician.phone && smsEnabled) {
            sendSchedulingAssignmentSMS({
                to: musician.phone,
                musicianName: musician.name,
                setlistName: args.setlistName,
                eventDate: args.eventDate || "TBD",
                instrument: musician.instrument,
                status: isCore ? "confirmed" : "pending",
                scheduleUrl: `${baseUrl}/schedule`,
                newSongs:
                    newSongs.length > 0
                        ? newSongs.map((s) => s.title)
                        : undefined,
            })
                .then((result) => {
                    if (result.ok) {
                        db.collection("scheduling_assignments")
                            .doc(assignmentId)
                            .update({
                                notifiedVia: FieldValue.arrayUnion("sms"),
                            })
                            .catch((e) =>
                                logger.warn(
                                    `[Scheduling] Failed to track SMS delivery for assignment ${assignmentId}:`,
                                    e,
                                ),
                            )
                    }
                })
                .catch((e) =>
                    logger.warn(
                        `[Scheduling] SMS failed for ${musician.phone}:`,
                        e,
                    ),
                )
        }

        if (pushEnabled) {
            const instrumentText = musician.instrument
                ? ` on ${musician.instrument}`
                : ""
            try {
                const notifRef = db
                    .collection("users")
                    .doc(musician.uid)
                    .collection("notifications")
                await notifRef.add({
                    type: isCore ? "scheduling_confirmed" : "scheduling_request",
                    title: isCore
                        ? "You're confirmed to play"
                        : "You're scheduled to play",
                    body: `You've been assigned${instrumentText} for "${args.setlistName}"`,
                    link: "/schedule",
                    entityId: assignmentId,
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                })
                await db
                    .collection("scheduling_assignments")
                    .doc(assignmentId)
                    .update({
                        notifiedVia: FieldValue.arrayUnion("in_app"),
                    })
            } catch (e) {
                logger.warn(
                    `[Scheduling] In-app notification failed for ${musician.uid}:`,
                    e,
                )
            }

            sendPushToUsers([musician.uid], {
                title: isCore
                    ? "You're confirmed to play"
                    : "You're scheduled to play",
                body: `You've been assigned${
                    musician.instrument ? ` on ${musician.instrument}` : ""
                } for "${args.setlistName}"`,
                link: "/schedule",
            }).catch((err) =>
                logger.warn(
                    `[Scheduling] FCM push failed for ${musician.uid}:`,
                    err,
                ),
            )
        }
    }

    return {
        success: true,
        assigned: created.length,
        errors: errors.length > 0 ? errors : undefined,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// unassignAssignment
// ────────────────────────────────────────────────────────────────────────────

export type UnassignServiceResult =
    | { ok: true; assignmentId: string }
    | { ok: false; kind: "not_found" }
    | { ok: false; kind: "invalid_transition"; currentStatus: string }

/**
 * Cancel an active assignment (`pending|confirmed → cancelled`). v4.4
 * DL-003 / DL-014: state machine guards reject transitions from terminal
 * states. Filters the musician out of `setlists/{id}.musicians[]` +
 * `assignedUids[]` inside the same transaction as the status flip so
 * concurrent declines/assigns can't clobber the denorm projection.
 *
 * Notifications fire post-commit (email + SMS + in-app) gated by the
 * musician's notification preferences. Errors are logged and swallowed
 * so a flaky email provider doesn't tip the wire response into a 500.
 */
export async function unassignAssignmentService(
    db: DB,
    assignmentId: string,
): Promise<UnassignServiceResult> {
    const { FieldValue } = await import("firebase-admin/firestore")
    const assignmentRef = db
        .collection("scheduling_assignments")
        .doc(assignmentId)
    let assignment: FirebaseFirestore.DocumentData

    try {
        assignment = await db.runTransaction(async (transaction) => {
            const assignmentDoc = await transaction.get(assignmentRef)
            if (!assignmentDoc.exists) {
                throw new Error("NOT_FOUND")
            }
            const data = assignmentDoc.data()!
            if (data.status !== "pending" && data.status !== "confirmed") {
                throw new Error(`INVALID_TRANSITION:${data.status}`)
            }
            const setlistId = data.setlistId as string | undefined
            const musicianUid = data.musicianUid as string | undefined

            if (setlistId) {
                const setlistRef = db.collection("setlists").doc(setlistId)
                const setlistDoc = await transaction.get(setlistRef)
                if (setlistDoc.exists) {
                    const musicians = (setlistDoc.data()?.musicians ??
                        []) as SetlistMusicianEntry[]
                    const filtered = musicians.filter(
                        (m) => m.uid !== musicianUid,
                    )
                    if (filtered.length !== musicians.length) {
                        transaction.update(setlistRef, {
                            musicians: filtered,
                            assignedUids: filtered
                                .map((m) => m.uid)
                                .filter(Boolean),
                        })
                    }
                }
            }

            transaction.update(assignmentRef, {
                status: "cancelled",
                respondedAt: FieldValue.serverTimestamp(),
            })
            return data
        })
    } catch (e) {
        if (e instanceof Error) {
            if (e.message === "NOT_FOUND") {
                return { ok: false, kind: "not_found" }
            }
            if (e.message.startsWith("INVALID_TRANSITION:")) {
                const currentStatus = e.message.slice(
                    "INVALID_TRANSITION:".length,
                )
                return {
                    ok: false,
                    kind: "invalid_transition",
                    currentStatus,
                }
            }
        }
        throw e
    }

    // Notification cascade — fire-and-forget so a flaky provider doesn't
    // affect the wire response. v4.3 D06: re-read the displayName so
    // renamed users don't see a stale name in cancellation emails.
    const musicianUid = assignment.musicianUid
    let freshName: string | undefined
    if (musicianUid) {
        try {
            const userSnap = await db.collection("users").doc(musicianUid).get()
            const displayName = userSnap.data()?.displayName
            if (typeof displayName === "string" && displayName.trim()) {
                freshName = displayName.trim()
            }
        } catch {
            // fall back to denormalized assignment.musicianName
        }
    }
    const musicianName = freshName || assignment.musicianName || "Musician"
    let emailEnabled = true
    let smsEnabled = false
    let pushEnabled = true
    if (musicianUid) {
        try {
            const musicianDoc = await db
                .collection("users")
                .doc(musicianUid)
                .get()
            const prefs =
                musicianDoc.data()?.musicianProfile?.notificationPreferences
            if (prefs) {
                emailEnabled = prefs.email !== false
                smsEnabled = prefs.sms === true
                pushEnabled = prefs.push !== false
            }
        } catch {
            // use defaults
        }
    }

    const baseUrl = BASE_URL
    // v4.3 D05: formatEventDate handles string + {seconds} + Timestamp shapes.
    const eventDateStr = formatEventDate(assignment.eventDate) ?? "TBD"

    if (emailEnabled && assignment.musicianEmail) {
        sendSchedulingEmail({
            to: assignment.musicianEmail,
            recipientName: musicianName,
            setlistName: assignment.setlistName || "a service",
            eventDate: eventDateStr,
            instrument: assignment.instrument,
            status: "cancelled",
            scheduleUrl: `${baseUrl}/schedule`,
            assignmentId,
        }).catch((e) =>
            logger.warn(
                `[Scheduling] Cancellation email failed for ${assignment.musicianEmail}:`,
                e,
            ),
        )
    }

    if (smsEnabled && assignment.musicianPhone) {
        sendSchedulingCancellationSMS({
            to: assignment.musicianPhone,
            musicianName,
            setlistName: assignment.setlistName || "a service",
            eventDate: eventDateStr,
        }).catch((e) =>
            logger.warn(
                `[Scheduling] Cancellation SMS failed for ${assignment.musicianPhone}:`,
                e,
            ),
        )
    }

    if (pushEnabled && musicianUid) {
        try {
            const notifRef = db
                .collection("users")
                .doc(musicianUid)
                .collection("notifications")
            await notifRef.add({
                type: "scheduling_cancelled",
                title: "Service assignment cancelled",
                body: `Your assignment for "${
                    assignment.setlistName || "a service"
                }" has been cancelled`,
                link: "/schedule",
                entityId: assignment.setlistId,
                read: false,
                createdAt: FieldValue.serverTimestamp(),
            })
        } catch (e) {
            logger.warn(
                "[Scheduling] Failed to notify musician of cancellation:",
                e,
            )
        }
    }

    return { ok: true, assignmentId }
}

// ────────────────────────────────────────────────────────────────────────────
// respondToAssignment
// ────────────────────────────────────────────────────────────────────────────

export type RespondServiceAction = "accept" | "decline"

export interface RespondServiceArgs {
    assignmentId: string
    /** The uid of the caller — gated against `assignment.musicianUid`. */
    actorUid: string
    action: RespondServiceAction
    declineReason?: string
}

export type RespondServiceResult =
    | { ok: true; status: "confirmed" | "declined"; assignmentId: string }
    | { ok: false; kind: "not_found" }
    | { ok: false; kind: "forbidden" }
    | { ok: false; kind: "already_responded"; currentStatus: string }

/**
 * Musician-self-write — accept or decline OWN pending assignment.
 * v4.4 DL-002: single transaction covers the status flip AND (on decline)
 * the setlist.musicians[] removal. Caller (HTTP route or MCP tool) must
 * resolve the actorUid before calling — the own-assignment gate is the
 * only auth this function enforces.
 *
 * Notifies the assigner (band leader) post-commit so they see the
 * accept/decline in their in-app notifications.
 */
export async function respondToAssignmentService(
    db: DB,
    args: RespondServiceArgs,
): Promise<RespondServiceResult> {
    const { FieldValue } = await import("firebase-admin/firestore")
    const newStatus = args.action === "accept" ? "confirmed" : "declined"
    const assignmentRef = db
        .collection("scheduling_assignments")
        .doc(args.assignmentId)
    let assignment: FirebaseFirestore.DocumentData

    try {
        assignment = await db.runTransaction(async (transaction) => {
            const assignmentDoc = await transaction.get(assignmentRef)
            if (!assignmentDoc.exists) {
                throw new Error("NOT_FOUND")
            }
            const data = assignmentDoc.data()!

            if (data.musicianUid !== args.actorUid) {
                throw new Error("FORBIDDEN")
            }
            if (data.status !== "pending") {
                throw new Error(`ALREADY_${String(data.status).toUpperCase()}`)
            }

            if (
                args.action === "decline" &&
                typeof data.setlistId === "string"
            ) {
                const setlistRef = db.collection("setlists").doc(data.setlistId)
                const setlistDoc = await transaction.get(setlistRef)
                if (setlistDoc.exists) {
                    const musicians = (setlistDoc.data()?.musicians ??
                        []) as SetlistMusicianEntry[]
                    const filtered = musicians.filter(
                        (m) => m.uid !== args.actorUid,
                    )
                    if (filtered.length !== musicians.length) {
                        transaction.update(setlistRef, {
                            musicians: filtered,
                            assignedUids: filtered
                                .map((m) => m.uid)
                                .filter(Boolean),
                        })
                    }
                }
            }

            const updateData: Record<string, unknown> = {
                status: newStatus,
                respondedAt: FieldValue.serverTimestamp(),
            }
            if (args.action === "decline" && args.declineReason) {
                updateData.declineReason = args.declineReason
            }
            transaction.update(assignmentRef, updateData)
            return data
        })
    } catch (e) {
        if (e instanceof Error) {
            if (e.message === "NOT_FOUND") {
                return { ok: false, kind: "not_found" }
            }
            if (e.message === "FORBIDDEN") {
                return { ok: false, kind: "forbidden" }
            }
            if (e.message.startsWith("ALREADY_")) {
                const currentStatus = e.message
                    .replace("ALREADY_", "")
                    .toLowerCase()
                return {
                    ok: false,
                    kind: "already_responded",
                    currentStatus,
                }
            }
        }
        throw e
    }

    // Notify assigner post-commit; non-fatal on failure.
    try {
        const assignerUid = assignment.assignedBy
        if (assignerUid && assignerUid !== args.actorUid) {
            const notifRef = db
                .collection("users")
                .doc(assignerUid)
                .collection("notifications")
            const musicianName = assignment.musicianName || "A musician"
            const setlistName = assignment.setlistName || "a service"
            await notifRef.add({
                type:
                    args.action === "accept"
                        ? "scheduling_confirmed"
                        : "scheduling_declined",
                title:
                    args.action === "accept"
                        ? "Assignment confirmed"
                        : "Assignment declined",
                body: `${musicianName} ${newStatus} for "${setlistName}"${
                    args.declineReason ? ` — "${args.declineReason}"` : ""
                }`,
                link: `/setlists/${assignment.setlistId}`,
                entityId: assignment.setlistId,
                read: false,
                createdAt: FieldValue.serverTimestamp(),
            })
        }
    } catch (e) {
        logger.warn("[Scheduling] Failed to notify assigner:", e)
    }

    return { ok: true, status: newStatus, assignmentId: args.assignmentId }
}

/**
 * Test-only: utility to fetch the assignment doc without the own-assignment
 * gate so the MCP `unassign_musician` tool can resolve `(setlistId, uid)`
 * to the active assignmentId before delegating to `unassignAssignmentService`.
 * Returns `null` when no active assignment exists.
 */
export async function findActiveAssignment(
    db: DB,
    setlistId: string,
    uid: string,
): Promise<{ id: string; data: FirebaseFirestore.DocumentData } | null> {
    const snap = await db
        .collection("scheduling_assignments")
        .where("setlistId", "==", setlistId)
        .where("musicianUid", "==", uid)
        .where("status", "in", ["pending", "confirmed"])
        .limit(1)
        .get()
    if (snap.empty) return null
    const doc = snap.docs[0]
    return { id: doc.id, data: doc.data() }
}

