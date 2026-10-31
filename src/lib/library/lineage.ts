import "server-only"

import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { writeAccess } from "@/lib/library/visibility-server"
import { notOwnerError } from "@/lib/mcp/not-owner"
import { eventDayOf, orgDay } from "@/lib/performance/tonight"
import { STANDING_COLLECTION } from "@/lib/profiles/standing"
import { logger } from "@/lib/logger"
import type { OrgId } from "@/lib/org/types"
import { isTrustedLeader, type UploaderRoles } from "@/lib/mcp/tools/uploader-roles"
import { swapChart } from "@/lib/mcp/tools/setlist-write"
import { findSetlistsReferencingChart } from "@/lib/mcp/tools/setlists"

/**
 * Bet 2 — chart lineage (versions, not siblings). Daniel's ruling
 * (2026-10-31): a revised chart applies to FUTURE setlists only. Past
 * setlists keep their exact chart, played keys are kept, and standing
 * choices follow the new version.
 *
 * Every intake path that takes `revisionOf` calls `loadRevisionTarget`
 * before it files the bytes and `applyRevision` after. The library rows are
 * org-checked through `writeAccess`; setlists, standing choices and profiles
 * are read in the caller's org only.
 */

const LIBRARY = "library_index"
const SONGS = "songs"
const TEMPLATES = "setlistTemplates"

export interface RevisionTarget {
    id: string
    data: Record<string, unknown>
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

/**
 * The row a revision supersedes: it must exist, be owned by the caller's org,
 * not already have a newer version, and be revisable by the caller (an admin
 * or band leader, or the person who filed it).
 */
export async function loadRevisionTarget(
    db: FirebaseFirestore.Firestore,
    revisionOf: string,
    org: OrgId,
    uid: string,
    roles: UploaderRoles,
): Promise<RevisionTarget | RichErrorEnvelope> {
    const id = revisionOf.trim()
    if (!id) {
        return richError("invalid_argument", "revisionOf must be a non-empty fileId.", { field: "revisionOf" })
    }
    const snap = await db.collection(LIBRARY).doc(id).get()
    const notFound = () =>
        richError(
            "row_not_found",
            `revisionOf ${id} is not a chart in your library.`,
            { revisionOf: id, errorCode: 404 },
            "Pass the fileId of the chart this file replaces (search_library), or drop revisionOf to file a new chart.",
        )
    if (!snap.exists) return notFound()
    const data = snap.data() ?? {}
    const access = await writeAccess(data, org, id, db)
    if (access.kind === "not_owner") return notOwnerError(access, id)
    if (access.kind !== "owned") return notFound()
    const filedBy = str(data.authoredBy) ?? str(data.uploadedBy)
    if (!isTrustedLeader(roles) && filedBy !== uid) {
        return richError(
            "forbidden",
            "Only the person who filed this chart, an admin, or a band leader may file a new version of it.",
            { revisionOf: id, errorCode: 403 },
        )
    }
    const newer = str(data.supersededBy)
    if (newer) {
        return richError(
            "already_superseded",
            `${id} already has a newer version (${newer}).`,
            { revisionOf: id, supersededBy: newer, errorCode: 409 },
            `Pass revisionOf:'${newer}' to file a version after the current one.`,
        )
    }
    return { id: snap.id, data }
}

export interface RevisionRowRef {
    setlistId: string
    trackId: string
    name: string
    /** YYYY-MM-DD service day, or null when the setlist has none. */
    day: string | null
}

export interface RevisionReport {
    revisionOf: string
    lineageId: string
    /** Rows of setlists dated today or later (or undated) now on the new version. */
    repointed: RevisionRowRef[]
    /** Rows of past setlists, left on the exact chart they had. */
    keptPast: RevisionRowRef[]
    standingMoved: number
    profileRowsMoved: number
    previousArchived: boolean
    warnings: string[]
}

/**
 * Make `newFileId` the next version of `previous`:
 *   1. lineage fields on both rows; the new row takes the old row's partGroup
 *   2. rows of setlists dated today or later (or undated) move to the new
 *      version, keeping their played key and title; past setlists are untouched
 *   3. standing choices and profile rows on the old fileId move to the new one
 *   4. the old row is archived (still readable) with `supersededBy`
 * Each step is best effort: a failure is a warning and the rest still runs.
 */
export async function applyRevision(
    uid: string,
    org: OrgId,
    previous: RevisionTarget,
    newFileId: string,
    opts: { tool: string; nowMs?: number } = { tool: "revision" },
): Promise<RevisionReport> {
    initAdmin()
    const db = getFirestore()
    const warnings: string[] = []
    const lineageId = str(previous.data.lineageId) ?? previous.id
    const partGroup = str(previous.data.partGroup)
    const today = orgDay(opts.nowMs ?? Date.now(), org)

    // 1. Lineage fields.
    try {
        const batch = db.batch()
        batch.update(db.collection(LIBRARY).doc(newFileId), {
            lineageId,
            supersedes: previous.id,
            revisionOf: previous.id,
            ...(partGroup ? { partGroup } : {}),
        })
        batch.update(db.collection(LIBRARY).doc(previous.id), {
            lineageId,
            supersededBy: newFileId,
        })
        await batch.commit()
    } catch (err) {
        warnings.push(`lineage fields not written: ${err instanceof Error ? err.message : String(err)}`)
        logger.warn(`[${opts.tool}] lineage write failed`, { previous: previous.id, newFileId, err })
    }

    // 2. Upcoming setlists follow; past ones keep their exact chart.
    const repointed: RevisionRowRef[] = []
    const keptPast: RevisionRowRef[] = []
    const refs = await findSetlistsReferencingChart(uid, { fileId: previous.id }, org)
    if ("ok" in refs && refs.ok) {
        for (const ref of refs.setlists) {
            const day = eventDayOf(ref.eventDate ?? ref.date, org)
            const row: RevisionRowRef = { setlistId: ref.setlistId, trackId: ref.trackId, name: ref.name, day }
            if (day !== null && day < today) {
                keptPast.push(row)
                continue
            }
            const swapped = await swapChart(
                uid,
                { setlistId: ref.setlistId, trackId: ref.trackId, newSongId: newFileId, syncMetadata: false, keepTitle: true },
                org,
            )
            if ("ok" in swapped && swapped.ok) repointed.push(row)
            else warnings.push(`could not move ${ref.setlistId}/${ref.trackId} to the new version`)
        }
        if (refs.truncated) warnings.push("referencing-setlist list was truncated; some upcoming rows may still point at the previous version")
    } else {
        warnings.push(`could not list the setlists using ${previous.id}; none were moved`)
    }

    // 3. Standing choices and profile rows.
    let newName: string | null = null
    try {
        const snap = await db.collection(LIBRARY).doc(newFileId).get()
        newName = str(snap.data()?.name)
    } catch {
        /* the old name stays */
    }
    let standingMoved = 0
    try {
        const snap = await db.collection(STANDING_COLLECTION).where("fileId", "==", previous.id).get()
        for (const d of snap.docs) {
            if (rowOrg(d.data().orgId) !== org) continue
            await d.ref.update({
                fileId: newFileId,
                ...(newName ? { chartName: newName } : {}),
                revisedFrom: previous.id,
            })
            standingMoved++
        }
    } catch (err) {
        warnings.push(`standing choices not moved: ${err instanceof Error ? err.message : String(err)}`)
    }
    let profileRowsMoved = 0
    try {
        const snap = await db.collection(TEMPLATES).where("orgId", "==", org).get()
        for (const d of snap.docs) {
            const data = d.data()
            if (rowOrg(data.orgId) !== org || !data.profile || !Array.isArray(data.tracks)) continue
            let moved = 0
            const tracks = (data.tracks as Array<Record<string, unknown>>).map((t) => {
                const own = t.fileId === previous.id
                const parts = Array.isArray(t.parts) ? (t.parts as Array<Record<string, unknown>>) : null
                const partHit = !!parts && parts.some((p) => p.fileId === previous.id)
                if (!own && !partHit) return t
                moved++
                // The old chart's file name would go stale on the row; a draft looks it up again.
                const { fileName: _staleName, ...rest } = t
                void _staleName
                return {
                    ...(own ? rest : t),
                    ...(own ? { fileId: newFileId } : {}),
                    ...(partHit && parts
                        ? {
                              parts: parts.map((p) =>
                                  p.fileId === previous.id
                                      ? { ...p, fileId: newFileId, ...(newName ? { chartName: newName } : {}) }
                                      : p,
                              ),
                          }
                        : {}),
                }
            })
            if (moved === 0) continue
            await d.ref.update({ tracks, version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() })
            profileRowsMoved += moved
        }
    } catch (err) {
        warnings.push(`profile rows not moved: ${err instanceof Error ? err.message : String(err)}`)
    }

    // 4. Archive the old row. Its bytes stay; past setlists still read it.
    let previousArchived = false
    try {
        const prior = str(previous.data.status)
        const at = new Date().toISOString()
        const batch = db.batch()
        batch.update(db.collection(LIBRARY).doc(previous.id), {
            status: "archived",
            ...(prior && prior !== "archived" ? { priorStatus: prior } : {}),
            canonicalFileId: newFileId,
            archivedAt: at,
            archivedReason: `Superseded by ${newFileId} via ${opts.tool}`,
        })
        const songRef = db.collection(SONGS).doc(previous.id)
        if ((await songRef.get()).exists) batch.update(songRef, { status: "archived" })
        await batch.commit()
        previousArchived = true
    } catch (err) {
        warnings.push(`previous version ${previous.id} was not archived: ${err instanceof Error ? err.message : String(err)}`)
    }

    logger.info(`[${opts.tool}] revision applied`, {
        org,
        previous: previous.id,
        newFileId,
        repointed: repointed.length,
        keptPast: keptPast.length,
        standingMoved,
        profileRowsMoved,
    })
    return {
        revisionOf: previous.id,
        lineageId,
        repointed,
        keptPast,
        standingMoved,
        profileRowsMoved,
        previousArchived,
        warnings,
    }
}
