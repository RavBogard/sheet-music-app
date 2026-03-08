"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSetlistStore } from "@/lib/setlist-store"
import { useMusicStore, FileType } from "@/lib/store"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
} from "@dnd-kit/core"
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { SetlistTrack, TrackType, SetlistMusician, DriveFile } from "@/types/models"
import { useSetlistLogic } from "@/hooks/use-setlist-logic"
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
import { SearchOverlay } from "./SearchOverlay"

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
    initialServiceNotes?: string
    initialMusicians?: SetlistMusician[]
    isNew?: boolean
    onBack?: () => void
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
    initialServiceNotes,
    initialMusicians,
    isNew = false,
    onBack,
    onSave,
    onPlayTrack,
}: SetlistEditorV2Props) {
    const { user } = useAuth()
    const router = useRouter()
    const { items: pendingItems, clear: clearPending } = useSetlistStore()
    const { setQueue } = useMusicStore()

    const tracksToUse = isNew
        ? pendingItems.map((item) => ({
            id: item.id,
            title: item.name,
            fileId: item.fileId,
            transposition: item.transposition,
        } as SetlistTrack))
        : initialTracks

    const handleBack = () => {
        if (onBack) return onBack()
        clearPending()
        router.push(initialSetlistId ? `/perform/setlist/${initialSetlistId}` : "/setlists")
    }

    const handleSave = (id: string) => {
        if (onSave) return onSave(id)
        clearPending()
        router.push("/setlists")
    }

    const handlePlayTrack = (fileId: string, fileName: string) => {
        if (onPlayTrack) return onPlayTrack(fileId, fileName)

        const queue = tracks
            .filter((t: SetlistTrack) => t.fileId)
            .map((t: SetlistTrack) => {
                const type: FileType =
                    t.fileId?.startsWith("db-") || t.fileId?.endsWith(".musicxml") || t.fileId?.endsWith(".xml") || t.fileId?.endsWith(".mxl")
                        ? "musicxml"
                        : t.fileId?.endsWith(".chordpro")
                            ? "chordpro"
                            : "pdf"
                return {
                    name: t.title,
                    fileId: t.fileId as string,
                    type,
                    audioFileId: t.audioFileId,
                    bpm: t.bpm,
                    key: t.key,
                }
            })

        const clickedIdx = queue.findIndex((q) => q.fileId === fileId)
        if (clickedIdx !== -1) {
            setQueue(queue, clickedIdx, setlistId ? `/setlists/${setlistId}` : '/setlists', setlistId)
            router.push(`/perform/${fileId}`)
        }
    }

    // Core logic hook (unchanged from v1)
    const {
        canEdit,
        isBandLeader,
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
        serviceNotes,
        setServiceNotes,
        musicians,
        setMusicians,
        saving,
        lastSaved,
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
        initialTracks: tracksToUse,
        initialName,
        suggestedName,
        initialIsPublic,
        initialOwnerId,
        initialEventDate,
        initialRabbi,
        initialServiceNotes,
        initialMusicians,
        onSave: handleSave,
    })

    // Chat - auto-open only on new empty setlists
    useEffect(() => {
        if (!initialSetlistId && tracks.length === 0) {
            if (window.matchMedia("(min-width: 768px)").matches) {
                useChatStore.getState().open()
            }
        }
    }, [])

    // Bust Next.js aggressive Server Component cache when client-side togglePublic mutates Firestore
    useEffect(() => {
        if (isPublic !== initialIsPublic) {
            router.refresh()
        }
    }, [isPublic, initialIsPublic, router])

    // Background offline syncing — silent to avoid toast spam on every track change
    useEffect(() => {
        if (tracks.length > 0) {
            syncSetlist(tracks, { silent: true }).catch(console.error)
        }
    }, [tracks])

    // ── UI State ──

    const [showNamePrompt, setShowNamePrompt] = useState(!initialSetlistId && !initialName)
    const [showEditDetails, setShowEditDetails] = useState(false)
    const [showAddSongs, setShowAddSongs] = useState(false)
    const [showSearchOverlay, setShowSearchOverlay] = useState(false)
    const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null)
    const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null)
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
            handleBack()
        } catch {
            toast.error("Failed to delete setlist")
        }
        setShowDeleteConfirm(false)
    }, [editorService, setlistId, isPublic, handleBack])

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

    // Debounce empty state to prevent flash during AI batch edits
    const currentTrackFileIds = useMemo(() => new Set(tracks.filter(t => t.fileId).map(t => t.fileId!)), [tracks])
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

    const handleDragStart = (_event: DragStartEvent) => {
        // Collapse any expanded row when drag starts
        setExpandedTrackId(null)
    }

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

    const handleToggleExpand = useCallback((track: SetlistTrack) => {
        if (canEdit) {
            setExpandedTrackId(prev => prev === track.id ? null : track.id)
        } else {
            // Read-only mode: fall back to the TrackSheet modal
            setEditingTrack(track)
        }
    }, [canEdit])

    const handleReplace = useCallback((track: SetlistTrack) => {
        setReplacingTrackId(track.id)
        setShowSearchOverlay(true)
    }, [])

    const handleSearchSelect = useCallback((file: DriveFile) => {
        const cleanName = file.name
            .replace(/\.(pdf|musicxml|xml|mxl)$/i, '')
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
            .trim() || "Untitled"

        if (replacingTrackId) {
            // Replace mode: update existing track with new file
            updateTrack(replacingTrackId, {
                title: cleanName,
                fileId: file.id,
                fileName: file.name,
                key: file.metadata?.key || "",
            })
            setReplacingTrackId(null)
            setExpandedTrackId(null)
        } else {
            // Add mode: add as new track
            addSongsFromLibrary([file])
        }
        setShowSearchOverlay(false)
    }, [replacingTrackId, updateTrack, addSongsFromLibrary])

    const renderTrack = (track: SetlistTrack) => {
        // In select mode, suppress tap/play behaviors
        const tapHandler = selectMode ? () => { } : handleToggleExpand
        const playHandler = selectMode ? undefined : handlePlayTrack

        const row = (() => {
            if (track.type === "header") {
                return <DividerRow key={track.id} track={track} canEdit={canEdit} onTap={tapHandler} />
            }
            if (track.type && (SERVICE_FLOW_TYPES as readonly string[]).includes(track.type)) {
                return (
                    <FlowRow
                        key={track.id}
                        track={track}
                        canEdit={canEdit}
                        isExpanded={expandedTrackId === track.id}
                        onTap={tapHandler}
                        onUpdate={updateTrack}
                        onDelete={deleteTrack}
                    />
                )
            }
            return (
                <SongRow
                    key={track.id}
                    track={track}
                    canEdit={canEdit}
                    isExpanded={expandedTrackId === track.id}
                    onTap={tapHandler}
                    onPlayFile={playHandler}
                    onUpdate={updateTrack}
                    onReplace={handleReplace}
                    onDelete={deleteTrack}
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
        <div className="flex flex-col bg-background text-foreground h-full relative min-h-[calc(100vh-5rem)]">
            {/* Name prompt for new setlists */}
            <NamePrompt
                isOpen={showNamePrompt || showEditDetails}
                onClose={() => {
                    setShowNamePrompt(false)
                    setShowEditDetails(false)
                }}
                initialName={name}
                initialIsPublic={isPublic}
                initialDate={eventDate ? new Date(eventDate) : null}
                isBandLeader={isBandLeader}
                onConfirm={(newName, newIsPublic, newDate) => {
                    setName(newName)
                    setIsPublic(newIsPublic)
                    setEventDate(newDate)
                    setShowNamePrompt(false)
                    setShowEditDetails(false)
                }}
            />

            {/* Top bar */}
            <SetlistTopBar
                name={name}
                onNameChange={setName}
                onBack={handleBack}
                canEdit={canEdit}
                saving={saving}
                lastSaved={lastSaved}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                onPerform={setlistId ? () => router.push(`/perform/setlist/${setlistId}`) : undefined}
                onPrint={() => setShowPrintModal(true)}
                overflowTrigger={
                    <OverflowMenu
                        onPerform={setlistId ? () => router.push(`/perform/setlist/${setlistId}`) : undefined}
                        onPublish={setlistId ? () => setShowPublishDialog(true) : undefined}
                        onTogglePublic={togglePublic}
                        onSetRabbi={canEdit ? setRabbi : undefined}
                        onOpenAI={() => useChatStore.getState().toggle()}
                        onDelete={canEdit && setlistId ? () => setShowDeleteConfirm(true) : undefined}
                        onEditDetails={canEdit ? () => setShowEditDetails(true) : undefined}
                        isPublic={isPublic}
                        isBandLeader={isBandLeader}
                        canEdit={canEdit}
                        setlistId={setlistId}
                        rabbi={rabbi}
                        estimatedMinutes={estimatedMinutes}
                        songCount={songCount}
                    />
                }
            />



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
                    setlistId={setlistId}
                    setlistName={name}
                    eventDate={eventDate ? new Date(eventDate).toISOString() : null}
                    rabbiName={rabbi}
                    isPublished={isPublic}
                />
            )}

            {/* Service notes */}
            {(canEdit || serviceNotes) && (
                <div className="border-b border-border/50 px-4 py-2">
                    {!serviceNotes && canEdit ? (
                        <button
                            onClick={() => setServiceNotes(" ")}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <span>+ Add service notes</span>
                        </button>
                    ) : (
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wide">Service Notes</p>
                            {canEdit ? (
                                <textarea
                                    value={serviceNotes?.trim() || ""}
                                    onChange={(e) => setServiceNotes(e.target.value)}
                                    placeholder="Instructions for the band (e.g. starting 15 min early, new arrangement)…"
                                    className="w-full text-sm bg-muted/30 rounded-lg border border-border/50 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    rows={2}
                                />
                            ) : (
                                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{serviceNotes}</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Track list */}
            <div className="flex-1 overflow-y-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                    onAddSongs={() => {
                        setReplacingTrackId(null)
                        setShowSearchOverlay(true)
                    }}
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
                currentTrackFileIds={currentTrackFileIds}
            />

            <MatchFileModal
                isOpen={!!matchingTrackId && canEdit}
                onClose={() => setMatchingTrackId(null)}
                onMatch={(fileId) => matchingTrackId && matchFile(matchingTrackId, fileId)}
                trackTitle={matchingTrackId ? tracks.find(t => t.id === matchingTrackId)?.title : undefined}
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
                    isPublished={isPublic}
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

            {/* Search overlay for adding/replacing songs */}
            <SearchOverlay
                isOpen={showSearchOverlay}
                onClose={() => {
                    setShowSearchOverlay(false)
                    setReplacingTrackId(null)
                }}
                onSelect={handleSearchSelect}
                replacingTrackId={replacingTrackId}
                currentTrackFileIds={currentTrackFileIds}
            />
        </div>
    )
}
