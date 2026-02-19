import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { createSetlistService } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { useOffline } from "@/hooks/use-offline"
import { useChatStore, ChatEditAction } from "@/lib/chat-store"
import { arrayMove } from "@dnd-kit/sortable"
import { SetlistTrack, DriveFile, Setlist } from "@/types/models"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import { useLibraryStore } from "@/lib/library-store"

interface UseSetlistLogicProps {
    initialSetlistId?: string
    initialTracks?: SetlistTrack[]
    initialName?: string
    suggestedName?: string
    initialIsPublic?: boolean
    initialOwnerId?: string
    initialEventDate?: string | Date | null
    initialRabbi?: string

    onSave?: (id: string) => void
}

export function useSetlistLogic(props: UseSetlistLogicProps) {
    const {
        initialSetlistId,
        initialTracks = [],
        initialName = "",
        suggestedName = "",
        initialIsPublic = false,
        initialOwnerId,
        initialRabbi = "",

        onSave
    } = props
    const { user, isLeader } = useAuth()

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
    const canEdit = (!initialOwnerId || initialOwnerId === user?.uid) || (isLeader && initialIsPublic)

    // Core state
    const [setlistId, setSetlistId] = useState<string | undefined>(initialSetlistId)
    const [name, setName] = useState(initialName || suggestedName || "")
    const [tracks, setTracks] = useState<SetlistTrack[]>(initialTracks)
    const [isPublic, setIsPublic] = useState(initialIsPublic)
    const [eventDate, setEventDate] = useState<Date | null>(props.initialEventDate ? new Date(props.initialEventDate) : null)
    const [rabbi, setRabbi] = useState(initialRabbi)
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
            if (newPast.length > 50) return newPast.slice(newPast.length - 50)
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
                        id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        title: edit.title || "New Song",
                        fileId: edit.fileId || undefined,
                        type: (edit.type as SetlistTrack['type']) || 'song',
                        performer: edit.performer,
                        estimatedMinutes: edit.estimatedMinutes,
                        key: '',
                        notes: ''
                    }

                    if (typeof edit.index === 'number' && edit.index >= 0 && edit.index <= newTracks.length) {
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

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    // Refs to always read latest values inside the debounced save
    const latestRef = useRef({ setlistId, name, tracks, isPublic, eventDate, rabbi })
    useEffect(() => {
        latestRef.current = { setlistId, name, tracks, isPublic, eventDate, rabbi }
    }, [setlistId, name, tracks, isPublic, eventDate, rabbi])

    // Stable save function that reads from refs (never stale)
    const performSave = useCallback(async () => {
        const { setlistId: id, name: n, tracks: t, isPublic: pub, eventDate: ed, rabbi: rab } = latestRef.current
        if (!n || n.length === 0 || !canEdit || !setlistService) return

        setSaving(true)
        try {
            const dataToSave = {
                name: n,
                tracks: t,
                trackCount: t.length,
                eventDate: ed ? ed.toISOString() : undefined,
                rabbi: rab,
            }

            if (id) {
                await setlistService.updateSetlist(id, pub, dataToSave)
            } else {
                const newId = await setlistService.createSetlist(n, t, pub, {
                    eventDate: ed ? ed.toISOString() : undefined,
                    rabbi: rab,
                })
                setSetlistId(newId)
                onSave?.(newId)
            }
            setLastSaved(new Date())
        } catch (e) {
            logger.error("Auto-save failed:", e)
            const msg = e instanceof Error ? e.message : String(e)
            const description = msg.includes("permission")
                ? "You may not have permission to edit this setlist."
                : msg.includes("not-found")
                ? "This setlist may have been deleted."
                : "Please check your internet connection and try again."
            toast.error("Failed to save changes", { description, duration: 5000 })
        }
        setSaving(false)
    }, [canEdit, setlistService, onSave])

    // Trigger auto-save on changes (stable deps — only performSave identity matters)
    useEffect(() => {
        if (!name || !canEdit) return

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(performSave, 1000)

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [name, tracks, isPublic, eventDate, rabbi, performSave, canEdit])

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
            return currentTracks.map(t => t.id === id ? { ...t, ...data } : t)
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
                id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                ...overrides
            }

            const newTracks = [...prev]
            newTracks.splice(index + 1, 0, newTrack)
            return newTracks
        })
    }

    const addSongsFromLibrary = (files: DriveFile[]) => {
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
            return [...prev, ...newTracks]
        })
    }

    /** Add a non-song service flow item (reading, prayer, transition, note, or header) */
    const addServiceItem = (type: SetlistTrack['type'], defaults?: Partial<SetlistTrack>) => {
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
            return [...prev, newTrack]
        })
    }

    const togglePublic = async () => {
        if (!setlistService || !setlistId) return
        if (!isPublic && !isLeader) {
            toast.error("Only Leaders can make setlists public.")
            return
        }

        const previousState = isPublic
        const previousId = setlistId

        // Optimistic Update
        setIsPublic(!previousState)
        setSaving(true)

        try {
            const newId = previousState
                ? await setlistService.makePrivate(setlistId, {} as unknown as Setlist)
                : await setlistService.makePublic(setlistId, {} as unknown as Setlist)

            setSetlistId(newId)
            toast.success(`Setlist is now ${!previousState ? 'public' : 'private'}!`)
        } catch (e) {
            // Revert on error
            logger.error("Toggle visibility failed:", e)
            setIsPublic(previousState)
            setSetlistId(previousId)
            toast.error("Failed to change visibility", {
                description: "Reverting changes..."
            })
        }
        setSaving(false)
    }

    return {
        canEdit,
        isLeader,
        setlistId,
        name,
        setName, // Exposed for UI inputs
        tracks,
        isPublic,
        setIsPublic, // Exposed for modal
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
        togglePublic,
        eventDate,
        setEventDate,
        rabbi,
        setRabbi,
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
