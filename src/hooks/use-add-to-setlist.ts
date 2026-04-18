"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Timestamp } from "firebase/firestore"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService } from "@/lib/setlist-firebase"
import type { DriveFile, Setlist, SetlistTrack } from "@/types/models"

/** Clean a filename into a display title (same logic as addSongsFromLibrary) */
function cleanFileName(name: string): string {
  return name
    .replace(/\.(pdf|musicxml|xml|mxl)$/i, '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .trim() || "Untitled"
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

  // Subscribe to all setlists (v4.0: single unified list)
  useEffect(() => {
    const unsub = setlistService.subscribeToAllSetlists((setlists) => {
      setAllSetlists(setlists)
      setLoaded(true)
    })
    return () => unsub()
  }, [setlistService])

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

    // Check for duplicates
    const existingFileIds = new Set(
      setlist.tracks
        .filter(t => t.fileId)
        .map(t => t.fileId)
    )
    const hasDuplicates = pendingSongs.some(f => existingFileIds.has(f.id))

    // Build tracks (same pattern as addSongsFromLibrary)
    const now = Date.now()
    const newTracks: SetlistTrack[] = pendingSongs.map((file, index) => ({
      id: `track-${now}-${file.id}-${index}`,
      title: cleanFileName(file.name),
      fileId: file.id,
      fileName: file.name,
      key: file.metadata?.key || "",
      notes: "",
      type: 'song' as const,
    }))

    const addedTrackIds = newTracks.map(t => t.id)
    lastAddedTrackIdsRef.current = addedTrackIds

    const updatedTracks = [...setlist.tracks, ...newTracks]

    // Close sheet optimistically
    setIsOpen(false)

    // Perform Firestore write. Pass the updatedAt we last saw as the
    // concurrency precondition so we don't clobber a concurrent edit.
    const expected = (setlist.updatedAt instanceof Timestamp) ? setlist.updatedAt : null
    await setlistService.updateSetlist(setlistId, {
      tracks: updatedTracks,
      trackCount: updatedTracks.length,
    }, expected)

    // Build toast message
    let message: string
    if (pendingSongs.length === 1) {
      const songName = cleanFileName(pendingSongs[0].name)
      if (hasDuplicates) {
        message = `"${songName}" is already in this setlist. Added again.`
      } else {
        message = `Added "${songName}" to ${setlist.name}`
      }
    } else {
      message = `Added ${pendingSongs.length} songs to "${setlist.name}"`
    }

    // Capture values for undo closure
    const undoSetlistId = setlistId
    const undoTrackIds = [...addedTrackIds]

    toast(message, {
      action: {
        label: "Undo",
        onClick: async () => {
          // Re-read current state and filter out added tracks (not snapshot restore)
          const currentTracks = await new Promise<SetlistTrack[]>((resolve) => {
            let unsub: (() => void) | null = null
            let resolved = false
            unsub = setlistService.subscribeToSetlist(undoSetlistId, (current) => {
              if (resolved) return
              resolved = true
              // Defer unsub to avoid "used before initialization" when callback fires synchronously
              if (unsub) unsub()
              else queueMicrotask(() => unsub?.())
              resolve(current?.tracks ?? [])
            })
          })

          const filteredTracks = currentTracks.filter(t => !undoTrackIds.includes(t.id))
          await setlistService.updateSetlist(undoSetlistId, {
            tracks: filteredTracks,
            trackCount: filteredTracks.length,
          })
        },
      },
      duration: 5000,
    })

    // Clear pending songs
    setPendingSongs([])
  }, [pendingSongs, setlistService])

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
    canAddToSetlist,
  }
}
