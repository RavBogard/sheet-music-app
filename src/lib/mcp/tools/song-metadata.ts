import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import {
    loadUploader,
    isUploadAllowed,
    isTrustedLeader,
    uploadForbidden,
    rateLimitEnvelope,
} from "./uploader-roles"

/**
 * Cowork #5 + #3 (cowork-2026-05-22) — shared catalog-metadata writer.
 *
 * The library has TWO read surfaces that must agree for a metadata edit to
 * actually "stick" everywhere:
 *  - `songs/{id}.defaults.{key,bpm,lead}` — read by get_song / search_library
 *    AND by add_track_to_setlist's bond resolution (resolveTrackBondDefaults →
 *    getSongById). A wrong/empty key here is why the cowork session saw a
 *    bonded row pull `key: null` from the catalog.
 *  - `library_index/{id}.{key,bpm,leadMusician}` — read by list_library, the
 *    in-app /library catalog, and edit_enrichment.
 *
 * `processChartUpload` only writes key/bpm to `library_index` (not
 * songs.defaults), so neither tool here can rely on the upload pipeline to
 * keep the two coherent. `applySongMetadata` writes BOTH in one batch so a
 * key/bpm/lead fix shows up on every surface — and is reused by both
 * `update_song` (#5) and `save_scraped_chart` (#3, post-upload).
 *
 * NOTE: the shared `processChartUpload` pipeline is intentionally NOT touched
 * (it feeds upload_chart + the HTTP route + the Drive-sync cron); confining
 * the fix to this helper keeps the blast radius to the MCP curation surface.
 */

/** Set-only metadata patch. An undefined field is left untouched. */
export interface SongMetadataPatch {
    key?: string
    bpm?: number
    /** Vocal lead — maps to songs `defaults.lead` + library_index `leadMusician`. */
    leadMusician?: string
}

export interface ApplySongMetadataResult {
    /** False when neither songs/{id} nor library_index/{id} exists. */
    existed: boolean
    /** Business fields the patch changed (or would change in dryRun). */
    fieldsChanged: string[]
    /** Whether the songs/{id} catalog doc was (or would be) written. */
    songWritten: boolean
    /** Whether the library_index/{id} row was (or would be) written. */
    indexWritten: boolean
    /** Persisted values before the write (library_index wins, songs.defaults fallback). */
    before: { key: string | null; bpm: number | null; leadMusician: string | null }
    /** Resolved values after applying the patch. */
    after: { key: string | null; bpm: number | null; leadMusician: string | null }
    /**
     * v11-02-03: true when `opts.org` was supplied and the existing chart
     * belongs to a DIFFERENT tenant — no write happened. Callers map this to a
     * not-found envelope (don't leak cross-tenant existence). Absent/false on
     * same-tenant or org-less calls.
     */
    tenantMismatch?: boolean
}

function pickStr(v: unknown): string | null {
    return typeof v === "string" ? v : null
}
function pickNum(v: unknown): number | null {
    return typeof v === "number" ? v : null
}

/**
 * Apply a key/bpm/leadMusician patch to BOTH catalog surfaces for one chart.
 * Reads existence first; writes only the doc(s) that exist (never creates a
 * phantom row). Returns a before/after diff so callers can render a dryRun
 * plan. Caller is responsible for auth + rate-limit; this is the low-level
 * writer.
 */
export async function applySongMetadata(
    db: FirebaseFirestore.Firestore,
    fileId: string,
    patch: SongMetadataPatch,
    // v11-02-03: `org` is the caller's tenant. When supplied, a chart owned by a
    // different org is treated as not-found (tenantMismatch:true, no write).
    // Omit (default) for internal/same-caller paths (e.g. save_scraped_chart's
    // post-create mirror) — behavior is then exactly as before.
    opts: { dryRun?: boolean; org?: OrgId } = {},
): Promise<ApplySongMetadataResult> {
    const [songSnap, indexSnap] = await Promise.all([
        db.collection("songs").doc(fileId).get(),
        db.collection("library_index").doc(fileId).get(),
    ])
    const existed = songSnap.exists || indexSnap.exists
    const indexData = indexSnap.exists ? (indexSnap.data() ?? {}) : {}
    const songData = songSnap.exists ? (songSnap.data() ?? {}) : {}
    const songDefaults = (songData.defaults ?? {}) as Record<string, unknown>

    const before = {
        key: pickStr(indexData.key) ?? pickStr(songDefaults.key),
        bpm: pickNum(indexData.bpm) ?? pickNum(songDefaults.bpm),
        leadMusician:
            pickStr(indexData.leadMusician) ?? pickStr(songDefaults.lead),
    }

    const fieldsChanged: string[] = []
    if (patch.key !== undefined) fieldsChanged.push("key")
    if (patch.bpm !== undefined) fieldsChanged.push("bpm")
    if (patch.leadMusician !== undefined) fieldsChanged.push("leadMusician")

    const after = {
        key: patch.key !== undefined ? patch.key : before.key,
        bpm: patch.bpm !== undefined ? patch.bpm : before.bpm,
        leadMusician:
            patch.leadMusician !== undefined
                ? patch.leadMusician
                : before.leadMusician,
    }

    // v11-02-03: cross-tenant write wall. When the caller's org is supplied and
    // the chart exists, deny (no write) if it belongs to another tenant — prefer
    // the library_index orgId, fall back to songs. Returned as tenantMismatch so
    // the caller surfaces a not-found (never reveal the chart exists).
    if (opts.org !== undefined && existed) {
        const docOrg = indexSnap.exists
            ? rowOrg(indexData.orgId)
            : rowOrg(songData.orgId)
        if (docOrg !== opts.org) {
            return {
                existed: true,
                tenantMismatch: true,
                fieldsChanged: [],
                songWritten: false,
                indexWritten: false,
                before,
                after,
            }
        }
    }

    const willWriteSong = songSnap.exists && fieldsChanged.length > 0
    const willWriteIndex = indexSnap.exists && fieldsChanged.length > 0

    if (opts.dryRun || !existed || fieldsChanged.length === 0) {
        return {
            existed,
            fieldsChanged,
            songWritten: willWriteSong,
            indexWritten: willWriteIndex,
            before,
            after,
        }
    }

    const batch = db.batch()
    if (willWriteSong) {
        // Dotted field paths touch only the nested default, leaving the rest
        // of `defaults` (and `recent[]`) intact.
        const songUpdate: Record<string, unknown> = { updatedAt: Date.now() }
        if (patch.key !== undefined) songUpdate["defaults.key"] = patch.key
        if (patch.bpm !== undefined) songUpdate["defaults.bpm"] = patch.bpm
        if (patch.leadMusician !== undefined)
            songUpdate["defaults.lead"] = patch.leadMusician
        batch.update(db.collection("songs").doc(fileId), songUpdate)
    }
    if (willWriteIndex) {
        const indexUpdate: Record<string, unknown> = {}
        if (patch.key !== undefined) indexUpdate.key = patch.key
        if (patch.bpm !== undefined) indexUpdate.bpm = patch.bpm
        if (patch.leadMusician !== undefined)
            indexUpdate.leadMusician = patch.leadMusician
        batch.update(db.collection("library_index").doc(fileId), indexUpdate)
    }
    await batch.commit()

    return {
        existed,
        fieldsChanged,
        songWritten: willWriteSong,
        indexWritten: willWriteIndex,
        before,
        after,
    }
}

/** Best-effort cache-invalidation broadcast — same channel processChartUpload
 *  / delete_chart use so open in-app library views refetch. Never throws. */
async function broadcastLibrarySignal(
    db: FirebaseFirestore.Firestore,
    fileId: string,
    uid: string,
): Promise<void> {
    try {
        await db.collection("library_signals").doc("latest").set({
            at: new Date().toISOString(),
            fileId,
            op: "update",
            by: uid,
        })
    } catch (err) {
        logger.warn(
            `[update_song] library_signals write failed (non-fatal): ${
                err instanceof Error ? err.message : String(err)
            }`,
        )
    }
}

// ─── update_song (cowork #5) ─────────────────────────────────────────────────

export interface UpdateSongArgs {
    id: string
    key?: string
    bpm?: number
    /** When true, return the before/after plan without writing (observability). */
    dryRun?: boolean
}

/**
 * Cowork #5 — let a musician or band leader fix a wrong/missing key or bpm on a
 * library entry WITHOUT going through the admin-only enrichment edit tool.
 * Gated by `isUploadAllowed` (admin / band_leader / musician / canUpload) — the
 * same surface that may add charts — NOT the stricter admin-only enrichment
 * gate. Writes both catalog surfaces via applySongMetadata so the fix shows up
 * in get_song, search_library, list_library, and future bonds alike. Idempotent.
 */
export async function updateSong(
    uid: string,
    args: UpdateSongArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | {
          ok: true
          id: string
          dryRun: boolean
          fieldsChanged: string[]
          before: ApplySongMetadataResult["before"]
          after: ApplySongMetadataResult["after"]
          songWritten: boolean
          indexWritten: boolean
      }
    | RichErrorEnvelope
> {
    if (!args.id?.trim())
        return richError("invalid_argument", "id is required.", { field: "id" })
    if (args.key === undefined && args.bpm === undefined)
        return richError(
            "invalid_argument",
            "Provide at least one of: key, bpm.",
            { fields: ["key", "bpm"] },
        )
    if (
        args.bpm !== undefined &&
        (typeof args.bpm !== "number" || !(args.bpm > 0))
    )
        return richError("invalid_field", "bpm must be a positive number.", {
            field: "bpm",
        })

    initAdmin()
    const db = getFirestore()

    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

    const id = args.id.trim()
    const result = await applySongMetadata(
        db,
        id,
        { key: args.key, bpm: args.bpm },
        { dryRun: args.dryRun, org },
    )
    // v11-02-03: tenantMismatch (cross-tenant chart) is surfaced as not-found —
    // identical envelope to a genuinely-absent chart, so we never leak that the
    // id exists in another tenant.
    if (!result.existed || result.tenantMismatch)
        return richError(
            "song_not_found",
            `No library entry or song found for id '${id}'.`,
            { id },
            "Verify the id via search_library / list_library.",
        )

    if (!args.dryRun && (result.songWritten || result.indexWritten)) {
        await broadcastLibrarySignal(db, id, uid)
    }

    return {
        ok: true,
        id,
        dryRun: !!args.dryRun,
        fieldsChanged: result.fieldsChanged,
        before: result.before,
        after: result.after,
        songWritten: result.songWritten,
        indexWritten: result.indexWritten,
    }
}
