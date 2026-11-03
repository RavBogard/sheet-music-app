/**
 * Server-only. The one writer of the fields `songs/{fileId}` and
 * `library_index/{fileId}` both carry, so the two copies cannot drift.
 *
 * `library_index` is the catalogue (search, bonds, the library list);
 * `songs` is what the browser's pickers and sticky song memory read. A rename,
 * an archive or a key fix used to be written by each path on its own, and a
 * path that wrote one collection only left the other stale (setlist sync
 * review D §3). Every writer of a mirrored field goes through `writeCatalog`;
 * the browser's sticky defaults go through `saveSongDefaults`.
 * `catalog-mirror-guard.test.ts` refuses a new direct `songs` writer.
 *
 * Both helpers take the caller's tenant and refuse a row another tenant owns
 * (shared rows included: they are used, never changed). Every `songs` write
 * bumps `version` and `updatedAt`, and each call broadcasts on
 * `library_signals/latest` so open library views refetch.
 */
import "server-only"

import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore"

import { logger } from "@/lib/logger"
import { rowOrg } from "@/lib/org/membership"
import type { OrgId } from "@/lib/org/types"

import { isOwnedBy } from "./visibility"

export const SONGS = "songs"
export const LIBRARY = "library_index"

export type CatalogStatus = "active" | "archived" | "duplicate" | "orphaned"

/** The mirrored fields, by their catalogue meaning. */
export interface CatalogPatch {
    /** library_index `name`; songs `title` + `normalizedTitle`. */
    title?: string
    status?: CatalogStatus
    /** library_index `key`; songs `defaults.key`. */
    key?: string
    bpm?: number
    /** library_index `leadMusician`; songs `defaults.lead`. */
    leadMusician?: string
    durationSec?: number
}

export interface CatalogWrite {
    fileId: string
    patch: CatalogPatch
    /** Fields only library_index carries (provenance, W-02, archive audit). */
    index?: DocumentData
    /** Fields only songs carries (dedupe markers). No dotted keys. */
    song?: DocumentData
}

/** A platform-owner or ops sweep that already chose its rows: no tenant check. */
export const ANY_TENANT = "*any-tenant*" as const

export interface CatalogWriteOptions {
    /** The caller's tenant; each row must be owned by it (else `refused`). */
    org: OrgId | typeof ANY_TENANT
    /**
     * A row with no songs doc: `skip` (default) writes library_index only;
     * `stub` creates the songs doc (stamped with the row's tenant).
     */
    missingSong?: "skip" | "stub"
    /** Default true. */
    broadcast?: boolean
    now?: number
}

export interface CatalogWriteResult {
    /** Rows written (either collection). */
    written: string[]
    /** Neither doc exists. */
    missing: string[]
    /** Owned by another tenant: nothing written. */
    refused: string[]
}

type DB = Firestore

/** Two reads and at most two writes per row; Firestore caps a batch at 500. */
const ROWS_PER_BATCH = 200

/** library_index fields for a patch. */
export function indexFields(patch: CatalogPatch): DocumentData {
    const out: DocumentData = {}
    if (patch.title !== undefined) out.name = patch.title
    if (patch.status !== undefined) out.status = patch.status
    if (patch.key !== undefined) out.key = patch.key
    if (patch.bpm !== undefined) out.bpm = patch.bpm
    if (patch.leadMusician !== undefined) out.leadMusician = patch.leadMusician
    if (patch.durationSec !== undefined) out.durationSec = patch.durationSec
    return out
}

/** songs fields for a patch, nested (written with `set(…, {merge: true})`). */
export function songFields(patch: CatalogPatch): DocumentData {
    const out: DocumentData = {}
    if (patch.title !== undefined) {
        out.title = patch.title
        out.normalizedTitle = patch.title.toLowerCase()
    }
    if (patch.status !== undefined) out.status = patch.status
    const defaults: DocumentData = {}
    if (patch.key !== undefined) defaults.key = patch.key
    if (patch.bpm !== undefined) defaults.bpm = patch.bpm
    if (patch.leadMusician !== undefined) defaults.lead = patch.leadMusician
    if (patch.durationSec !== undefined) defaults.durationSec = patch.durationSec
    if (Object.keys(defaults).length > 0) out.defaults = defaults
    return out
}

function songStamp(owner: OrgId, now: number): DocumentData {
    // The pickers read songs by orgId: a doc this write creates must carry it.
    return { orgId: owner, updatedAt: now, version: FieldValue.increment(1) }
}

/** Best effort: open library views refetch. Never throws. */
export async function broadcastLibraryChange(db: DB, op: string = "update"): Promise<void> {
    try {
        // No fileId, no uid: every tenant can read this doc (phase 9).
        await db.collection("library_signals").doc("latest").set({ at: new Date().toISOString(), op })
    } catch (err) {
        logger.warn(`[catalog-mirror] library_signals write failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
    }
}

function ownerRow(index: DocumentData | null, song: DocumentData | null): DocumentData | null {
    return index ?? song
}

/**
 * Write mirrored fields to both collections (each row's library_index and
 * songs doc, where they exist), one batch per 200 rows.
 */
export async function writeCatalog(
    db: DB,
    items: readonly CatalogWrite[],
    opts: CatalogWriteOptions,
): Promise<CatalogWriteResult> {
    const result: CatalogWriteResult = { written: [], missing: [], refused: [] }
    const now = opts.now ?? Date.now()
    for (let i = 0; i < items.length; i += ROWS_PER_BATCH) {
        const slice = items.slice(i, i + ROWS_PER_BATCH)
        const indexRefs = slice.map((it) => db.collection(LIBRARY).doc(it.fileId))
        const songRefs = slice.map((it) => db.collection(SONGS).doc(it.fileId))
        const snaps = await db.getAll(...indexRefs, ...songRefs)
        const batch = db.batch()
        let writes = 0
        slice.forEach((it, j) => {
            const iSnap = snaps[j]
            const sSnap = snaps[slice.length + j]
            const index = iSnap.exists ? (iSnap.data() ?? {}) : null
            const song = sSnap.exists ? (sSnap.data() ?? {}) : null
            const row = ownerRow(index, song)
            if (!row) {
                result.missing.push(it.fileId)
                return
            }
            if (opts.org !== ANY_TENANT && !isOwnedBy(row, opts.org)) {
                result.refused.push(it.fileId)
                return
            }
            const owner = rowOrg(row.orgId)
            if (index) {
                const data = { ...indexFields(it.patch), ...(it.index ?? {}) }
                if (Object.keys(data).length > 0) {
                    batch.set(indexRefs[j], { ...data, orgId: owner }, { merge: true })
                    writes++
                }
            }
            if (song || opts.missingSong === "stub") {
                const data = { ...songFields(it.patch), ...(it.song ?? {}) }
                if (Object.keys(data).length > 0) {
                    batch.set(songRefs[j], { ...data, ...songStamp(owner, now) }, { merge: true })
                    writes++
                }
            }
            result.written.push(it.fileId)
        })
        if (writes > 0) await batch.commit()
    }
    if (result.written.length > 0 && opts.broadcast !== false) await broadcastLibraryChange(db)
    return result
}

// ── Sticky song memory (the browser's per-song defaults) ───────────────────

export interface SongDefaultsPatch {
    key?: string
    lead?: string
    bpm?: number
}

export const RECENT_CAP = 5

export type SaveSongDefaultsResult =
    | { ok: true; defaults: DocumentData; recent: DocumentData[] }
    | { ok: false; reason: "not-found" | "not-owner" | "invalid" }

/**
 * The browser's sticky memory: the key/lead/bpm a song was last used with on
 * a setlist, plus the five most recent uses. One transaction, so two devices
 * cannot lose each other's `recent` entries, and only the fields the edit
 * changed are written (an MCP `update_song` default is never reverted by a
 * stale browser copy).
 *
 * Sticky memory is per-song state, not the catalogue: it is NOT mirrored to
 * library_index, whose `key` is the chart's key (detect-key, enrichment,
 * `update_song`). A transposition for one service must not rewrite it.
 */
export async function saveSongDefaults(
    db: DB,
    org: OrgId,
    input: { songId: string; setlistId: string; patch: SongDefaultsPatch; now?: number },
): Promise<SaveSongDefaultsResult> {
    const { songId, setlistId, patch } = input
    const now = input.now ?? Date.now()
    const changed: DocumentData = {}
    if (patch.key !== undefined) changed.key = patch.key
    if (patch.lead !== undefined) changed.lead = patch.lead
    if (patch.bpm !== undefined) changed.bpm = patch.bpm
    if (Object.keys(changed).length === 0) return { ok: false, reason: "invalid" }

    const songRef = db.collection(SONGS).doc(songId)
    const indexRef = db.collection(LIBRARY).doc(songId)
    const out = await db.runTransaction(async (tx) => {
        const [sSnap, iSnap] = await tx.getAll(songRef, indexRef)
        if (!sSnap.exists) return { ok: false as const, reason: "not-found" as const }
        const song = sSnap.data() ?? {}
        const row = ownerRow(iSnap.exists ? (iSnap.data() ?? {}) : null, song)!
        if (!isOwnedBy(row, org)) return { ok: false as const, reason: "not-owner" as const }
        const defaults = { ...((song.defaults ?? {}) as DocumentData), ...changed }
        const prior = Array.isArray(song.recent) ? (song.recent as DocumentData[]) : []
        const recent = [{ ...changed, setlistId, performedAt: now }, ...prior].slice(0, RECENT_CAP)
        tx.set(songRef, { defaults: changed, recent, ...songStamp(rowOrg(row.orgId), now) }, { merge: true })
        return { ok: true as const, defaults, recent }
    })
    if (out.ok) await broadcastLibraryChange(db)
    return out
}
