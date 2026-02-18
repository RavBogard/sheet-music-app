"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { SetlistTrack, TrackType } from "@/types/models"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, FileText, Music, Minus, Plus, ExternalLink, Check } from "lucide-react"
import { AudioFilePicker } from "../AudioFilePicker"
import { TapTempoButton } from "@/components/ui/tap-tempo-button"
import { KeyPicker } from "@/components/ui/key-picker"
import { calculateSemitones, transposeChord } from "@/lib/music-math"
import { useMediaQuery } from "@/hooks/use-media-query"
import { loadLibraryMeta, saveNativeKey } from "@/lib/chord-cache"

interface TrackSheetProps {
    isOpen: boolean
    onClose: () => void
    track: SetlistTrack | null
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    onMatchFile: (trackId: string) => void
    onPlayFile?: (fileId: string, fileName: string) => void
}

const TRACK_TYPES: { value: TrackType; label: string }[] = [
    { value: "song", label: "Song" },
    { value: "header", label: "Section Header" },
    { value: "reading", label: "Reading" },
    { value: "prayer", label: "Prayer" },
    { value: "transition", label: "Transition" },
    { value: "note", label: "Note" },
]

export function TrackSheet({
    isOpen,
    onClose,
    track,
    onUpdate,
    onDelete,
    onMatchFile,
    onPlayFile,
}: TrackSheetProps) {
    const isDesktop = useMediaQuery("(min-width: 768px)")

    // Local state mirrors track data
    const [title, setTitle] = useState("")
    const [trackType, setTrackType] = useState<TrackType>("song")
    const [key, setKey] = useState("")
    const [bpm, setBpm] = useState("")
    const [leadMusician, setLeadMusician] = useState("")
    const [notes, setNotes] = useState("")
    const [transposition, setTransposition] = useState(0)
    const [performer, setPerformer] = useState("")
    const [estimatedMinutes, setEstimatedMinutes] = useState("")
    const [description, setDescription] = useState("")

    // Native key from library
    const [nativeKey, setNativeKey] = useState<string | null>(null)
    const [nativeKeySource, setNativeKeySource] = useState<string | null>(null)
    const [editingNativeKey, setEditingNativeKey] = useState(false)
    const [saved, setSaved] = useState(false)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Sync local state when track changes
    useEffect(() => {
        if (track) {
            setTitle(track.title || "")
            setTrackType((track.type || "song") as TrackType)
            setKey(track.key || "")
            setBpm(track.bpm?.toString() || "")
            setLeadMusician(track.leadMusician || "")
            setNotes(track.notes || "")
            setTransposition(track.transposition || 0)
            setPerformer(track.performer || "")
            setEstimatedMinutes(track.estimatedMinutes?.toString() || "")
            setDescription(track.description || "")
        }
    }, [track])

    // Fetch native key from library when track has a fileId
    useEffect(() => {
        if (!track?.fileId) {
            setNativeKey(null)
            setNativeKeySource(null)
            return
        }
        loadLibraryMeta(track.fileId).then(meta => {
            if (meta?.nativeKey) {
                setNativeKey(meta.nativeKey)
                setNativeKeySource(meta.nativeKeySource || 'auto')
            }
        }).catch(() => {})
    }, [track?.fileId])

    // When user picks a "Play In" key, calculate transposition from native key
    const handleSetlistKeyChange = (newKey: string) => {
        setKey(newKey)
        if (nativeKey && newKey) {
            const semitones = calculateSemitones(nativeKey, newKey)
            setTransposition(semitones)
        } else {
            setTransposition(0)
        }
    }

    // When user adjusts stepper, derive the display key
    const handleTranspositionChange = (newTransposition: number) => {
        setTransposition(newTransposition)
        if (nativeKey) {
            const newKey = transposeChord(nativeKey, newTransposition)
            setKey(newKey)
        }
    }

    // Override native key manually
    const handleNativeKeyOverride = (newKey: string) => {
        setNativeKey(newKey)
        setNativeKeySource('manual')
        setEditingNativeKey(false)
        if (track?.fileId) {
            saveNativeKey(track.fileId, newKey, 'manual')
        }
        // Recalculate transposition if setlist key is set
        if (key && newKey) {
            const semitones = calculateSemitones(newKey, key)
            setTransposition(semitones)
        }
    }

    const isSong = trackType === "song"
    const isHeader = trackType === "header"
    const isFlowItem = !isSong && !isHeader

    // Auto-save on change (debounced via parent's auto-save)
    const commitChanges = useCallback(() => {
        if (!track) return
        const data: Partial<SetlistTrack> = { title }

        if (trackType !== track.type) data.type = trackType

        if (isSong) {
            data.key = key || undefined
            data.bpm = bpm ? parseInt(bpm) : undefined
            data.leadMusician = leadMusician || undefined
            data.notes = notes || undefined
            data.transposition = transposition || undefined
        }

        if (isFlowItem) {
            data.performer = performer || undefined
            data.estimatedMinutes = estimatedMinutes ? parseInt(estimatedMinutes) : undefined
            data.description = description || undefined
        }

        onUpdate(track.id, data)

        // Flash save indicator
        setSaved(true)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => setSaved(false), 1500)
    }, [track, title, trackType, isSong, isFlowItem, key, bpm, leadMusician, notes, transposition, performer, estimatedMinutes, description, onUpdate])

    // Auto-save when any field loses focus
    const handleBlur = useCallback(() => {
        commitChanges()
    }, [commitChanges])

    // Cleanup save timer
    useEffect(() => {
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
    }, [])

    const handleClose = () => {
        commitChanges()
        onClose()
    }

    const handleDelete = () => {
        if (!track) return
        onDelete(track.id)
        onClose()
    }

    if (!track) return null

    const content = (
        <div className="space-y-5 py-2">
            {/* Title */}
            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Title</Label>
                <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleBlur}
                    className="text-lg font-medium bg-muted/50 border-0 focus-visible:ring-1"
                    placeholder={isHeader ? "SECTION NAME" : "Track title"}
                />
            </div>

            {/* Type selector (for non-song items or to change type) */}
            {!isSong && (
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Type</Label>
                    <Select value={trackType} onValueChange={(v) => setTrackType(v as TrackType)}>
                        <SelectTrigger className="bg-muted/50 border-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TRACK_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Song-specific fields */}
            {isSong && (
                <>
                    {/* Key — single primary control */}
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Key</Label>
                                <KeyPicker
                                    value={key}
                                    onChange={handleSetlistKeyChange}
                                    className="w-full"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Lead</Label>
                                <Input
                                    value={leadMusician}
                                    onChange={(e) => setLeadMusician(e.target.value)}
                                    onBlur={handleBlur}
                                    className="bg-muted/50 border-0"
                                    placeholder="Karen"
                                />
                            </div>
                        </div>

                        {/* Auto-context: shows native key and transposition when relevant */}
                        {nativeKey && key && nativeKey !== key && (
                            <p className="text-xs text-violet-500 dark:text-violet-400 font-medium pl-0.5">
                                Chart is in {nativeKey} · transposing {transposition > 0 ? '+' : ''}{transposition}
                            </p>
                        )}

                        {/* Manual override — expandable for advanced users */}
                        {!editingNativeKey ? (
                            <button
                                type="button"
                                onClick={() => setEditingNativeKey(true)}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors pl-0.5"
                            >
                                {nativeKey
                                    ? `Chart key: ${nativeKey} (${nativeKeySource === 'manual' ? 'manual' : 'auto'}) · Edit`
                                    : track?.fileId ? 'Set chart key manually' : 'Advanced transpose'
                                }
                            </button>
                        ) : (
                            <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                                {/* Native key override */}
                                {track?.fileId && (
                                    <div className="flex items-center gap-2">
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wide min-w-[70px]">Chart Key</Label>
                                        <KeyPicker
                                            value={nativeKey || ""}
                                            onChange={handleNativeKeyOverride}
                                            className="w-20"
                                        />
                                    </div>
                                )}

                                {/* Semitone stepper */}
                                <div className="flex items-center gap-2">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wide min-w-[70px]">Semitones</Label>
                                    <div className="flex items-center gap-1 bg-muted/50 rounded-md">
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-9 w-9"
                                            onClick={() => handleTranspositionChange(Math.max(transposition - 1, -11))}
                                        >
                                            <Minus className="h-4 w-4" />
                                        </Button>
                                        <span className={`w-10 text-center font-mono text-sm ${transposition !== 0 ? "text-violet-500 dark:text-violet-400" : "text-muted-foreground"}`}>
                                            {transposition > 0 ? `+${transposition}` : transposition}
                                        </span>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-9 w-9"
                                            onClick={() => handleTranspositionChange(Math.min(transposition + 1, 11))}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {transposition !== 0 && (
                                        <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleTranspositionChange(0)}>
                                            Reset
                                        </Button>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setEditingNativeKey(false)}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                    Done
                                </button>
                            </div>
                        )}
                    </div>

                    {/* BPM */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">BPM</Label>
                        <div className="flex gap-3">
                            <Input
                                type="number"
                                value={bpm}
                                onChange={(e) => setBpm(e.target.value)}
                                onBlur={handleBlur}
                                placeholder="120"
                                className="bg-muted/50 border-0 w-24"
                            />
                            <TapTempoButton
                                currentBpm={bpm ? parseInt(bpm) : undefined}
                                onBpmChange={(newBpm) => setBpm(newBpm.toString())}
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Notes</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            onBlur={handleBlur}
                            className="bg-muted/50 border-0 min-h-[60px] resize-none"
                            placeholder="Performance notes..."
                        />
                    </div>

                    {/* File management */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Files</Label>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className={`h-9 ${track.fileId ? "text-green-600 dark:text-green-400 border-green-500/20" : ""}`}
                                onClick={() => { commitChanges(); onMatchFile(track.id) }}
                            >
                                <FileText className="h-3.5 w-3.5 mr-1.5" />
                                {track.fileId ? "Change Chart" : "Link Chart"}
                            </Button>

                            <AudioFilePicker
                                currentFileId={track.audioFileId}
                                onSelect={(fileId) => onUpdate(track.id, { audioFileId: fileId })}
                                trigger={
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className={`h-9 ${track.audioFileId ? "text-blue-600 dark:text-blue-400 border-blue-500/20" : ""}`}
                                    >
                                        <Music className="h-3.5 w-3.5 mr-1.5" />
                                        {track.audioFileId ? "Change Audio" : "Link Audio"}
                                    </Button>
                                }
                            />

                            {track.fileId && onPlayFile && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9 text-green-600 dark:text-green-400"
                                    onClick={() => onPlayFile(track.fileId!, track.fileName || track.title)}
                                >
                                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                    Open Chart
                                </Button>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Flow item fields (reading, prayer, transition, note) */}
            {isFlowItem && (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        {trackType !== "note" && (
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Performer</Label>
                                <Input
                                    value={performer}
                                    onChange={(e) => setPerformer(e.target.value)}
                                    onBlur={handleBlur}
                                    className="bg-muted/50 border-0"
                                    placeholder="Rabbi, Cantor..."
                                />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Duration (min)</Label>
                            <Input
                                type="number"
                                value={estimatedMinutes}
                                onChange={(e) => setEstimatedMinutes(e.target.value)}
                                onBlur={handleBlur}
                                className="bg-muted/50 border-0"
                                placeholder="5"
                            />
                        </div>
                    </div>

                    {(trackType === "reading" || trackType === "prayer" || trackType === "note") && (
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Description</Label>
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                onBlur={handleBlur}
                                className="bg-muted/50 border-0 min-h-[60px] resize-none"
                                placeholder={trackType === "note" ? "Note text..." : "Description..."}
                            />
                        </div>
                    )}
                </>
            )}

            {/* Delete */}
            <div className="pt-2 border-t border-border">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                </Button>
            </div>
        </div>
    )

    // Desktop: centered modal
    if (isDesktop) {
        return (
            <Dialog open={isOpen} onOpenChange={handleClose}>
                <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-lg">
                                {isHeader ? "Edit Section" : isSong ? "Edit Song" : `Edit ${trackType.charAt(0).toUpperCase() + trackType.slice(1)}`}
                            </DialogTitle>
                            <span className={`text-xs flex items-center gap-1 transition-opacity duration-300 ${saved ? "opacity-100 text-green-500" : "opacity-40 text-muted-foreground"}`}>
                                <Check className="h-3 w-3" />
                                {saved ? "Saved" : "Auto-saves"}
                            </span>
                        </div>
                    </DialogHeader>
                    <DialogDescription className="sr-only">Edit track details</DialogDescription>
                    {content}
                </DialogContent>
            </Dialog>
        )
    }

    // Mobile: bottom sheet
    return (
        <Sheet open={isOpen} onOpenChange={handleClose}>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl overscroll-contain">
                <SheetHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="text-lg">
                            {isHeader ? "Edit Section" : isSong ? "Edit Song" : `Edit ${trackType.charAt(0).toUpperCase() + trackType.slice(1)}`}
                        </SheetTitle>
                        <span className={`text-xs flex items-center gap-1 transition-opacity duration-300 ${saved ? "opacity-100 text-green-500" : "opacity-40 text-muted-foreground"}`}>
                            <Check className="h-3 w-3" />
                            {saved ? "Saved" : "Auto-saves"}
                        </span>
                    </div>
                    <SheetDescription className="sr-only">Edit track details</SheetDescription>
                </SheetHeader>
                {content}
            </SheetContent>
        </Sheet>
    )
}
