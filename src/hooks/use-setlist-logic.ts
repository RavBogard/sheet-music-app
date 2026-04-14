import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { createSetlistService } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { useOffline } from "@/hooks/use-offline"
import { useChatStore, ChatEditAction } from "@/lib/chat-store"
import { arrayMove } from "@dnd-kit/sortable"
import { SetlistTrack, DriveFile, Setlist, SetlistMusician } from "@/types/models"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import { useLibraryStore } from "@/lib/library-store"
import { notifySetlistUpdated } from "@/lib/notification-store"
import { apiFetch } from "@/lib/api-client"
import { saveLastUsedKey, loadLibraryMeta } from "@/lib/chord-cache"

interface UseSetlistLogicProps {
    initialSetlistId?: string
    initialTracks?: SetlistTrack[]
    initialName?: string
    suggestedName?: string
    initialOwnerId?: string
    initialEventDate?: string | Date | null
    initialRabbi?: string
    initialServiceNotes?: string
    initialMusicians?: SetlistMusician[]

    onSave?: (id: string) => void
}

export function useSetlistLogic(props: UseSetlistLogicProps) {
    const {
        initialSetlistId,
        initialTracks = [],
        initialName = "",
        suggestedName = "",
        initialOwnerId,
        initialRabbi = "",
        initialMusicians = [],
        initialServiceNotes = "",

        onSave
    } = props
    const { user, isBandLeader } = useAuth()

    // Create user-specific service
    // Create user-specific service — use uid/displayName (stable strings) not user object
    const uid = user?.uid || null
    const displayName = user?.displayName || null
    const setlistService = useMemo(() => {
        if (uid) {
            return createSetlistService(uid, displayName)
        }
        return null
    }, [uid, displayName])

    // Determine if user can edit
    const canEdit = (!initialOwnerId || initialOwnerId === user?.uid) || isBandLeader

    // Core state
    const [setlistId, setSetlistId] = useState<string | undefined>(initialSetlistId)
    const [name, setName] = useState(initialName || suggestedName || "")
    const [tracks, setTracks] = useState<SetlistTrack[]>(initialTracks)
    const [eventDate, setEventDate] = useState<Date | null>(props.initialEventDate ? new Date(props.initialEventDate) : null)
    const [rabbi, setRabbi] = useState(initialRabbi)
    const [serviceNotes, setServiceNotes] = useState(initialServiceNotes)
    const [musicians, setMusicians] = useState<SetlistMusician[]>(initialMusicians)
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)

    // Offline Sync Hook
    const {
        checkOfflineStatus,
        downloadSetlist: syncSetlist,
        downloading,
        offlineStatus
    } = useOffline()

    // Backfill missing keys from library metadata (for tracks added before key support)
    const { allFiles } = useLibraryStore()
    const hasBackfilled = useRef(false)
    useEffect(() => {
        if (hasBackfilled.current || allFiles.length === 0 || tracks.length === 0) return

        const tracksNeedingKeys = tracks.filter(t => t.fileId && !t.key)
        if (tracksNeedingKeys.length === 0) return

        const fileMap = new Map(allFiles.map(f => [f.id, f]))
        let updated = false
        const patched = tracks.map(t => {
            if (t.fileId && !t.key) {
                const file = fileMap.get(t.fileId)
                if (file?.metadata?.key) {
                    updated = true
                    return { ...t, key: file.metadata.key }
                }
            }
            return t
        })

        if (updated) {
            hasBackfilled.current = true
            setTracks(patched)
        }
    }, [allFiles, tracks])

    useEffect(() => {
        if (tracks.length > 0) {
            checkOfflineStatus(tracks)
        }
    }, [tracks, checkOfflineStatus])

    // Calculate sync progress
    const totalTracksWithFiles = tracks.filter(t => t.fileId).length
    const offlineCount = tracks.filter(t => t.fileId && offlineStatus[t.fileId]).length
    const isFullyOffline = totalTracksWithFiles > 0 && offlineCount === totalTracksWithFiles
    const isSyncing = Object.values(downloading).some(Boolean)

    // --- Undo/Redo Logic (must be before handleApplyEdits) ---
    const [past, setPast] = useState<SetlistTrack[][]>([])
    const [future, setFuture] = useState<SetlistTrack[][]>([])

    const canUndo = past.length > 0
    const canRedo = future.length > 0

    const addToHistory = useCallback((currentTracks: SetlistTrack[]) => {
        setPast(prev => {
            const newPast = [...prev, currentTracks]
            if (newPast.length > 20) return newPast.slice(newPast.length - 20)
            return newPast
        })
        setFuture([])
    }, [])

    const undo = useCallback(() => {
        if (!canUndo) return
        const previous = past[past.length - 1]
        const newPast = past.slice(0, past.length - 1)
        setPast(newPast)
        setFuture(prev => [tracks, ...prev])
        setTracks(previous)
    }, [canUndo, past, tracks])

    const redo = useCallback(() => {
        if (!canRedo) return
        const next = future[0]
        const newFuture = future.slice(1)
        setPast(prev => [...prev, tracks])
        setFuture(newFuture)
        setTracks(next)
    }, [canRedo, future, tracks])

    // Chat State (Global)
    const { setContextData, registerOnApplyEdits } = useChatStore()

    const handleApplyEdits = useCallback((edits: ChatEditAction[]) => {
        if (!canEdit) {
            toast.error("You must be in edit mode (or own this setlist) to apply changes.")
            return
        }

        // Process edits sequentially on a mutable copy
        setTracks(prev => {
            addToHistory(prev)
            const newTracks = [...prev]

            edits.forEach(edit => {
                if (edit.action === 'add') {
                    const newTrack: SetlistTrack = {
                        id: `track-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
                        title: edit.title || "New Song",
                        fileId: edit.fileId || undefined,
                        type: (edit.type as SetlistTrack['type']) || 'song',
                        performer: edit.performer,
                        estimatedMinutes: edit.estimatedMinutes,
                        key: edit.key || '',
                        bpm: edit.bpm,
                        notes: ''
                    }

                    if (edit.afterTitle) {
                        // Positional insertion: find the track with the matching title and insert after it
                        const afterIndex = newTracks.findIndex(t =>
                            t.title.toLowerCase().includes(edit.afterTitle!.toLowerCase())
                        )
                        if (afterIndex >= 0) {
                            newTracks.splice(afterIndex + 1, 0, newTrack)
                        } else {
                            // Title not found — append to end
                            newTracks.push(newTrack)
                        }
                    } else if (typeof edit.index === 'number' && edit.index >= 0 && edit.index <= newTracks.length) {
                        newTracks.splice(edit.index, 0, newTrack)
                    } else {
                        newTracks.push(newTrack)
                    }
                }
                else if (edit.action === 'remove') {
                    if (typeof edit.index === 'number' && newTracks[edit.index]) {
                        newTracks.splice(edit.index, 1)
                    }
                }
                else if (edit.action === 'reorder') {
                    if (
                        typeof edit.fromIndex === 'number' &&
                        typeof edit.toIndex === 'number' &&
                        newTracks[edit.fromIndex] &&
                        edit.toIndex >= 0 &&
                        edit.toIndex < newTracks.length + 1
                    ) {
                        const [moved] = newTracks.splice(edit.fromIndex, 1)
                        newTracks.splice(edit.toIndex, 0, moved)
                    }
                }
            })

            return newTracks
        })
    }, [canEdit, addToHistory])

    useEffect(() => {
        setContextData({
            currentSetlist: tracks,
            setlistName: name,
            setlistId,
            rabbi,
        })
    }, [tracks, name, setlistId, rabbi, setContextData])

    useEffect(() => {
        registerOnApplyEdits(handleApplyEdits)
        return () => registerOnApplyEdits(undefined)
    }, [handleApplyEdits, registerOnApplyEdits])

    // Track count for significant change detection (notifications)
    const prevTrackCountRef = useRef<number>(initialTracks.length)
    const lastNotificationRef = useRef<number>(0) // Timestamp of last notification sent

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    // Refs to always read latest values inside the debounced save
    const latestRef = useRef({ setlistId, name, tracks, eventDate, rabbi, serviceNotes, musicians })
    useEffect(() => {
        latestRef.current = { setlistId, name, tracks, eventDate, rabbi, serviceNotes, musicians }
    }, [setlistId, name, tracks, eventDate, rabbi, serviceNotes, musicians])

    // Stable save function that reads from refs (never stale)
    const performSave = useCallback(async () => {
        const { setlistId: id, name: n, tracks: t, eventDate: ed, rabbi: rab, serviceNotes: sn, musicians: mus } = latestRef.current
        if (!n || n.length === 0 || !canEdit || !setlistService) return

        setSaving(true)
        try {
            const serializeDate = (d?: Date | null) => {
                if (!d) return undefined
                // User requested Central time default
                // Format the local date as a YYYY-MM-DD string
                const year = d.getFullYear()
                const month = String(d.getMonth() + 1).padStart(2, '0')
                const day = String(d.getDate()).padStart(2, '0')

                // Store it as Noon in US Central Time (UTC-6 or UTC-5 depending on DST)
                // The easiest way is to construct a string that gets parsed in Central Time
                // However, since we want a stable ISO string to store in Firebase, we can
                // use Noon UTC as before which works universally for dates, OR we can
                // format the string in the browser's timezone but shifted to represent 12:00 PM Central time.
                // Best approach: Store it as 12:00 PM UTC-06:00 (which is 18:00 UTC) 
                // That way when people read it in Central time, it falls squarely on the same day.
                return `${year}-${month}-${day}T12:00:00.000-06:00`
            }

            const dataToSave = {
                name: n,
                tracks: t,
                trackCount: t.length,
                eventDate: serializeDate(ed),
                rabbi: rab,
                serviceNotes: sn?.trim() || undefined,
                musicians: mus.length > 0 ? mus : undefined,
            }

            if (id) {
                await setlistService.updateSetlist(id, dataToSave)
            } else {
                const newId = await setlistService.createSetlist(n, t, {
                    eventDate: serializeDate(ed),
                    rabbi: rab,
                    serviceNotes: sn?.trim() || undefined,
                    musicians: mus.length > 0 ? mus : undefined,
                })
                setSetlistId(newId)
                onSave?.(newId)
            }
            setLastSaved(new Date())

            // Significant change detection: notify musicians when tracks are added/removed
            const prevCount = prevTrackCountRef.current
            const newCount = t.length
            prevTrackCountRef.current = newCount

            if (prevCount !== newCount && id) {
                const now = Date.now()
                const THROTTLE_MS = 5 * 60 * 1000 // 5 minutes
                if (now - lastNotificationRef.current > THROTTLE_MS) {
                    // Get musician UIDs excluding the current editor
                    const musicianUids = (mus || [])
                        .filter(m => m.uid && m.uid !== uid)
                        .map(m => m.uid!)

                    if (musicianUids.length > 0) {
                        lastNotificationRef.current = now
                        notifySetlistUpdated(n, id, newCount, uid || undefined).catch(() => {
                            // Fire-and-forget -- don't break save flow
                        })
                    }
                }
            }
        } catch (e) {
            logger.error("Auto-save failed:", e)
            const msg = e instanceof Error ? e.message : String(e)
            const isPermissionError = msg.includes("permission") || msg.includes("PERMISSION_DENIED")
            const description = isPermissionError
                ? "You may not have permission to edit this setlist."
                : msg.includes("not-found")
                    ? "This setlist may have been deleted."
                    : "An unexpected error occurred. Please try again."
            toast.error("Failed to save changes", { description, duration: 5000 })
        }
        setSaving(false)
    }, [canEdit, setlistService, onSave, uid])

    // Track whether there are unsaved changes pending
    const hasPendingSave = useRef(false)

    // Keep a ref to performSave so the auto-save effect doesn't depend on its identity
    const performSaveRef = useRef(performSave)
    useEffect(() => { performSaveRef.current = performSave }, [performSave])

    // Trigger auto-save on changes — reads performSave from ref to avoid circular dep
    useEffect(() => {
        if (!name || !canEdit) return

        hasPendingSave.current = true

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(() => {
            hasPendingSave.current = false
            performSaveRef.current()
        }, 1000)

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [name, tracks, eventDate, rabbi, serviceNotes, musicians, canEdit])

    // Flush pending saves when user navigates away or switches apps

    useEffect(() => {
        const flushSave = () => {
            if (hasPendingSave.current && saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
                saveTimeoutRef.current = null
                hasPendingSave.current = false
                performSaveRef.current()
            }
        }

        // Flush on tab/app switch (iPad home button, app switcher)
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') flushSave()
        }

        // Flush on page unload (navigation, refresh)
        const handleBeforeUnload = () => flushSave()

        document.addEventListener('visibilitychange', handleVisibility)
        window.addEventListener('beforeunload', handleBeforeUnload)
        window.addEventListener('pagehide', handleBeforeUnload)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility)
            window.removeEventListener('beforeunload', handleBeforeUnload)
            window.removeEventListener('pagehide', handleBeforeUnload)
        }
    }, [])

    // --- Background key detection ---
    const pendingKeyDetections = useRef<Set<string>>(new Set())

    const detectKeyForFile = useCallback((fileId: string) => {
        if (pendingKeyDetections.current.has(fileId)) return
        pendingKeyDetections.current.add(fileId)

        apiFetch('/api/library/detect-key', {
            method: 'POST',
            body: JSON.stringify({ fileId }),
        })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.key) {
                    setTracks(prev => prev.map(t =>
                        t.fileId === fileId && !t.key ? { ...t, key: data.key } : t
                    ))
                }
            })
            .catch(() => { /* best-effort, silently ignore */ })
            .finally(() => pendingKeyDetections.current.delete(fileId))
    }, [])

    // --- Actions ---

    const moveTrack = (activeId: string, overId: string) => {
        if (!canEdit) return

        setTracks((currentTracks) => {
            addToHistory(currentTracks)
            const oldIndex = currentTracks.findIndex(i => i.id === activeId)
            const newIndex = currentTracks.findIndex(i => i.id === overId)
            return arrayMove(currentTracks, oldIndex, newIndex)
        })
    }

    const updateTrack = (id: string, data: Partial<SetlistTrack>) => {
        if (!canEdit) return
        setTracks(currentTracks => {
            addToHistory(currentTracks)
            const updated = currentTracks.map(t => t.id === id ? { ...t, ...data } : t)
            // Persist sticky key when key is changed on a chart-bearing track
            if (data.key !== undefined) {
                const track = currentTracks.find(t => t.id === id)
                if (track?.fileId) {
                    saveLastUsedKey(track.fileId, data.key, data.transposition ?? track.transposition ?? 0)
                }
            }
            return updated
        })
    }

    const deleteTrack = (id: string) => {
        if (!canEdit) return

        setTracks(prev => {
            addToHistory(prev)
            return prev.filter(t => t.id !== id)
        })
        toast("Track deleted", {
            action: { label: "Undo", onClick: () => undo() },
            duration: 5000,
        })
    }

    const matchFile = (trackId: string, fileId: string, fileName?: string) => {
        setTracks(prev => {
            addToHistory(prev)
            return prev.map(t =>
                t.id === trackId
                    ? { ...t, fileId, fileName: fileName || t.fileName }
                    : t
            )
        })
        // Auto-detect key for the matched file
        detectKeyForFile(fileId)
    }

    const duplicateTrack = (originalTrackId: string, overrides: Partial<SetlistTrack> = {}) => {
        if (!canEdit) return

        setTracks(prev => {
            addToHistory(prev)
            const index = prev.findIndex(t => t.id === originalTrackId)
            if (index === -1) return prev

            const original = prev[index]
            const newTrack: SetlistTrack = {
                ...original,
                id: `track-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
                ...overrides
            }

            const newTracks = [...prev]
            newTracks.splice(index + 1, 0, newTrack)
            return newTracks
        })
    }

    const addSongsFromLibrary = (files: DriveFile[], insertAfterIndex?: number) => {
        if (!canEdit) return
        const newTracks: SetlistTrack[] = files.map((file, index) => {
            const cleanName = file.name
                .replace(/\.(pdf|musicxml|xml|mxl)$/i, '')
                .replace(/_/g, ' ')
                .replace(/-/g, ' ')
                .trim() || "Untitled"

            return {
                id: `track-${Date.now()}-${file.id}-${index}`,
                title: cleanName,
                fileId: file.id,
                fileName: file.name,
                key: file.metadata?.key || "",
                notes: "",
                type: 'song'
            }
        })

        setTracks(prev => {
            addToHistory(prev)
            if (insertAfterIndex != null && insertAfterIndex >= 0 && insertAfterIndex < prev.length) {
                const result = [...prev]
                result.splice(insertAfterIndex + 1, 0, ...newTracks)
                return result
            }
            return [...prev, ...newTracks]
        })

        // Auto-detect keys for files that don't already have one,
        // and apply sticky keys from library_index
        for (const file of files) {
            if (!file.id) continue
            if (!file.metadata?.key) {
                detectKeyForFile(file.id)
            }
            // Check for a sticky key (last-used key from a previous setlist)
            loadLibraryMeta(file.id).then(meta => {
                if (meta?.lastUsedKey) {
                    setTracks(prev => prev.map(t =>
                        t.fileId === file.id && (!t.key || t.key === '')
                            ? { ...t, key: meta.lastUsedKey!, transposition: meta.lastUsedTransposition ?? 0 }
                            : t
                    ))
                }
            }).catch(() => {})
        }
    }

    /** Add a non-song service flow item (reading, prayer, transition, note, or header) */
    const addServiceItem = (type: SetlistTrack['type'], defaults?: Partial<SetlistTrack>, insertAfterIndex?: number) => {
        if (!canEdit) return
        const id = `track-${Date.now()}-${type}`
        const defaultsByType: Record<string, Partial<SetlistTrack>> = {
            header: { title: 'SECTION' },
            reading: { title: 'Reading', performer: 'Rabbi', estimatedMinutes: 5 },
            prayer: { title: 'Prayer', performer: 'Congregation', estimatedMinutes: 3 },
            transition: { title: 'Transition', estimatedMinutes: 1 },
            note: { title: '' },
        }
        const typeDefaults = defaultsByType[type || 'note'] || {}
        const newTrack: SetlistTrack = {
            id,
            title: '',
            type: type || 'note',
            ...typeDefaults,
            ...defaults,
        }
        setTracks(prev => {
            addToHistory(prev)
            if (insertAfterIndex != null && insertAfterIndex >= 0 && insertAfterIndex < prev.length) {
                const result = [...prev]
                result.splice(insertAfterIndex + 1, 0, newTrack)
                return result
            }
            return [...prev, newTrack]
        })
    }

    return {
        canEdit,
        isBandLeader,
        setlistId,
        name,
        setName, // Exposed for UI inputs
        tracks,
        saving,
        lastSaved,
        isSyncing,
        isFullyOffline,
        syncSetlist,
        moveTrack,
        updateTrack,
        deleteTrack,
        matchFile,
        addSongsFromLibrary,
        addServiceItem,
        duplicateTrack,
        detectKeyForFile,
        eventDate,
        setEventDate,
        rabbi,
        setRabbi,
        serviceNotes,
        setServiceNotes,
        musicians,
        setMusicians,
        undo,
        redo,
        canUndo,
        canRedo,
        addToHistory,
        setTracks,
        /** Replace entire track list (used by history restore) */
        restoreTracks: (newTracks: SetlistTrack[]) => setTracks(newTracks),
    }
}
