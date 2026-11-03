import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { forbiddenRoleEnvelope, richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { readTenantRole } from "@/lib/org/access"
import { rowOrg } from "@/lib/org/membership"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { maintainSetlist, MaintenanceError, MAX_TRANSACTION_WRITES } from "@/lib/setlist-ops"
import type { Recording } from "@/types/models"
import { loadRecordingsForSongs, recordingFromDoc } from "@/lib/recordings/featured-server"
import {
    decideField,
    pickSongTempos,
    rowTempoPatch,
    type BpmFieldState,
    type FieldAction,
    type RecordingVerdict,
    type TempoPick,
} from "@/lib/recordings/tempo-fill"
import { applyRecordingTempoToSong } from "./song-metadata"

/**
 * apply_recording_tempos (Daniel 2026-11-03): each song's most confident
 * recording tempo fills its EMPTY bpm fields — the song default
 * (songs.defaults.bpm + library_index.bpm, through applySongMetadata) and the
 * bpm of this tenant's setlist rows bonded to the song (through the setlist-ops
 * maintenance helper, which bumps versions so devices update). A person's bpm
 * is never overwritten; a value this tool wrote earlier may be updated by a
 * more confident take. Rules: src/lib/recordings/tempo-fill.ts.
 *
 * F-05: dryRun (default) returns the full report; a real run needs
 * `dryRun: false, force: true`. Admin / band_leader. Tenant-scoped.
 */

type DB = FirebaseFirestore.Firestore
type Data = Record<string, unknown>
const IN_CHUNK = 30
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
/** Rows per maintenance transaction (one setlist doc + rows). */
const ROWS_PER_TX = MAX_TRANSACTION_WRITES - 1

export interface ApplyRecordingTemposArgs {
    songId?: string
    dryRun?: boolean
    force?: boolean
}

export interface TempoFieldReport {
    target: "song" | "row"
    /** songId for the song default; the track id for a row. */
    id: string
    /** For target "song": which catalog doc (each is decided on its own field). */
    doc?: "library_index" | "songs"
    setlistId?: string
    action: FieldAction
    before: number | string | null
    after?: number
    reason: string
}

export interface TempoRecordingReport extends RecordingVerdict {
    songTitle: string | null
    /** Only on the take that is used: what each bpm field gets. */
    fields?: TempoFieldReport[]
}

export interface ApplyRecordingTemposResult {
    ok: true
    dryRun: boolean
    applied: boolean
    summary: { recordings: number; songsWithTempo: number; fill: number; update: number; keep: number; skip: number }
    recordings: TempoRecordingReport[]
    written?: { songs: number; rows: number; setlists: number }
    /** Setlists the real run could not write (gone or another tenant's); the run went on. */
    skippedSetlists?: Array<{ setlistId: string; reason: string }>
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

async function tenantRecordings(db: DB, org: OrgId, songId: string | null): Promise<Recording[]> {
    if (songId) return [...(await loadRecordingsForSongs(db, org, [songId])).values()].flat()
    // A legacy doc with no orgId is crc's (rowOrg); a query on orgId cannot match a missing field.
    const q = org === DEFAULT_ORG_ID ? db.collection("recordings") : db.collection("recordings").where("orgId", "==", org)
    const snap = await q.get()
    return snap.docs
        .filter((d) => rowOrg((d.data() as Data).orgId) === org)
        .map((d) => recordingFromDoc(d.id, d.data() as Data))
}

async function songTitle(db: DB, songId: string): Promise<string | null> {
    const [song, idx] = await Promise.all([db.collection("songs").doc(songId).get(), db.collection("library_index").doc(songId).get()])
    return str(song.data()?.title) ?? str(idx.data()?.name)
}

type SongPlan = Awaited<ReturnType<typeof applyRecordingTempoToSong>>

interface RowRef {
    id: string
    setlistId: string
    data: Data
}

/** This tenant's song rows bonded to these songs (songId, or a legacy fileId bond), on live setlists. */
async function bondedRows(db: DB, org: OrgId, songIds: string[]): Promise<{ bySong: Map<string, RowRef[]>; gone: Map<string, RowRef[]> }> {
    const found = new Map<string, RowRef>()
    for (let i = 0; i < songIds.length; i += IN_CHUNK) {
        const chunk = songIds.slice(i, i + IN_CHUNK)
        const [a, b] = await Promise.all([
            db.collection("tracks").where("songId", "in", chunk).get(),
            db.collection("tracks").where("fileId", "in", chunk).get(),
        ])
        for (const d of [...a.docs, ...b.docs]) {
            const data = d.data() as Data
            if (rowOrg(data.orgId) !== org) continue
            if (data.type !== undefined && data.type !== "song") continue
            const setlistId = str(data.setlistId)
            if (!setlistId) continue
            found.set(d.id, { id: d.id, setlistId, data })
        }
    }
    const setlistIds = [...new Set([...found.values()].map((r) => r.setlistId))]
    const live = new Set<string>()
    for (let i = 0; i < setlistIds.length; i += 100) {
        const refs = setlistIds.slice(i, i + 100).map((id) => db.collection("setlists").doc(id))
        if (refs.length === 0) continue
        const snaps = await db.getAll(...refs)
        for (const s of snaps) if (s.exists && rowOrg((s.data() as Data).orgId) === org) live.add(s.id)
    }
    const bySong = new Map<string, RowRef[]>()
    const gone = new Map<string, RowRef[]>()
    for (const r of found.values()) {
        const song = str(r.data.songId) ?? str(r.data.fileId)!
        const target = live.has(r.setlistId) ? bySong : gone
        target.set(song, [...(target.get(song) ?? []), r])
    }
    return { bySong, gone }
}

const rowField = (d: Data): BpmFieldState => ({
    bpm: d.bpm,
    bpmSource: d.bpmSource,
    bpmSourceRecordingId: d.bpmSourceRecordingId,
    bpmSourceValue: d.bpmSourceValue,
})

const writes = (a: FieldAction) => a === "fill" || a === "update"

export async function applyRecordingTemposTool(
    uid: string,
    args: ApplyRecordingTemposArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ApplyRecordingTemposResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const role = await readTenantRole(db, uid, org)
    if (role !== "admin" && role !== "band_leader") {
        return forbiddenRoleEnvelope({
            callerRole: role ?? null,
            requiredRoles: ["admin", "band_leader"],
            message: "Recording tempos are applied by an admin or band leader.",
            hint: "Ask an admin or band leader to run it.",
        })
    }
    const songId = args?.songId === undefined ? null : str(args.songId)
    if (args?.songId !== undefined && (!songId || !ID_RE.test(songId))) {
        return richError("invalid_argument", "`songId` must be a chart id.", { field: "songId" }, "Use the fileId from search_library.")
    }
    const dryRun = args?.dryRun !== false

    try {
        const recs = await tenantRecordings(db, org, songId)
        const { picks, verdicts } = pickSongTempos(recs)
        const songIds = [...picks.keys()]
        const songPlans = new Map<string, SongPlan>()
        await Promise.all(
            songIds.map(async (id) => songPlans.set(id, await applyRecordingTempoToSong(db, org, id, picks.get(id)!, { dryRun: true }))),
        )
        const { bySong, gone } = await bondedRows(db, org, songIds)

        const titleIds = [...new Set(recs.map((r) => r.songId).filter((s): s is string => !!s))]
        const titles = new Map<string, string | null>()
        await Promise.all(titleIds.map(async (id) => titles.set(id, await songTitle(db, id))))

        const summary = { recordings: recs.length, songsWithTempo: picks.size, fill: 0, update: 0, keep: 0, skip: 0 }
        const songWrites: Array<{ songId: string; pick: TempoPick }> = []
        const rowWrites = new Map<string, Array<{ rowId: string; pick: TempoPick }>>()
        const report: TempoRecordingReport[] = verdicts.map((v) => {
            const out: TempoRecordingReport = { ...v, songTitle: v.songId ? (titles.get(v.songId) ?? null) : null }
            if (!v.used || !v.songId) return out
            const pick = picks.get(v.songId)!
            const fields: TempoFieldReport[] = []
            const sp = songPlans.get(v.songId)!
            if (!sp.exists) fields.push({ target: "song", id: v.songId, action: "skip", before: null, reason: "no library entry for this chart" })
            else if (!sp.owned) fields.push({ target: "song", id: v.songId, action: "skip", before: null, reason: "another tenant's chart (shared, not ours to change)" })
            else {
                for (const { doc, decision } of sp.decisions) fields.push({ target: "song", id: v.songId, doc, ...decision })
                if (sp.decisions.some((d) => writes(d.decision.action))) songWrites.push({ songId: v.songId, pick })
            }
            for (const r of bySong.get(v.songId) ?? []) {
                const d = decideField(rowField(r.data), pick)
                fields.push({ target: "row", id: r.id, setlistId: r.setlistId, ...d })
                if (writes(d.action)) rowWrites.set(r.setlistId, [...(rowWrites.get(r.setlistId) ?? []), { rowId: r.id, pick }])
            }
            for (const r of gone.get(v.songId) ?? []) {
                fields.push({ target: "row", id: r.id, setlistId: r.setlistId, action: "skip", before: null, reason: "its setlist was deleted" })
            }
            for (const f of fields) summary[f.action]++
            out.fields = fields
            return out
        })

        const base = { ok: true as const, summary, recordings: report }
        if (dryRun) return { ...base, dryRun: true, applied: false }
        if (args.force !== true) {
            return richError(
                "force_required",
                "Writing recording tempos needs force:true.",
                { dryRunPlan: { summary } },
                "Re-call with `dryRun: false, force: true` to write.",
            )
        }

        let songsWritten = 0
        for (const { songId: id, pick } of songWrites) {
            // Re-decided inside the write's transaction: a bpm a person typed since the plan is kept.
            const res = await applyRecordingTempoToSong(db, org, id, pick, { uid })
            if (res.written.length > 0) songsWritten++
        }

        let rowsWritten = 0
        let setlistsWritten = 0
        const skippedSetlists: Array<{ setlistId: string; reason: string }> = []
        for (const [setlistId, rows] of rowWrites) {
            for (let i = 0; i < rows.length; i += ROWS_PER_TX) {
                const slice = rows.slice(i, i + ROWS_PER_TX)
                let n = 0
                try {
                    n = await maintainSetlist(
                    db,
                    org,
                    setlistId,
                    async (tx, m) => {
                        const snaps = await tx.getAll(...slice.map((r) => db.collection("tracks").doc(r.rowId)))
                        let count = 0
                        snaps.forEach((snap, j) => {
                            const data = snap.exists ? (snap.data() as Data) : null
                            const { rowId, pick } = slice[j]
                            // Re-checked inside the transaction: still this setlist's row, still bonded, still empty/auto.
                            if (!data || data.setlistId !== setlistId) return
                            if ((str(data.songId) ?? str(data.fileId)) !== pick.songId) return
                            if (!writes(decideField(rowField(data), pick).action)) return
                            m.updateRow(rowId, rowTempoPatch(pick))
                            count++
                        })
                        return count
                    },
                    { touchUpdatedAt: false, actor: uid },
                )
                } catch (err) {
                    // A setlist deleted or moved since the plan: report it and go on.
                    if (!(err instanceof MaintenanceError)) throw err
                    skippedSetlists.push({ setlistId, reason: err.code })
                    break
                }
                rowsWritten += n
                if (n > 0) setlistsWritten++
            }
        }
        logger.info("[mcp] apply_recording_tempos committed", { uid, org, songsWritten, rowsWritten, setlistsWritten })
        return {
            ...base,
            dryRun: false,
            applied: true,
            written: { songs: songsWritten, rows: rowsWritten, setlists: setlistsWritten },
            ...(skippedSetlists.length ? { skippedSetlists } : {}),
        }
    } catch (err) {
        logger.error("[mcp] apply_recording_tempos failed", { err: err instanceof Error ? err.message : err })
        return richError("recording_tempos_failed", "Could not apply recording tempos.", { errorCode: 500 }, "Retry the dry run first.")
    }
}
