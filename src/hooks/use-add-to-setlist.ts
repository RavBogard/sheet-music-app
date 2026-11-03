"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { displayChartTitle } from '@/lib/format/chart-title'
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { appendRows, replayOps, settleBatch, SetlistOpRefusedError } from "@/lib/setlist-ops-client/actions"
import { refusalReasonText } from "@/components/setlist/grid/refusal-text"
import type { T } from "@/i18n/core"

/**
 * Append the rows and wait for the server's answer, so "Added" is said only
 * once they are saved. Offline or refused: an error toast with the reason,
 * and null.
 */
async function appendAndWait(setlistId: string, rows: Array<Record<string, unknown>>, t: T): Promise<string[] | null> {
  let batch = ""
  const ids = await appendRows(setlistId, rows, { onBatch: (k) => (batch = k) })
  if (!ids) {
    toast.error(t("setlistGrid.offlineStructureReason"))
    return null
  }
  try {
    if ((await settleBatch(setlistId, batch)) === "offline") {
      toast.error(t("setlistGrid.offlineStructureReason"))
      return null
    }
  } catch (err) {
    const refused = err instanceof SetlistOpRefusedError ? err : null
    toast.error(refusalReasonText(refused?.reason ?? "other", t, refused?.field))
    return null
  }
  return ids
}
import { createSetlistService } from "@/lib/setlist-firebase"
import type { DriveFile, Setlist, SetlistTrack } from "@/types/models"
import { useT } from "@/i18n/client"

// This hook reads only denormalized parent-doc fields (fileIds, for the
// duplicate warning). New rows go to the END of the setlist through the ops
// endpoint (setlist sync PR 3), which renumbers and keeps the counts.

/** A library pick as row fields for the ops client (explicit list). */
function rowFromTrack(t: SetlistTrack): Record<string, unknown> {
  return {
    title: t.title,
    type: "song",
    ...(t.fileId ? { songId: t.fileId, fileId: t.fileId } : {}),
    ...(t.fileName ? { fileName: t.fileName } : {}),
    ...(t.key ? { key: t.key } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
  }
}

/** Clean a filename into a display title (same logic as addSongsFromLibrary).
 *  `untitled` is the translated fallback title (hooks.untitledSong). */
function cleanFileName(name: string, untitled: string): string {
  return name
    .replace(/\.(pdf|musicxml|xml|mxl|txt)$/i, '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .trim() || untitled
}

/** Ensure the fileName has the correct extension based on mimeType */
function getFileNameWithExtension(file: DriveFile): string {
  const name = file.name;
  if (file.mimeType === 'text/plain' && !name.endsWith('.txt')) return `${name}.txt`;
  if (file.mimeType === 'application/xml' && !name.match(/\.(xml|mxl|musicxml)$/i)) return `${name}.musicxml`;
  if (file.mimeType === 'application/pdf' && !name.endsWith('.pdf')) return `${name}.pdf`;
  return name;
}

/** Convert a FirestoreDate-like value to a comparable timestamp */
function toTimestamp(date: unknown): number {
  if (!date) return 0
  if (date instanceof Date) return date.getTime()
  if (typeof date === 'number') return date
  if (typeof date === 'string') return new Date(date).getTime()
  if (typeof date === 'object' && date !== null) {
    const obj = date as { toDate?: () => Date; seconds?: number }
    if (typeof obj.toDate === 'function') return obj.toDate().getTime()
    if (typeof obj.seconds === 'number') return obj.seconds * 1000
  }
  return 0
}

export function useAddToSetlist() {
  const { user, isAdmin, isBandLeader } = useAuth()
  const t = useT()
  const untitled = t("hooks.untitledSong")

  // Core state
  const [isOpen, setIsOpen] = useState(false)
  const [pendingSongs, setPendingSongs] = useState<DriveFile[]>([])
  const [allSetlists, setAllSetlists] = useState<Setlist[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loaded, setLoaded] = useState(false)

  // Track added IDs for undo
  const lastAddedTrackIdsRef = useRef<string[]>([])

  const canAddToSetlist = isBandLeader || isAdmin

  // Setlist service
  const setlistService = useMemo(
    () => createSetlistService(user?.uid ?? null, user?.displayName ?? null),
    [user?.uid, user?.displayName]
  )

  // v11-04-03: scope the subscription to the host's tenant.
  const org = useOrg()

  // Subscribe to all setlists (v4.0: single unified list)
  useEffect(() => {
    const unsub = setlistService.subscribeToAllSetlists(
      (setlists) => {
        setAllSetlists(setlists)
        setLoaded(true)
      },
      undefined,
      org,
    )
    return () => unsub()
  }, [setlistService, org])

  const loading = !loaded

  // Sort and filter
  const editableSetlists = useMemo(() => {
    let list = [...allSetlists]

    // Sort by updatedAt desc (fallback to date)
    list.sort((a, b) => {
      const ta = toTimestamp(a.updatedAt) || toTimestamp(a.date)
      const tb = toTimestamp(b.updatedAt) || toTimestamp(b.date)
      return tb - ta
    })

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(s => s.name.toLowerCase().includes(q))
    }

    return list
  }, [allSetlists, searchQuery])

  // Open the sheet for given songs
  const openForSongs = useCallback((songs: DriveFile[]) => {
    if (songs.length === 0) return
    setPendingSongs(songs)
    setSearchQuery('')
    setIsOpen(true)
  }, [])

  // Add pending songs to a setlist
  const addToSetlist = useCallback(async (setlistId: string, setlist: Setlist) => {
    if (pendingSongs.length === 0) return

    const existingFileIds = new Set(setlist.fileIds ?? [])
    const hasDuplicates = pendingSongs.some(f => existingFileIds.has(f.id))

    // Build tracks (same pattern as addSongsFromLibrary)
    const now = Date.now()
    const newTracks: SetlistTrack[] = pendingSongs.map((file, index) => ({
      id: `track-${now}-${file.id}-${index}`,
      title: cleanFileName(file.name, untitled),
      fileId: file.id,
      fileName: getFileNameWithExtension(file),
      key: file.metadata?.key || "",
      notes: "",
      type: 'song' as const,
    }))


    // Close sheet optimistically
    setIsOpen(false)

    // Setlist sync PR 3: ONE batch of inserts at the end of that setlist,
    // through the ops endpoint (the server stamps the tenant, renumbers and
    // keeps the counts). Adding rows needs a connection (D2(a)).
    const ids = await appendAndWait(setlistId, newTracks.map(rowFromTrack), t)
    if (!ids) return
    lastAddedTrackIdsRef.current = ids

    // Build toast message
    let message: string
    if (pendingSongs.length === 1) {
      const songName = cleanFileName(pendingSongs[0].name, untitled)
      if (hasDuplicates) {
        message = t("hooks.songAlreadyInSetlist", { songName })
      } else {
        message = t("hooks.addedSongToSetlist", { songName, setlistName: setlist.name })
      }
    } else {
      message = t("hooks.addedSongsToSetlist", { count: pendingSongs.length, setlistName: setlist.name })
    }

    // Capture values for undo closure
    const undoSetlistId = setlistId
    const undoTrackIds = [...ids]

    toast(message, {
      action: {
        label: t("hooks.undo"),
        onClick: async () => {
          // One batch of removes, the inverse of the inserts above. Removing
          // needs a connection; offline it says why and removes nothing.
          const ok = await replayOps(
            undoSetlistId,
            undoTrackIds.map((rowId) => ({ kind: "remove" as const, rowId })),
          )
          if (!ok) toast.error(t("setlistGrid.offlineStructureReason"))
        },
      },
      duration: 5000,
    })

    // Clear pending songs
    setPendingSongs([])
  }, [pendingSongs, t, untitled])

  // Allows adding songs without passing through the pendingSongs state
  const addDirectlyToSetlist = useCallback(async (setlistId: string, files: { id: string, name: string, mimeType: string, metadata?: any }[]) => {
    if (files.length === 0) return

    const setlist = allSetlists.find(s => s.id === setlistId)
    if (!setlist) {
        toast.error(t("hooks.setlistNotFound"))
        return
    }

    const existingFileIds = new Set(setlist.fileIds ?? [])
    const hasDuplicates = files.some(f => existingFileIds.has(f.id))

    const now = Date.now()
    const newTracks: SetlistTrack[] = files.map((file, index) => ({
      id: `track-${now}-${file.id}-${index}`,
      title: cleanFileName(file.name, untitled),
      fileId: file.id,
      fileName: getFileNameWithExtension(file as any),
      key: file.metadata?.key || "",
      notes: "",
      type: 'song' as const,
    }))

    // Setlist sync PR 3: one batch of inserts at the end (see addToSetlist).
    const ids = await appendAndWait(setlistId, newTracks.map(rowFromTrack), t)
    if (!ids) return

    let message: string
    if (files.length === 1) {
      const songName = cleanFileName(files[0].name, untitled)
      if (hasDuplicates) {
        message = t("hooks.songAlreadyInSetlist", { songName })
      } else {
        message = t("hooks.addedSongToSetlist", { songName, setlistName: setlist.name })
      }
    } else {
      message = t("hooks.addedSongsToSetlist", { count: files.length, setlistName: setlist.name })
    }

    toast.success(message)
  }, [allSetlists, t, untitled])

  const createNewSetlist = useCallback(async (name: string) => {
    if (pendingSongs.length === 0) return

    const now = Date.now()
    const newTracks: SetlistTrack[] = pendingSongs.map((file, index) => ({
      id: `track-${now}-${file.id}-${index}`,
      title: cleanFileName(file.name, untitled),
      fileId: file.id,
      fileName: getFileNameWithExtension(file),
      key: file.metadata?.key || "",
      notes: "",
      type: 'song' as const,
    }))

    setIsOpen(false)

    try {
      await setlistService.createSetlist(name, newTracks)
      toast.success(t("hooks.createdSetlistWithSongs", { setlistName: name, count: pendingSongs.length }))
      setPendingSongs([])
    } catch (err: any) {
      toast.error(err.message || t("hooks.errorCreatingSetlist"))
    }
  }, [pendingSongs, setlistService, t, untitled])

  return {
    isOpen,
    setIsOpen,
    pendingSongs,
    editableSetlists,
    loading,
    searchQuery,
    setSearchQuery,
    openForSongs,
    addToSetlist,
    addDirectlyToSetlist,
    createNewSetlist,
    canAddToSetlist,
  }
}
