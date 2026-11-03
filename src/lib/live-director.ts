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
 *      + title + fileName + key + bpm from the new song's catalog row in ONE
 *      edit.
 *   3. `insertTrack({setlistId, song, placement, currentIndex, currentTracks})`
 *      — add a new song row at `before` / `after` / `append` placement
 *      relative to the long-pressed row, with the song's defaults.
 *
 * Write surface (setlist sync PR 3): the setlist ops client, the same path
 * the editor uses. A key or chart change is an `editRow` with the values the
 * device last had from the server as its base, so it can queue offline and
 * a concurrent edit shows as a conflict instead of being overwritten. An
 * insert is one `insert` op anchored on its neighbours; it needs a
 * connection (D2(a)) and throws when there is none, so the caller's error
 * path tells the director.
 *
 * No SmartTransposer / chord-overlay coordination — this is pure label
 * propagation. Per DISCUSSION ##ADDENDUM 4: "the label IS the feature".
 */

import { getDb } from "@/lib/local/schema"
import type { LocalTrack } from "@/lib/local/types"
import { editRow, insertRows } from "@/lib/setlist-ops-client/actions"
import { seedTrackFromSong } from "@/lib/songs/defaults"
import type { DriveFile, SetlistTrack } from "@/types/models"

/** The row as this device last had it from the server (cache, else a fresh read). */
async function serverRow(trackId: string): Promise<LocalTrack> {
    const cached = await getDb().tracks.get(trackId)
    if (cached) return cached
    const { getDb: getFirestore } = await import("@/lib/firebase")
    const { doc, getDoc } = await import("firebase/firestore")
    const snap = await getDoc(doc(await getFirestore(), "tracks", trackId))
    if (!snap.exists()) throw new Error("This row is no longer on the setlist.")
    const data = snap.data() as Record<string, unknown>
    return { ...data, id: trackId, setlistId: String(data.setlistId ?? ""), order: Number(data.order ?? 0) } as LocalTrack
}

/** Write `tracks/{id}.key`. Empty string clears the key (DiscoverySpec). */
export async function changeTrackKey(trackId: string, key: string): Promise<void> {
    const row = await serverRow(trackId)
    await editRow(row.setlistId, row, { key }, { undo: false })
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
    const row = await serverRow(trackId)
    await editRow(row.setlistId, row, patch, { undo: false })
}

export type InsertPlacement = "before" | "after" | "append"

export interface InsertTrackInput {
    setlistId: string
    song: DriveFile
    placement: InsertPlacement
    /** Display index of the currently-focused row (Bryn's long-press target).
     *  Ignored for `placement === "append"`. */
    currentIndex: number
    /** Live, display-ordered tracks for the setlist. Used for the new row's
     *  neighbours (its anchors). */
    currentTracks: SetlistTrack[]
}

/**
 * Insert a fresh track at the chosen placement. Returns the new track id.
 * One `insert` op anchored on the rows around the display position, so the
 * server places it right even if others moved rows meanwhile.
 */
export async function insertTrack(input: InsertTrackInput): Promise<string> {
    const { setlistId, song, placement, currentIndex, currentTracks } = input

    const insertAt = (() => {
        if (placement === "append") return currentTracks.length
        if (placement === "before") return Math.max(0, currentIndex)
        // after
        return Math.min(currentTracks.length, currentIndex + 1)
    })()

    // Field set mirrors the editor's add: songId === fileId (libId is both,
    // per v54-01-02 lock); type='song' explicit so SetlistRow's clickability
    // gate gets the right semantics from frame 1. Defaults (key + lead + bpm)
    // ride on the same insert, best-effort.
    const row: Record<string, unknown> = {
        songId: song.id,
        fileId: song.id,
        title: song.displayName ?? song.name,
        type: "song",
    }
    if (song.mimeType) row.mimeType = song.mimeType
    try {
        const defaults = await seedTrackFromSong(song.id)
        if (defaults.key !== undefined) row.key = defaults.key
        if (defaults.lead !== undefined) row.leadMusician = defaults.lead
        if (defaults.bpm !== undefined) row.bpm = defaults.bpm
    } catch {
        // Seeding is best-effort; the insert itself is the primary intent.
    }

    const view = currentTracks.map((t, i) => ({ ...t, setlistId, order: i })) as unknown as LocalTrack[]
    const ids = await insertRows(setlistId, view, insertAt, [row], { undo: false })
    // Machine text only (offline): the caller shows its own translated error.
    if (!ids || ids.length === 0) throw new Error("offline: structural edits need a connection")
    return ids[0]
}
