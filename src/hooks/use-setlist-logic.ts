import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { createSetlistService } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { useOfflineSync } from "@/hooks/use-offline-sync"
import { useChatStore } from "@/lib/chat-store"
import { arrayMove } from "@dnd-kit/sortable"
import { SetlistTrack, DriveFile, Setlist } from "@/types/models"
import { toast } from "sonner"

interface EditAction {
    action: 'add' | 'remove' | 'reorder'
    index?: number
    fromIndex?: number
    toIndex?: number
    title?: string
    fileId?: string
}

interface UseSetlistLogicProps {
    initialSetlistId?: string
    initialTracks?: SetlistTrack[]
    initialName?: string
    suggestedName?: string
    initialIsPublic?: boolean
    initialOwnerId?: string
    initialEventDate?: string | Date | null

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

        onSave
    } = props
    const { user, isLeader } = useAuth()

    // Create user-specific service
    const setlistService = useMemo(() => {
        if (user) {
            return createSetlistService(user.uid, user.displayName)
        }
        return null
    }, [user])

    // Determine if user can edit
    const canEdit = (!initialOwnerId || initialOwnerId === user?.uid) || (isLeader && initialIsPublic)

    // Core state
    const [setlistId, setSetlistId] = useState<string | undefined>(initialSetlistId)
    const [name, setName] = useState(initialName || suggestedName || "")
    const [tracks, setTracks] = useState<SetlistTrack[]>(initialTracks)
    const [isPublic, setIsPublic] = useState(initialIsPublic)
    const [eventDate, setEventDate] = useState<Date | null>(props.initialEventDate ? new Date(props.initialEventDate) : null)
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)

    // Offline Sync Hook
    const {
        checkOfflineStatus,
        syncSetlist,
        downloading,
        offlineStatus
    } = useOfflineSync()

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

    // Chat State (Global)
    const { open, close, setContextData, registerOnApplyEdits } = useChatStore()

    const handleApplyEdits = useCallback((edits: EditAction[]) => {
        if (!canEdit) {
            toast.error("You must be in edit mode (or own this setlist) to apply changes.")
            return
        }

        // Create a copy of current tracks to mutate
        let newTracks = [...tracks]

        edits.forEach(edit => {
            if (edit.action === 'add') {
                const newTrack: SetlistTrack = {
                    id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    title: edit.title || "New Song",
                    fileId: edit.fileId || undefined,
                    key: '',
                    notes: ''
                }

                if (typeof edit.index === 'number' && edit.index >= 0 && edit.index <= newTracks.length) {
                    newTracks.splice(edit.index, 0, newTrack)
                } else {
                    newTracks.push(newTrack)
                }
            }
            // Use title matching or index for removal if ID isn't known
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

        setTracks(newTracks)
    }, [canEdit, tracks])

    // Edit Mode State
    const [isEditMode, setIsEditMode] = useState(false)

    // Sync Chat Context & Auto-Open
    useEffect(() => {
        if (canEdit && isEditMode && tracks.length >= 0) {
            // Auto-open on mount if editing AND on desktop (md breakpoint)
            if (window.matchMedia('(min-width: 768px)').matches) {
                open()
            }
        }
        // Don't auto-close when leaving edit mode, let user decide
    }, [canEdit, isEditMode, open])

    useEffect(() => {
        setContextData({
            currentSetlist: tracks
        })
    }, [tracks, setContextData])

    useEffect(() => {
        registerOnApplyEdits(handleApplyEdits)
        return () => registerOnApplyEdits(undefined)
    }, [handleApplyEdits, registerOnApplyEdits])

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Auto-save with debounce
    const triggerAutoSave = useCallback(() => {
        if (!canEdit || !setlistService) return

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(async () => {
            if (!name || name.length === 0) return

            setSaving(true)
            try {
                const dataToSave = {
                    name,
                    tracks,
                    trackCount: tracks.length,
                    eventDate: eventDate ? eventDate.toISOString() : null
                }

                if (setlistId) {
                    await setlistService.updateSetlist(setlistId, isPublic, dataToSave)
                } else {
                    const newId = await setlistService.createSetlist(name, tracks, isPublic, {
                        eventDate: eventDate ? eventDate.toISOString() : undefined
                    })
                    setSetlistId(newId)
                    onSave?.(newId)
                }
                setLastSaved(new Date())
            } catch (e) {
                console.error("Auto-save failed:", e)
                toast.error("Failed to save changes", {
                    description: "Please check your internet connection.",
                    duration: 5000
                })
            }
            setSaving(false)
        }, 1000)
    }, [setlistId, name, tracks, isPublic, eventDate, onSave, setlistService, canEdit])

    // Trigger auto-save on changes
    useEffect(() => {
        if (name && canEdit) {
            triggerAutoSave()
        }
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [name, tracks, isPublic, triggerAutoSave, canEdit])

    const moveTrack = (activeId: string, overId: string) => {
        if (!canEdit) return
        setTracks((items) => {
            const oldIndex = items.findIndex(i => i.id === activeId)
            const newIndex = items.findIndex(i => i.id === overId)
            return arrayMove(items, oldIndex, newIndex)
        })
    }

    const updateTrack = (id: string, data: Partial<SetlistTrack>) => {
        if (!canEdit) return
        setTracks(tracks.map(t => t.id === id ? { ...t, ...data } : t))
    }

    const deleteTrack = (id: string) => {
        if (!canEdit) return
        const trackIndex = tracks.findIndex(t => t.id === id)
        const trackToDelete = tracks[trackIndex]

        if (!trackToDelete) return

        setTracks(prev => prev.filter(t => t.id !== id))

        toast("Track deleted", {
            description: trackToDelete.title,
            action: {
                label: "Undo",
                onClick: () => {
                    setTracks(current => {
                        const newTracks = [...current]
                        const safeIndex = Math.min(trackIndex, newTracks.length)
                        newTracks.splice(safeIndex, 0, trackToDelete)
                        return newTracks
                    })
                }
            }
        })
    }

    const matchFile = (trackId: string, fileId: string, fileName?: string) => {
        setTracks(prev => prev.map(t =>
            t.id === trackId
                ? { ...t, fileId, fileName: fileName || t.fileName }
                : t
        ))
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
                key: "",
                notes: "",
                type: 'song'
            }
        })

        setTracks(prev => [...prev, ...newTracks])
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
            console.error("Toggle visibility failed:", e)
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
        isEditMode,
        toggleEditMode: () => setIsEditMode(prev => !prev),
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
        togglePublic,
        eventDate,
        setEventDate
    }
}
