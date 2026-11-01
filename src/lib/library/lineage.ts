import "server-only"

import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { writeAccess } from "@/lib/library/visibility-server"
import { notOwnerError } from "@/lib/mcp/not-owner"
import { eventDayOf, orgDay } from "@/lib/performance/tonight"
import { STANDING_COLLECTION } from "@/lib/profiles/standing"
import { upcomingForeignUses } from "@/lib/library/shared-usage"
import { linkRefusal } from "@/lib/library/lineage-pure"
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
const RECORDINGS = "recordings"

export interface RevisionTarget {
    id: string
    data: Record<string, unknown>
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

/**
 * The row a revision supersedes: it must exist, be owned by the caller's org
 * and not already have a newer version. Only an admin or band leader may file
 * a version: a revision moves setlists, standing choices and profiles.
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
    if (!isTrustedLeader(roles)) {
        return richError(
            "revision_needs_leader",
            "Only an admin or a band leader may file a new version of a chart: a new version moves upcoming setlists, standing choices and profiles.",
            { revisionOf: id, callerRole: roles.role ?? null, requiredRoles: ["admin", "band_leader"], errorCode: 403 },
            "File it without revisionOf, then ask a band leader to mark it as a new version.",
        )
    }
    void uid
    const newer = str(data.supersededBy)
    if (newer) return alreadySuperseded(id, newer)
    return { id: snap.id, data }
}

function alreadySuperseded(id: string, newer: string, filedAs?: string): RichErrorEnvelope {
    return richError(
        "already_superseded",
        `${id} already has a newer version (${newer}).` +
            (filedAs ? ` Your file was saved as ${filedAs}, with no version link.` : ""),
        { revisionOf: id, supersededBy: newer, ...(filedAs ? { filedAs } : {}), errorCode: 409 },
        `Pass revisionOf:'${newer}' to file a version after the current one.`,
    )
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
    /** Rows of setlists dated today or later, now on the new version. */
    repointed: RevisionRowRef[]
    /** Rows of past setlists, left on the exact chart they had. */
    keptPast: RevisionRowRef[]
    /** Rows of setlists with no date, left on the chart they had (Daniel: only "dated today or later" move). */
    keptUndated: RevisionRowRef[]
    /**
     * Rows of OTHER organizations' upcoming setlists that use this chart (a
     * shared chart). They stay on the archived version; counted, never named.
     */
    otherOrgUpcomingRows: number
    standingMoved: number
    /** Recordings of this org on the old fileId, moved to the new one (they follow the song). */
    recordingsMoved: number
    profileRowsMoved: number
    previousArchived: boolean
    warnings: string[]
}

/**
 * Make `newFileId` the next version of `previous`:
 *   1. lineage fields on both rows; the new row takes the old row's partGroup
 *   2. rows of setlists dated today or later move to the new version, keeping
 *      their played key and title; past and undated setlists are untouched
 *   3. standing choices, recordings and profile rows on the old fileId move to
 *      the new one (recordings of this org only; featured and status kept)
 *   4. the old row is archived (still readable) with `supersededBy`
 * Step 1 is one transaction: it re-reads both rows and refuses (nothing else
 * is written) when the old row gained a newer version meanwhile, or when the
 * link would merge two lineages or close a cycle. Steps 2-4 are best effort:
 * a failure is a warning and the rest still runs.
 */
export async function applyRevision(
    uid: string,
    org: OrgId,
    previous: RevisionTarget,
    newFileId: string,
    opts: { tool: string; nowMs?: number } = { tool: "revision" },
): Promise<RevisionReport | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const warnings: string[] = []
    const lineageId = str(previous.data.lineageId) ?? previous.id
    const partGroup = str(previous.data.partGroup)
    const today = orgDay(opts.nowMs ?? Date.now(), org)

    // 1. Lineage fields, in one transaction with the checks.
    const prevRef = db.collection(LIBRARY).doc(previous.id)
    const newRef = db.collection(LIBRARY).doc(newFileId)
    let refusal: RichErrorEnvelope | null = null
    try {
        await db.runTransaction(async (tx) => {
            refusal = null
            const [prevSnap, newSnap] = await Promise.all([tx.get(prevRef), tx.get(newRef)])
            const prev = prevSnap.data() ?? {}
            if (!prevSnap.exists || rowOrg(prev.orgId) !== org) {
                refusal = richError("row_not_found", `revisionOf ${previous.id} is not a chart in your library.`, {
                    revisionOf: previous.id,
                    filedAs: newFileId,
                    errorCode: 404,
                })
                return
            }
            const newer = str(prev.supersededBy)
            if (newer) {
                refusal = alreadySuperseded(previous.id, newer, newFileId)
                return
            }
            const why = newSnap.exists
                ? linkRefusal({ id: newFileId, ...(newSnap.data() ?? {}) }, { id: previous.id, ...prev })
                : "it does not exist"
            if (why) {
                refusal = richError(
                    "lineage_conflict",
                    `${newFileId} cannot become the next version of ${previous.id}: ${why}.`,
                    { revisionOf: previous.id, fileId: newFileId, reason: why, errorCode: 409 },
                    "Only an active chart that is not yet part of any version chain can be linked as a new version.",
                )
                return
            }
            tx.update(newRef, {
                lineageId,
                supersedes: previous.id,
                revisionOf: previous.id,
                ...(partGroup ? { partGroup } : {}),
            })
            tx.update(prevRef, { lineageId, supersededBy: newFileId })
        })
    } catch (err) {
        logger.warn(`[${opts.tool}] lineage write failed`, { previous: previous.id, newFileId, err })
        return richError(
            "revision_failed",
            `The version link was not written: ${err instanceof Error ? err.message : String(err)}. Your file was saved as ${newFileId}.`,
            { revisionOf: previous.id, filedAs: newFileId, errorCode: 500 },
            "Nothing else was moved. Retry the link with sync_chart_inbox revisions, or ask a band leader to link it.",
        )
    }
    if (refusal) return refusal

    // 2. Upcoming setlists follow; past ones keep their exact chart.
    const repointed: RevisionRowRef[] = []
    const keptPast: RevisionRowRef[] = []
    const keptUndated: RevisionRowRef[] = []
    const refs = await findSetlistsReferencingChart(uid, { fileId: previous.id }, org)
    if ("ok" in refs && refs.ok) {
        for (const ref of refs.setlists) {
            const day = eventDayOf(ref.eventDate ?? ref.date, org)
            const row: RevisionRowRef = { setlistId: ref.setlistId, trackId: ref.trackId, name: ref.name, day }
            if (day === null) {
                keptUndated.push(row)
                continue
            }
            if (day < today) {
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

    // A shared chart: other organizations' upcoming rows stay on the archived
    // version. Counted only; their setlists are never named here.
    let otherOrgUpcomingRows = 0
    try {
        otherOrgUpcomingRows = (await upcomingForeignUses(db, previous.id, org, opts.nowMs ?? Date.now())).length
        if (otherOrgUpcomingRows > 0) {
            warnings.push(
                `${otherOrgUpcomingRows} row(s) in another organization's upcoming setlists use this shared chart and stay on the archived version.`,
            )
        }
    } catch {
        /* the count is advisory */
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
    // Recordings belong to the song (its fileId): they follow the new version so
    // none is orphaned. This org's only; another tenant's stay where they are.
    let recordingsMoved = 0
    try {
        const snap = await db.collection(RECORDINGS).where("songId", "==", previous.id).get()
        const mine = snap.docs.filter((d) => rowOrg(d.data().orgId) === org)
        // One featured take per song: if the new version already has one, it stays featured.
        const target = mine.length > 0 ? await db.collection(RECORDINGS).where("songId", "==", newFileId).get() : null
        const newHasFeatured = !!target?.docs.some((d) => rowOrg(d.data().orgId) === org && d.data().featured === true)
        for (let i = 0; i < mine.length; i += 400) {
            const batch = db.batch()
            for (const d of mine.slice(i, i + 400)) {
                batch.update(d.ref, {
                    songId: newFileId,
                    revisedFrom: previous.id,
                    ...(newHasFeatured && d.data().featured === true ? { featured: false } : {}),
                })
            }
            await batch.commit()
            recordingsMoved += Math.min(400, mine.length - i)
        }
    } catch (err) {
        warnings.push(`recordings not moved: ${err instanceof Error ? err.message : String(err)}`)
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
        recordingsMoved,
        profileRowsMoved,
    })
    return {
        revisionOf: previous.id,
        lineageId,
        repointed,
        keptPast,
        keptUndated,
        otherOrgUpcomingRows,
        standingMoved,
        recordingsMoved,
        profileRowsMoved,
        previousArchived,
        warnings,
    }
}
