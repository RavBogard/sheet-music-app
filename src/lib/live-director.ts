/**
 * Live-director write helpers — band_leader/admin in-Perform mutations.
 *
 * Three actions, ratified by Daniel 2026-05-23 in
 * `.paul/research/live-key-song-swap/DISCUSSION.md` ##RATIFIED BUILD SPEC +
 * ##ADDENDUM 5:
 *
 *   1. `changeTrackKey(trackId, key)`    — write `tracks/{id}.key`.
 *   2. `swapTrackChart(trackId, song)`   — re-bond row to a different chart;
 *      mirrors the server-side `swap_chart` MCP tool: refresh fileId + songId
 *      + title + fileName + key + bpm from the new song's catalog row in one
 *      atomic-feeling patch (a single `applyEdit` `update` op).
 *   3. `insertTrack({setlistId, song, placement, currentIndex, currentTracks})`
 *      — add a new song row at `before` / `after` / `append` placement
 *      relative to the long-pressed row; bumps `order` on the rows that move
 *      down, then `set`s the new row and seeds song defaults.
 *
 * Write surface = `applyEdit` (Dexie + outbox + Firestore via the sync engine
 * — the existing "Firestore → Dexie → useLiveQuery pipe" the lane PROMPT
 * specifies). NOT the `/api/mcp` HTTP surface — those tools are admin-SDK
 * server paths primarily for Claude Desktop; the in-app editor (SetlistGrid,
 * MobileRowCard) already mutates `tracks/{id}` via the same applyEdit path,
 * and that's the canonical band_leader-iPad write contract.
 *
 * No SmartTransposer / chord-overlay coordination — this is pure label
 * propagation. The display key label updates; the chord graphics on the
 * PDF stay unchanged. Per DISCUSSION ##ADDENDUM 4: "the label IS the
 * feature".
 */

import { applyEdit } from "@/lib/local/write"
import { seedTrackFromSong } from "@/lib/songs/defaults"
import type { DriveFile, SetlistTrack } from "@/types/models"

/** Write `tracks/{id}.key`. Empty string clears the key (DiscoverySpec). */
export async function changeTrackKey(trackId: string, key: string): Promise<void> {
    await applyEdit({
        op: "update",
        collection: "tracks",
        docId: trackId,
        patch: { key },
    })
}

/**
 * Rebond an existing track to a different chart. Mirrors `swap_chart`
 * (MCP tool, server side): refreshes the metadata that should match the
 * new chart in ONE write — fileId, songId, title, fileName, mimeType (when
 * the catalog row exposes it) and the defaults pulled from `songs/{id}.defaults`
 * (key + bpm; lead intentionally NOT auto-overwritten since the previous
 * row's leadMusician may still be correct).
 *
 * Preserves position-in-setlist, notes, referenceLink, leadMusician,
 * transposition.
 */
export async function swapTrackChart(
    trackId: string,
    newSong: DriveFile,
): Promise<void> {
    const patch: Record<string, unknown> = {
        fileId: newSong.id,
        songId: newSong.id,
        title: newSong.displayName ?? newSong.name,
        fileName: newSong.name,
    }
    if (newSong.mimeType) {
        // v70-01-01 Task 4 parity — cache library_index.mimeType on the track
        // so queue-utils + PDFOverlay can route to the right viewer without
        // a fresh library lookup.
        patch.mimeType = newSong.mimeType
    }
    // Best-effort: pull catalog defaults (key + bpm). Don't fail the swap if
    // the songs row is missing or hasn't synced to Dexie yet.
    try {
        const defaults = await seedTrackFromSong(newSong.id)
        if (defaults.key !== undefined) patch.key = defaults.key
        if (defaults.bpm !== undefined) patch.bpm = defaults.bpm
    } catch {
        // Swap is the primary intent; the new title + fileId already give
        // the band the right chart in their iPad. Defaults are nice-to-have.
    }

    await applyEdit({
        op: "update",
        collection: "tracks",
        docId: trackId,
        patch,
    })
}

export type InsertPlacement = "before" | "after" | "append"

export interface InsertTrackInput {
    setlistId: string
    song: DriveFile
    placement: InsertPlacement
    /** Display index of the currently-focused row (Bryn's long-press target).
     *  Ignored for `placement === "append"`. */
    currentIndex: number
    /** Live, display-ordered tracks for the setlist. Used to compute the new
     *  row's `order` and to bump downstream rows. */
    currentTracks: SetlistTrack[]
}

/**
 * Insert a fresh track at the chosen placement. Returns the new track id.
 *
 * Order semantics: `applyEdit({op:'update', patch:{order}})` mirrors the
 * editor's reorder path (SetlistGrid handleReorderInsertOrUpdate); the new
 * track gets order=insertAt and every existing row at index >= insertAt
 * shifts by +1. We use the display-array index (NOT the existing `order`
 * field) so prior order-gaps don't matter.
 */
export async function insertTrack(input: InsertTrackInput): Promise<string> {
    const { setlistId, song, placement, currentIndex, currentTracks } = input

    const insertAt = (() => {
        if (placement === "append") return currentTracks.length
        if (placement === "before") return Math.max(0, currentIndex)
        // after
        return Math.min(currentTracks.length, currentIndex + 1)
    })()

    // 1. Bump order on every row at or after the insertion point. Skip for
    //    `append` (nothing to bump). Parallel writes are safe — each docId
    //    is unique, each new order value is unique.
    if (insertAt < currentTracks.length) {
        const bumps: Promise<void>[] = []
        for (let i = insertAt; i < currentTracks.length; i++) {
            const t = currentTracks[i]
            bumps.push(
                applyEdit({
                    op: "update",
                    collection: "tracks",
                    docId: t.id,
                    patch: { order: i + 1 },
                }),
            )
        }
        await Promise.all(bumps)
    }

    // 2. Insert the new row. Field set mirrors SetlistGrid.handlePickSong:
    //    songId === fileId (libId is both, per v54-01-02 lock); type='song'
    //    explicit so SetlistRow's clickability gate (fileId-bonded non-songs
    //    were the cycle-5 R1 finding) gets the right semantics from frame 1.
    const newId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `track-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    const doc: Record<string, unknown> & { id: string } = {
        id: newId,
        setlistId,
        songId: song.id,
        fileId: song.id,
        order: insertAt,
        title: song.displayName ?? song.name,
        type: "song",
    }
    if (song.mimeType) doc.mimeType = song.mimeType

    await applyEdit({
        op: "set",
        collection: "tracks",
        doc,
    })

    // 3. Seed defaults (key + lead + bpm) from the song's catalog row. Best-
    //    effort: if the catalog row is missing, leave the new track bare —
    //    the band reads the key off the chart anyway and Bryn can long-press
    //    the new row to set a key if needed.
    try {
        const defaults = await seedTrackFromSong(song.id)
        const seedPatch: Record<string, unknown> = {}
        if (defaults.key !== undefined) seedPatch.key = defaults.key
        if (defaults.lead !== undefined) seedPatch.leadMusician = defaults.lead
        if (defaults.bpm !== undefined) seedPatch.bpm = defaults.bpm
        if (Object.keys(seedPatch).length > 0) {
            await applyEdit({
                op: "update",
                collection: "tracks",
                docId: newId,
                patch: seedPatch,
            })
        }
    } catch {
        // Seeding is best-effort; the insert itself is the primary intent.
    }

    return newId
}
