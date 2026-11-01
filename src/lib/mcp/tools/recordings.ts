import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { forbiddenRoleEnvelope, richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { readTenantRole } from "@/lib/org/access"
import { rowOrg } from "@/lib/org/membership"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { baseUrlFor } from "@/lib/constants"
import { visibleTo } from "@/lib/library/visibility"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { logger } from "@/lib/logger"
import type { Recording, RecordingSource, RecordingStatus } from "@/types/models"
import { compareTakes, isPlayable, pickFeatured, recordingFileUrl, type FeaturedRecording } from "@/lib/recordings/featured"
import {
    RecordingRefusal,
    getFeaturedForSongs,
    loadRecordingsForSongs,
    recordingFromDoc,
    setFeaturedRecording,
} from "@/lib/recordings/featured-server"

/**
 * Recordings 2026-11: `list_recordings` (read, any member) and
 * `update_recording` (admin / band_leader; F-05). Each tenant lists and
 * changes only its own recordings (`rowOrg(orgId) === org`); the files
 * themselves are public. Links are absolute on the tenant's host.
 */

type DB = FirebaseFirestore.Firestore
const COLLECTION = "recordings"
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export interface ListRecordingsArgs {
    songId?: string
    setlistId?: string
    serviceDate?: string
    status?: RecordingStatus | "all"
    limit?: number
}

export interface ListedRecording {
    id: string
    songId: string | null
    songTitle: string | null
    title: string
    status: RecordingStatus
    /** True for the take musicians hear for this song. */
    featured: boolean
    source?: RecordingSource
    url: string
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

function statusOf(r: Pick<Recording, "status">): RecordingStatus {
    return r.status === "held" || r.status === "hidden" ? r.status : "live"
}

/** songId -> absolute link to its featured take, for this org. */
export async function featuredLinksFor(db: DB, org: OrgId, songIds: string[]): Promise<Record<string, FeaturedRecording>> {
    const rel = await getFeaturedForSongs(db, org, songIds)
    const base = baseUrlFor(org)
    const out: Record<string, FeaturedRecording> = {}
    for (const [songId, f] of Object.entries(rel)) out[songId] = { ...f, url: recordingFileUrl(f.id, base) }
    return out
}

async function songTitles(db: DB, songIds: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>()
    await Promise.all(
        [...new Set(songIds)].map(async (id) => {
            try {
                const [song, idx] = await Promise.all([
                    db.collection("songs").doc(id).get(),
                    db.collection("library_index").doc(id).get(),
                ])
                out.set(id, str(song.data()?.title) ?? str(idx.data()?.name))
            } catch {
                out.set(id, null)
            }
        }),
    )
    return out
}

export async function listRecordingsTool(
    _uid: string,
    args: ListRecordingsArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | { ok: true; recordings: ListedRecording[]; counts: Record<RecordingStatus, number>; truncated?: boolean }
    | RichErrorEnvelope
> {
    const want = args?.status ?? "live"
    if (!["live", "held", "hidden", "all"].includes(want)) {
        return richError("invalid_argument", "`status` is live, held, hidden or all.", { field: "status" })
    }
    const limit = Math.min(Math.max(Math.trunc(Number(args?.limit) || DEFAULT_LIMIT), 1), MAX_LIMIT)
    const serviceDate = str(args?.serviceDate)
    if (serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
        return richError("invalid_argument", "`serviceDate` is YYYY-MM-DD.", { field: "serviceDate" })
    }
    try {
        initAdmin()
        const db = getFirestore()
        let recs: Recording[] = []
        let songOrder: string[] | null = null

        const setlistId = str(args?.setlistId)
        const songId = str(args?.songId)
        if (setlistId) {
            const snap = await db.collection("setlists").doc(setlistId).get()
            const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
            // Another tenant's setlist answers exactly as a missing one.
            if (!data || rowOrg(data.orgId) !== org) {
                return richError("setlist_not_found", `Setlist '${setlistId}' was not found.`, { setlistId }, "Verify the id via list_setlists.")
            }
            const tracks = (await getTracksForSetlist(db, setlistId, data)) as unknown as Array<Record<string, unknown>>
            songOrder = tracks
                .filter((t) => typeof t.orgId !== "string" || !t.orgId || rowOrg(t.orgId) === org)
                .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
                .map((t) => str(t.songId) ?? str(t.fileId))
                .filter((s): s is string => !!s)
            recs = [...(await loadRecordingsForSongs(db, org, songOrder)).values()].flat()
        } else if (songId) {
            recs = [...(await loadRecordingsForSongs(db, org, [songId])).values()].flat()
        } else {
            // A legacy doc with no orgId belongs to crc (rowOrg), and a query on
            // orgId cannot match a missing field: crc reads the whole collection
            // and filters in memory; another tenant queries its orgId.
            const q = serviceDate
                ? db.collection(COLLECTION).where("source.serviceDate", "==", serviceDate)
                : org === DEFAULT_ORG_ID
                  ? db.collection(COLLECTION)
                  : db.collection(COLLECTION).where("orgId", "==", org)
            const snap = await q.get()
            recs = snap.docs
                .filter((d) => rowOrg((d.data() as Record<string, unknown>).orgId) === org)
                .map((d) => recordingFromDoc(d.id, d.data() as Record<string, unknown>))
        }
        if (serviceDate) recs = recs.filter((r) => r.source?.serviceDate === serviceDate)

        const counts: Record<RecordingStatus, number> = { live: 0, held: 0, hidden: 0 }
        for (const r of recs) counts[statusOf(r)]++

        // Which take each song shows, computed over all its takes in scope.
        const bySong = new Map<string, Recording[]>()
        for (const r of recs) if (r.songId) bySong.set(r.songId, [...(bySong.get(r.songId) ?? []), r])
        const featuredId = new Set<string>()
        for (const list of bySong.values()) {
            const pick = pickFeatured(list)
            if (pick) featuredId.add(pick.id)
        }

        const titles = await songTitles(db, [...bySong.keys()])
        const orderOf = (s: string | undefined): number => {
            if (!s || !songOrder) return 0
            const i = songOrder.indexOf(s)
            return i === -1 ? Number.MAX_SAFE_INTEGER : i
        }
        const filtered = want === "all" ? recs : recs.filter((r) => statusOf(r) === want)
        filtered.sort((a, b) => {
            // Held first: this is the spot-check list.
            const ha = statusOf(a) === "held" ? 0 : 1
            const hb = statusOf(b) === "held" ? 0 : 1
            if (ha !== hb) return ha - hb
            const oa = orderOf(a.songId)
            const ob = orderOf(b.songId)
            if (oa !== ob) return oa - ob
            if (!songOrder) {
                const ta = titles.get(a.songId ?? "") ?? a.songId ?? ""
                const tb = titles.get(b.songId ?? "") ?? b.songId ?? ""
                if (ta !== tb) return ta.localeCompare(tb)
            }
            const fa = featuredId.has(a.id) ? 0 : 1
            const fb = featuredId.has(b.id) ? 0 : 1
            if (fa !== fb) return fa - fb
            const pa = isPlayable(a) ? 0 : 1
            const pb = isPlayable(b) ? 0 : 1
            if (pa !== pb) return pa - pb
            return compareTakes(a, b)
        })

        const base = baseUrlFor(org)
        const recordings: ListedRecording[] = filtered.slice(0, limit).map((r) => ({
            id: r.id,
            songId: r.songId ?? null,
            songTitle: r.songId ? (titles.get(r.songId) ?? null) : null,
            title: r.title,
            status: statusOf(r),
            featured: featuredId.has(r.id),
            ...(r.source ? { source: r.source } : {}),
            url: recordingFileUrl(r.id, base),
        }))
        return { ok: true, recordings, counts, ...(filtered.length > limit ? { truncated: true } : {}) }
    } catch (err) {
        logger.error("[mcp] list_recordings failed", { err: err instanceof Error ? err.message : err })
        return richError("internal_error", "Could not list recordings.", { errorCode: 500 }, "Retry.")
    }
}

export interface UpdateRecordingArgs {
    recordingId: string
    featured?: true
    status?: "live" | "hidden"
    songId?: string
    dryRun?: boolean
    force?: boolean
}

interface RecordingState {
    songId: string | null
    status: RecordingStatus
    featured: boolean
}

export async function updateRecordingTool(
    uid: string,
    args: UpdateRecordingArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | {
          ok: true
          dryRun: boolean
          applied: boolean
          recordingId: string
          before: RecordingState
          after: RecordingState
          unset?: string[]
      }
    | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()
    const role = await readTenantRole(db, uid, org)
    if (role !== "admin" && role !== "band_leader") {
        return forbiddenRoleEnvelope({
            callerRole: role ?? null,
            requiredRoles: ["admin", "band_leader"],
            message: "Recordings are changed by an admin or band leader.",
            hint: "Ask an admin or band leader to change the recording.",
        })
    }
    const recordingId = str(args?.recordingId)
    if (!recordingId || !ID_RE.test(recordingId)) {
        return richError("invalid_argument", "Pass a `recordingId` from list_recordings.", { field: "recordingId" })
    }
    if (args.featured !== undefined && args.featured !== true) {
        return richError("invalid_argument", "`featured` only takes true; feature another take to move it.", { field: "featured" })
    }
    if (args.status !== undefined && args.status !== "live" && args.status !== "hidden") {
        return richError("invalid_argument", "`status` is live or hidden.", { field: "status" })
    }
    const newSongId = args.songId === undefined ? null : str(args.songId)
    if (args.songId !== undefined && (!newSongId || !ID_RE.test(newSongId))) {
        return richError("invalid_argument", "`songId` must be a chart id.", { field: "songId" }, "Use the fileId from search_library.")
    }
    if (args.featured === undefined && args.status === undefined && newSongId === null) {
        return richError("invalid_argument", "Pass at least one of `featured`, `status` or `songId`.", {
            fields: ["featured", "status", "songId"],
        })
    }

    try {
        const ref = db.collection(COLLECTION).doc(recordingId)
        const snap = await ref.get()
        const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
        // Another tenant's recording answers exactly as a missing one.
        if (!data || rowOrg(data.orgId) !== org) {
            return richError("recording_not_found", `Recording '${recordingId}' was not found.`, { recordingId }, "Use list_recordings to find the id.")
        }
        const rec = recordingFromDoc(recordingId, data)
        const before: RecordingState = { songId: rec.songId ?? null, status: statusOf(rec), featured: rec.featured === true }

        const reattach = newSongId !== null && newSongId !== before.songId
        if (reattach) {
            const [idx, song] = await Promise.all([
                db.collection("library_index").doc(newSongId).get(),
                db.collection("songs").doc(newSongId).get(),
            ])
            const row = (idx.exists ? idx.data() : song.exists ? song.data() : null) as Record<string, unknown> | null
            if (!row || !visibleTo(row, org)) {
                return richError(
                    "song_not_found",
                    `Chart '${newSongId}' was not found in this congregation's library.`,
                    { songId: newSongId },
                    "Use search_library to find the chart's id.",
                )
            }
        }

        const status = args.status ?? before.status
        if (args.featured === true && status !== "live") {
            return richError(
                "recording_not_playable",
                `Recording '${recordingId}' is ${status}; only a live take can be featured.`,
                { recordingId, status },
                "Pass status 'live' together with featured: true.",
            )
        }
        const after: RecordingState = {
            songId: reattach ? newSongId : before.songId,
            status,
            // Reattaching moves featured off unless re-featured; hiding un-features.
            featured: args.featured === true ? true : reattach || status !== "live" ? false : before.featured,
        }

        const dryRun = args.dryRun !== false
        if (dryRun) return { ok: true, dryRun: true, applied: false, recordingId, before, after }
        if (reattach && args.force !== true) {
            return richError(
                "force_required",
                "Moving a recording to another song needs force:true.",
                { dryRunPlan: { recordingId, before, after } },
                "Re-call with `dryRun: false, force: true` to move it.",
            )
        }

        const patch: Record<string, unknown> = {}
        if (after.status !== before.status) patch.status = after.status
        if (reattach) patch.songId = after.songId
        // A take that is not live, or just moved to another song, is never
        // featured: written in the same update, whatever `featured` read as.
        if (after.status !== "live" || reattach) patch.featured = false
        if (Object.keys(patch).length > 0) await ref.update(patch)
        let unset: string[] | undefined
        if (args.featured === true) unset = (await setFeaturedRecording(db, org, recordingId)).unset
        logger.info("[mcp] update_recording committed", { uid, org, recordingId, patch, featured: args.featured === true })
        return { ok: true, dryRun: false, applied: true, recordingId, before, after, ...(unset ? { unset } : {}) }
    } catch (err) {
        if (err instanceof RecordingRefusal) return err.envelope
        logger.error("[mcp] update_recording failed", { err: err instanceof Error ? err.message : err })
        return richError("recording_update_failed", "Could not change the recording.", { errorCode: 500 }, "Retry; check list_recordings first.")
    }
}
