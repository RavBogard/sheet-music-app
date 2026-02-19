"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core"
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { SetlistTrack, TrackType, SetlistMusician } from "@/types/models"
import { useSetlistLogic } from "@/hooks/use-setlist-logic"
import { useSetlistPresence, useLiveState } from "@/hooks/use-setlist-presence"
import { enableLiveMode, updateLiveTrack } from "@/lib/setlist-live"
import { useAuth } from "@/lib/auth-context"
import { useChatStore } from "@/lib/chat-store"
import { SERVICE_FLOW_TYPES } from "@/lib/validations"

// V2 Components
import { SetlistTopBar } from "./SetlistTopBar"
import { OverflowMenu } from "./OverflowMenu"
import { SongRow } from "./SongRow"
import { DividerRow } from "./DividerRow"
import { FlowRow } from "./FlowRow"
import { TrackSheet } from "./TrackSheet"
import { SwipeToDelete } from "./SwipeToDelete"
import { BatchActionBar } from "./BatchActionBar"
import { AddBar } from "./AddBar"
import { MusicianPicker } from "./MusicianPicker"

// Shared components (kept from v1)
import { PrintModal } from "../PrintModal"
import { PublishDialog } from "../PublishDialog"
import { DeleteSetlistDialog, DuplicateSetlistDialog } from "../SetlistDialogs"
import { SetlistHistoryPanel } from "../SetlistHistoryPanel"
import { NamePrompt } from "../modals/NamePrompt"
import { AddSongsModal } from "../modals/AddSongsModal"
import { MatchFileModal } from "../modals/MatchFileModal"
import { createSetlistService } from "@/lib/setlist-firebase"
import { toast } from "sonner"

interface SetlistEditorV2Props {
    setlistId?: string
    initialTracks?: SetlistTrack[]
    initialName?: string
    suggestedName?: string
    initialIsPublic?: boolean
    initialOwnerId?: string
    initialEventDate?: string | Date | null
    initialRabbi?: string
    initialMusicians?: SetlistMusician[]
    onBack: () => void
    onSave?: (id: string) => void
    onPlayTrack?: (fileId: string, fileName: string) => void
}

export function SetlistEditorV2({
    setlistId: initialSetlistId,
    initialTracks = [],
    initialName = "",
    suggestedName = "",
    initialIsPublic = false,
    initialOwnerId,
    initialEventDate,
    initialRabbi,
    initialMusicians,
    onBack,
    onSave,
    onPlayTrack,
}: SetlistEditorV2Props) {
    const { user } = useAuth()
    const router = useRouter()

    // Core logic hook (unchanged from v1)
    const {
        canEdit,
        isLeader,
        setlistId,
        name,
        setName,
        tracks,
        isPublic,
        setIsPublic,
        eventDate,
        setEventDate,
        rabbi,
        setRabbi,
        musicians,
        setMusicians,
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
        togglePublic,
        undo,
        redo,
        canUndo,
        canRedo,
        addToHistory,
        setTracks,
        restoreTracks,
    } = useSetlistLogic({
        initialSetlistId,
        initialTracks,
        initialName,
        suggestedName,
        initialIsPublic,
        initialOwnerId,
        initialEventDate,
        initialRabbi,
        initialMusicians,
        onSave,
    })

    // Presence & Live
    const presence = useSetlistPresence(setlistId || null, "editing")
    const liveState = useLiveState(setlistId || null)

    const handleToggleLive = useCallback(() => {
        if (!setlistId) return
        enableLiveMode(setlistId, !liveState?.enabled)
    }, [setlistId, liveState])

    // Chat - auto-open only on new empty setlists
    useEffect(() => {
        if (!initialSetlistId && tracks.length === 0) {
            if (window.matchMedia("(min-width: 768px)").matches) {
                useChatStore.getState().open()
            }
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

    // Play a track (with live broadcast)
    const handlePlayTrack = useCallback(
        (fileId: string, fileName: string) => {
            if (liveState?.enabled && setlistId && user) {
                const trackIdx = tracks.findIndex((t) => t.fileId === fileId)
                if (trackIdx >= 0) {
                    updateLiveTrack(setlistId, trackIdx, user.uid, user.displayName || "Leader")
                }
            }
            onPlayTrack?.(fileId, fileName)
        },
        [liveState, setlistId, user, tracks, onPlayTrack]
    )

    // ── UI State ──

    const [showNamePrompt, setShowNamePrompt] = useState(!initialSetlistId && !initialName)
    const [showAddSongs, setShowAddSongs] = useState(false)
    const [matchingTrackId, setMatchingTrackId] = useState<string | null>(null)
    const [editingTrack, setEditingTrack] = useState<SetlistTrack | null>(null)
    const [showPrintModal, setShowPrintModal] = useState(false)
    const [showPublishDialog, setShowPublishDialog] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false)

    // Batch select mode
    const [selectMode, setSelectMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Service for delete/duplicate operations
    const editorService = useMemo(
        () => user ? createSetlistService(user.uid, user.displayName) : null,
        [user]
    )

    const handleDeleteSetlist = useCallback(async () => {
        if (!editorService || !setlistId) return
        try {
            await editorService.deleteSetlist(setlistId, isPublic)
            toast.success("Setlist deleted")
            onBack()
        } catch {
            toast.error("Failed to delete setlist")
        }
        setShowDeleteConfirm(false)
    }, [editorService, setlistId, isPublic, onBack])

    const handleDuplicateSetlist = useCallback(async () => {
        if (!editorService || !setlistId) return
        try {
            const currentSetlist = { id: setlistId, name, tracks, isPublic, rabbi } as Parameters<typeof editorService.copyToPersonal>[1]
            const newId = await editorService.copyToPersonal(setlistId, currentSetlist)
            toast.success("Setlist duplicated!")
            router.push(`/setlists/${newId}`)
        } catch {
            toast.error("Failed to duplicate setlist")
        }
        setShowDuplicateConfirm(false)
    }, [editorService, setlistId, name, tracks, isPublic, rabbi, router])

    const handleCloneNextWeek = useCallback(async () => {
        if (!editorService || !setlistId) return
        const toastId = toast.loading("Creating next week\u2019s setlist\u2026")
        try {
            const currentSetlist = { id: setlistId, name, tracks, isPublic, rabbi, musicians, eventDate, date: eventDate } as Parameters<typeof editorService.cloneForNextWeek>[0]
            const newId = await editorService.cloneForNextWeek(currentSetlist)
            toast.success("Cloned for next week!", { id: toastId })
            router.push(`/setlists/${newId}`)
        } catch {
            toast.error("Failed to clone setlist", { id: toastId })
        }
    }, [editorService, setlistId, name, tracks, isPublic, rabbi, musicians, eventDate, router])

    const handleSaveAsTemplate = useCallback(async () => {
        if (!editorService || !setlistId) return
        const toastId = toast.loading("Saving template\u2026")
        try {
            const currentSetlist = { id: setlistId, name, tracks, trackCount: tracks.length } as Parameters<typeof editorService.saveAsTemplate>[0]
            await editorService.saveAsTemplate(currentSetlist)
            toast.success(`Template "${name}" saved!`, { id: toastId })
        } catch {
            toast.error("Failed to save template", { id: toastId })
        }
    }, [editorService, setlistId, name, tracks])

    // Debounce empty state to prevent flash during AI batch edits
    const [showEmpty, setShowEmpty] = useState(tracks.length === 0)
    const emptyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    useEffect(() => {
        if (tracks.length === 0) {
            emptyTimerRef.current = setTimeout(() => setShowEmpty(true), 300)
        } else {
            clearTimeout(emptyTimerRef.current)
            setShowEmpty(false)
        }
        return () => clearTimeout(emptyTimerRef.current)
    }, [tracks.length])

    // ── Computed ──

    const estimatedMinutes = useMemo(() => {
        return tracks.reduce((sum, t) => {
            if (t.estimatedMinutes) return sum + t.estimatedMinutes
            if (t.type === "header" || t.type === "note") return sum
            if (t.type === "reading") return sum + 5
            if (t.type === "prayer") return sum + 3
            if (t.type === "transition") return sum + 1
            return sum + 3 // default song duration
        }, 0)
    }, [tracks])

    const songCount = useMemo(() => tracks.filter((t) => !t.type || t.type === "song").length, [tracks])

    // ── DnD ──

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            moveTrack(active.id as string, over.id as string)
        }
    }

    // ── Batch select operations ──

    const toggleSelectId = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const handleBatchDelete = useCallback(() => {
        if (selectedIds.size === 0) return
        addToHistory(tracks)
        setTracks(prev => prev.filter(t => !selectedIds.has(t.id)))
        toast(`${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''} deleted`, {
            action: { label: "Undo", onClick: () => undo() },
            duration: 5000,
        })
        setSelectedIds(new Set())
    }, [selectedIds, tracks, addToHistory, setTracks, undo])

    const handleBatchDuplicate = useCallback(() => {
        if (selectedIds.size === 0) return
        addToHistory(tracks)
        const newTracks = [...tracks]
        // Insert duplicates after the last selected item
        const selectedArr = tracks.filter(t => selectedIds.has(t.id))
        const lastSelectedIdx = tracks.findIndex(t => t.id === selectedArr[selectedArr.length - 1]?.id)
        const duplicates = selectedArr.map(t => ({
            ...t,
            id: crypto.randomUUID(),
        }))
        newTracks.splice(lastSelectedIdx + 1, 0, ...duplicates)
        setTracks(newTracks)
        toast(`${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''} duplicated`)
        setSelectedIds(new Set())
    }, [selectedIds, tracks, addToHistory, setTracks])

    const exitSelectMode = useCallback(() => {
        setSelectMode(false)
        setSelectedIds(new Set())
    }, [])

    // ── Track rendering ──

    const renderTrack = (track: SetlistTrack) => {
        // In select mode, suppress tap/play behaviors
        const tapHandler = selectMode ? () => {} : setEditingTrack
        const playHandler = selectMode ? undefined : handlePlayTrack

        const row = (() => {
            if (track.type === "header") {
                return <DividerRow key={track.id} track={track} canEdit={canEdit} onTap={tapHandler} />
            }
            if (track.type && (SERVICE_FLOW_TYPES as readonly string[]).includes(track.type)) {
                return <FlowRow key={track.id} track={track} canEdit={canEdit} onTap={tapHandler} />
            }
            return (
                <SongRow
                    key={track.id}
                    track={track}
                    canEdit={canEdit}
                    onTap={tapHandler}
                    onPlayFile={playHandler}
                />
            )
        })()

        if (selectMode) {
            const isSelected = selectedIds.has(track.id)
            return (
                <div
                    key={track.id}
                    className={`flex items-center gap-2 cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 rounded-lg' : ''}`}
                    onClick={() => toggleSelectId(track.id)}
                >
                    <div className={`ml-2 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                        {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">{row}</div>
                </div>
            )
        }

        return (
            <SwipeToDelete key={track.id} enabled={canEdit} onDelete={() => deleteTrack(track.id)}>
                {row}
            </SwipeToDelete>
        )
    }

    return (
        <div className="h-[100dvh] flex flex-col bg-background text-foreground">
            {/* Name prompt for new setlists */}
            <NamePrompt
                isOpen={showNamePrompt && canEdit}
                onClose={() => setShowNamePrompt(false)}
                initialName={name}
                initialIsPublic={isPublic}
                initialDate={eventDate ? new Date(eventDate) : null}
                isLeader={isLeader}
                onConfirm={(newName, newIsPublic, newDate) => {
                    setName(newName)
                    setIsPublic(newIsPublic)
                    setEventDate(newDate)
                    setShowNamePrompt(false)
                }}
            />

            {/* Top bar */}
            <SetlistTopBar
                name={name}
                onNameChange={setName}
                onBack={onBack}
                canEdit={canEdit}
                saving={saving}
                lastSaved={lastSaved}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                overflowTrigger={
                    <OverflowMenu
                        onPerform={setlistId ? () => router.push(`/perform/setlist/${setlistId}`) : undefined}
                        onPrint={() => setShowPrintModal(true)}
                        onPublish={setlistId ? () => setShowPublishDialog(true) : undefined}
                        onTogglePublic={togglePublic}
                        onSetRabbi={canEdit ? setRabbi : undefined}
                        onHistory={setlistId ? () => setShowHistory(!showHistory) : undefined}
                        onSync={async () => {
                            const toastId = toast.loading('Downloading charts for offline…')
                            try {
                                await syncSetlist(tracks)
                                toast.success('All charts cached — ready for offline', { id: toastId })
                            } catch {
                                toast.error('Some charts failed to download', { id: toastId })
                            }
                        }}
                        onOpenAI={() => useChatStore.getState().toggle()}
                        onToggleLive={isLeader ? handleToggleLive : undefined}
                        onDelete={canEdit && setlistId ? () => setShowDeleteConfirm(true) : undefined}
                        onDuplicate={setlistId ? () => setShowDuplicateConfirm(true) : undefined}
                        onCloneNextWeek={setlistId ? handleCloneNextWeek : undefined}
                        onSaveAsTemplate={setlistId ? handleSaveAsTemplate : undefined}
                        onSelectMode={canEdit && tracks.length > 0 ? () => setSelectMode(true) : undefined}
                        isPublic={isPublic}
                        isLeader={isLeader}
                        canEdit={canEdit}
                        setlistId={setlistId}
                        rabbi={rabbi}
                        liveEnabled={liveState?.enabled}
                        isSyncing={isSyncing}
                        isFullyOffline={isFullyOffline}
                        estimatedMinutes={estimatedMinutes}
                        songCount={songCount}
                    />
                }
            />

            {/* Presence line */}
            {presence.length > 0 && (
                <div className="px-4 py-1 text-xs text-muted-foreground/60 border-b border-border/50">
                    {presence.map((p) => p.displayName).join(", ")} {presence.length === 1 ? "is" : "are"} viewing
                </div>
            )}

            {/* History panel */}
            {showHistory && setlistId && (
                <div className="px-4 pt-2">
                    <SetlistHistoryPanel
                        setlistId={setlistId}
                        onRestore={(newTracks) => {
                            restoreTracks(newTracks)
                            setShowHistory(false)
                        }}
                        onClose={() => setShowHistory(false)}
                    />
                </div>
            )}

            {/* Musician assignment */}
            {canEdit && (
                <MusicianPicker
                    musicians={musicians}
                    onChange={setMusicians}
                    canEdit={canEdit}
                />
            )}

            {/* Track list */}
            <div className="flex-1 overflow-y-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={tracks} strategy={verticalListSortingStrategy}>
                        <div className="max-w-3xl mx-auto px-2 sm:px-4 py-4 space-y-1">
                            {showEmpty && tracks.length === 0 && (
                                <div className="text-center py-16 text-muted-foreground">
                                    <p className="text-lg font-medium mb-1">Empty setlist</p>
                                    <p className="text-sm">Add songs from the library or use the AI assistant to build a service.</p>
                                </div>
                            )}
                            {tracks.map(renderTrack)}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            {/* Add bar (sticky bottom) - only for editors, hidden in select mode */}
            {canEdit && !selectMode && (
                <AddBar
                    onAddSongs={() => setShowAddSongs(true)}
                    onAddItem={(type: TrackType) => addServiceItem(type)}
                />
            )}

            {/* Batch action bar (select mode) */}
            {selectMode && (
                <BatchActionBar
                    selectedCount={selectedIds.size}
                    totalCount={tracks.length}
                    onDelete={handleBatchDelete}
                    onDuplicate={handleBatchDuplicate}
                    onSelectAll={() => setSelectedIds(new Set(tracks.map(t => t.id)))}
                    onClearSelection={() => setSelectedIds(new Set())}
                    onExitSelectMode={exitSelectMode}
                />
            )}

            {/* Track detail sheet/modal */}
            <TrackSheet
                isOpen={!!editingTrack}
                onClose={() => setEditingTrack(null)}
                track={editingTrack}
                onUpdate={updateTrack}
                onDelete={deleteTrack}
                onMatchFile={(tid) => {
                    setEditingTrack(null)
                    setMatchingTrackId(tid)
                }}
                onPlayFile={handlePlayTrack}
            />

            {/* Shared modals */}
            <AddSongsModal
                isOpen={showAddSongs && canEdit}
                onClose={() => setShowAddSongs(false)}
                onAdd={(files) => {
                    addSongsFromLibrary(files)
                    setShowAddSongs(false)
                }}
            />

            <MatchFileModal
                isOpen={!!matchingTrackId && canEdit}
                onClose={() => setMatchingTrackId(null)}
                onMatch={(fileId) => matchingTrackId && matchFile(matchingTrackId, fileId)}
            />

            {showPrintModal && (
                <PrintModal
                    setlistName={name}
                    tracks={tracks}
                    setlistId={setlistId || undefined}
                    onClose={() => setShowPrintModal(false)}
                />
            )}

            {setlistId && (
                <PublishDialog
                    isOpen={showPublishDialog}
                    onClose={() => setShowPublishDialog(false)}
                    setlistId={setlistId}
                    setlistName={name}
                    songCount={songCount}
                    musicians={musicians}
                    onPublished={() => setIsPublic(true)}
                />
            )}

            <DeleteSetlistDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                setlistName={name}
                onConfirm={handleDeleteSetlist}
            />

            <DuplicateSetlistDialog
                open={showDuplicateConfirm}
                onOpenChange={setShowDuplicateConfirm}
                setlistName={name}
                onConfirm={handleDuplicateSetlist}
            />
        </div>
    )
}
