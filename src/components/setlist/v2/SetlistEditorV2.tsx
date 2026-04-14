"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
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
import { Button } from "@/components/ui/button"
import { SetlistTrack, TrackType, SetlistMusician, DriveFile } from "@/types/models"
import { useSetlistLogic } from "@/hooks/use-setlist-logic"
import { logger } from "@/lib/logger"
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
import { useAddToSetlist } from "@/hooks/use-add-to-setlist"
import { AddToSetlistSheet } from "@/components/library/AddToSetlistSheet"

import dynamic from "next/dynamic"

// Shared components (kept from v1)
const PrintModal = dynamic(() => import("../PrintModal").then(m => m.PrintModal), { ssr: false })
import { DeleteSetlistDialog, DuplicateSetlistDialog } from "../SetlistDialogs"
import { SetlistHistoryPanel } from "../SetlistHistoryPanel"
import { SetlistChangedBanner } from "./SetlistChangedBanner"
import { NamePrompt } from "../modals/NamePrompt"
import { EditDetails } from "../modals/EditDetails"
import { AddSongsModal } from "../modals/AddSongsModal"
import { MatchFileModal } from "../modals/MatchFileModal"
import { createSetlistService } from "@/lib/setlist-firebase"
import { syncTemplateSlot } from "@/lib/template-firebase"
import { useBatchSelection } from "@/hooks/use-batch-selection"

import { toast } from "sonner"
import { ErrorBoundary } from "react-error-boundary"
import { FallbackError } from "@/components/ui/fallback-error"

interface SetlistEditorV2Props {
    setlistId?: string
    initialTracks?: SetlistTrack[]
    initialName?: string
    suggestedName?: string
    initialOwnerId?: string
    initialEventDate?: string | Date | null
    initialRabbi?: string
    initialServiceNotes?: string
    initialMusicians?: SetlistMusician[]
    initialTemplateType?: string
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
    initialOwnerId,
    initialEventDate,
    initialRabbi,
    initialServiceNotes,
    initialMusicians,
    initialTemplateType,
    isNew = false,
    onBack,
    onSave,
    onPlayTrack,
}: SetlistEditorV2Props) {
    const { user } = useAuth()
    const router = useRouter()
    const { setQueue } = useMusicStore()
    const addToSetlistHook = useAddToSetlist()

    const handleBack = useCallback(() => {
        if (onBack) return onBack()
        router.push(initialSetlistId ? `/perform/setlist/${initialSetlistId}` : "/setlists")
    }, [onBack, router, initialSetlistId])

    const handleSave = (id: string) => {
        if (onSave) return onSave(id)
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
        detectKeyForFile,
        undo,
        redo,
        canUndo,
        canRedo,
        addToHistory,
        setTracks,
        restoreTracks,
        staleDetected,
        takeRemote,
        keepLocalChanges,
    } = useSetlistLogic({
        initialSetlistId,
        initialTracks,
        initialName,
        suggestedName,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Background offline syncing — silent to avoid toast spam on every track change
    // Skip initial mount to avoid racing with auto-save
    const hasMountedForSync = useRef(false)
    useEffect(() => {
        if (!hasMountedForSync.current) {
            hasMountedForSync.current = true
            return
        }
        if (tracks.length > 0) {
            syncSetlist(tracks, { silent: true }).catch(e => logger.error("[SetlistEditor] Sync failed:", e))
        }
    }, [tracks, syncSetlist])

    // ── UI State ──

    const [showNamePrompt, setShowNamePrompt] = useState(!initialSetlistId && !initialName)
    const [showEditDetails, setShowEditDetails] = useState(false)
    const [showAddSongs, setShowAddSongs] = useState(false)
    const [showSearchOverlay, setShowSearchOverlay] = useState(false)
    const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null)
    const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null)
    const [matchingTrackId, setMatchingTrackId] = useState<string | null>(null)
    const [editingTrack, setEditingTrack] = useState<SetlistTrack | null>(null)
    const [focusedTrackIndex, setFocusedTrackIndex] = useState<number | null>(null)
    const [showPrintModal, setShowPrintModal] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false)

    // Batch select mode
    const {
        selectMode, setSelectMode, selectedIds, setSelectedIds,
        toggleSelectId, handleBatchDelete, handleBatchDuplicate, exitSelectMode,
    } = useBatchSelection({ tracks, addToHistory, setTracks, undo })

    // Service for delete/duplicate operations
    const editorService = useMemo(
        () => user ? createSetlistService(user.uid, user.displayName) : null,
        [user]
    )

    const handleDeleteSetlist = useCallback(async () => {
        if (!editorService || !setlistId) return
        try {
            await editorService.deleteSetlist(setlistId)
            toast.success("Setlist deleted")
            handleBack()
        } catch {
            toast.error("Failed to delete setlist")
        }
        setShowDeleteConfirm(false)
    }, [editorService, setlistId, handleBack])

    const handleDuplicateSetlist = useCallback(async () => {
        if (!editorService || !setlistId) return
        try {
            const currentSetlist = { id: setlistId, name, tracks, rabbi } as Parameters<typeof editorService.duplicateSetlist>[1]
            const newId = await editorService.duplicateSetlist(setlistId, currentSetlist)
            toast.success("Setlist duplicated!")
            router.push(`/setlists/${newId}`)
        } catch {
            toast.error("Failed to duplicate setlist")
        }
        setShowDuplicateConfirm(false)
    }, [editorService, setlistId, name, tracks, rabbi, router])

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

    // ── Track rendering ──

    const handleToggleExpand = useCallback((track: SetlistTrack) => {
        if (canEdit) {
            setExpandedTrackId(prev => prev === track.id ? null : track.id)
            // Track focused position for insert-at-position
            const idx = tracks.findIndex(t => t.id === track.id)
            if (idx >= 0) setFocusedTrackIndex(idx)
        } else {
            // Read-only mode: fall back to the TrackSheet modal
            setEditingTrack(track)
        }
    }, [canEdit, tracks])

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

        const hasKey = !!file.metadata?.key

        if (replacingTrackId) {
            // Replace mode: update existing track with new file
            updateTrack(replacingTrackId, {
                title: cleanName,
                fileId: file.id,
                fileName: file.name,
                key: file.metadata?.key || "",
            })
            // Detect key in background if file doesn't already have one
            if (!hasKey && file.id) {
                detectKeyForFile(file.id)
            }
            // Sync to template if this setlist was created from one
            if (initialTemplateType && user?.uid) {
                const trackIndex = tracks.findIndex(t => t.id === replacingTrackId)
                if (trackIndex >= 0) {
                    syncTemplateSlot(initialTemplateType, trackIndex, {
                        fileId: file.id,
                        fileName: file.name,
                        label: cleanName,
                    }, user.uid).catch(() => { /* best-effort */ })
                }
            }
            setReplacingTrackId(null)
            setExpandedTrackId(null)
        } else {
            // Add mode: insert after focused track, or append
            // Key detection handled internally by addSongsFromLibrary
            addSongsFromLibrary([file], focusedTrackIndex ?? undefined)
        }
        setShowSearchOverlay(false)
    }, [replacingTrackId, updateTrack, addSongsFromLibrary, focusedTrackIndex, detectKeyForFile, tracks, initialTemplateType, user])

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
                    className={`flex items-center gap-2 cursor-pointer transition-colors ${isSelected ? 'bg-brand/10 rounded-lg' : ''}`}
                    onClick={() => toggleSelectId(track.id)}
                >
                    <div className={`ml-2 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-brand border-brand' : 'border-muted-foreground/40'}`}>
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
        <ErrorBoundary FallbackComponent={(props) => <FallbackError {...props} title="Editor Error" />}>
        <div className="flex flex-col bg-background text-foreground h-full relative min-h-[calc(100dvh-5rem)]">
            {/* Name prompt — create-new flow only */}
            <NamePrompt
                isOpen={showNamePrompt}
                onClose={() => setShowNamePrompt(false)}
                initialName={name}
                initialDate={eventDate ? new Date(eventDate) : null}
                onConfirm={(newName, newDate) => {
                    setName(newName)
                    setEventDate(newDate)
                    setShowNamePrompt(false)
                }}
            />

            {/* Edit details — edit-existing flow (name + date + rabbi + notes) */}
            <EditDetails
                isOpen={showEditDetails}
                onClose={() => setShowEditDetails(false)}
                initialName={name}
                initialDate={eventDate ? new Date(eventDate) : null}
                initialRabbi={rabbi}
                initialServiceNotes={serviceNotes}
                onConfirm={({ name: n, date, rabbi: r, serviceNotes: sn }) => {
                    setName(n)
                    setEventDate(date)
                    setRabbi(r)
                    setServiceNotes(sn)
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
                        onPublish={undefined}
                        onSetRabbi={canEdit ? setRabbi : undefined}
                        onOpenAI={() => useChatStore.getState().toggle()}
                        onDelete={canEdit && setlistId ? () => setShowDeleteConfirm(true) : undefined}
                        onEditDetails={canEdit ? () => setShowEditDetails(true) : undefined}
                        isBandLeader={isBandLeader}
                        canEdit={canEdit}
                        setlistId={setlistId}
                        rabbi={rabbi}
                        estimatedMinutes={estimatedMinutes}
                        songCount={songCount}
                    />
                }
            />

            {staleDetected && (
                <SetlistChangedBanner onTakeRemote={takeRemote} onKeepLocal={keepLocalChanges} />
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
                    setlistId={setlistId}
                    setlistName={name}
                    eventDate={eventDate ? new Date(eventDate).toISOString() : null}
                    rabbiName={rabbi}
                />
            )}

            {/* Service notes */}
            {(canEdit || serviceNotes) && (
                <div className="border-b border-brand/10 px-4 py-2">
                    {!serviceNotes && canEdit ? (
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setServiceNotes(" ")}
                            className="text-muted-foreground hover:text-foreground hover:bg-transparent"
                        >
                            + Add service notes
                        </Button>
                    ) : (
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wide">Service Notes</p>
                            {canEdit ? (
                                <textarea
                                    value={serviceNotes?.trim() || ""}
                                    onChange={(e) => setServiceNotes(e.target.value)}
                                    placeholder="Instructions for the band (e.g. starting 15 min early, new arrangement)…"
                                    className="w-full text-sm bg-muted/30 rounded-lg border border-brand/10 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                        <div className="max-w-3xl mx-auto px-1 sm:px-4 py-4 pb-32 space-y-1">
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
                    onAddItem={(type: TrackType) => addServiceItem(type, undefined, focusedTrackIndex ?? undefined)}
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
                    addSongsFromLibrary(files, focusedTrackIndex ?? undefined)
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
                    assignedMusicians={musicians}
                    eventDate={eventDate?.toISOString() ?? null}
                    rabbi={rabbi}
                    onClose={() => setShowPrintModal(false)}
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
                canAddToSetlist={addToSetlistHook.canAddToSetlist}
                onAddToSetlist={(file) => addToSetlistHook.openForSongs([file])}
            />

            {/* Add to Setlist Sheet (for SearchOverlay "Add to Setlist..." action) */}
            <AddToSetlistSheet
                isOpen={addToSetlistHook.isOpen}
                onOpenChange={addToSetlistHook.setIsOpen}
                setlists={addToSetlistHook.editableSetlists}
                loading={addToSetlistHook.loading}
                searchQuery={addToSetlistHook.searchQuery}
                onSearchChange={addToSetlistHook.setSearchQuery}
                onSelectSetlist={addToSetlistHook.addToSetlist}
                pendingCount={addToSetlistHook.pendingSongs.length}
            />
        </div>
        </ErrorBoundary>
    )
}
