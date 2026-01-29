import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SetlistTrack } from "@/types/models"
import { useState, useEffect } from "react"
import { Trash2, FileText, Music } from "lucide-react"
import { AudioFilePicker } from "../AudioFilePicker"
import { TapTempoButton } from "@/components/ui/tap-tempo-button"

interface TrackDetailsModalProps {
    isOpen: boolean
    onClose: () => void
    track: SetlistTrack | null
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    onMatchFile: (trackId: string) => void
}

export function TrackDetailsModal({
    isOpen,
    onClose,
    track,
    onUpdate,
    onDelete,
    onMatchFile
}: TrackDetailsModalProps) {
    const [title, setTitle] = useState("")
    const [key, setKey] = useState("")
    const [bpm, setBpm] = useState("")
    const [leadMusician, setLeadMusician] = useState("")
    const [notes, setNotes] = useState("")

    useEffect(() => {
        if (track) {
            setTitle(track.title || "")
            setKey(track.key || "")
            setBpm(track.bpm?.toString() || "")
            setLeadMusician(track.leadMusician || "")
            setNotes(track.notes || "")
        }
    }, [track])

    const handleSave = () => {
        if (!track) return

        onUpdate(track.id, {
            title,
            key,
            bpm: bpm ? parseInt(bpm) : undefined,
            leadMusician,
            notes
        })
        onClose()
    }

    const handleDelete = () => {
        if (!track) return
        onDelete(track.id)
        onClose()
    }

    if (!track) return null

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-zinc-100 shadow-2xl gap-6">
                <DialogHeader>
                    <DialogTitle className="text-xl">Edit Track Details</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Update song information and files.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-5">
                    {/* Title */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="title" className="text-right text-zinc-400">Title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="col-span-3 bg-zinc-900 border-zinc-700 focus-visible:ring-primary"
                        />
                    </div>

                    {/* Lead & Key Row */}
                    <div className="grid grid-cols-4 gap-4">
                        <Label className="text-right text-zinc-400 self-center">Info</Label>
                        <div className="col-span-3 flex gap-3">
                            <div className="flex-1">
                                <Input
                                    value={leadMusician}
                                    onChange={(e) => setLeadMusician(e.target.value)}
                                    placeholder="Lead Singer"
                                    className="bg-zinc-900 border-zinc-700"
                                />
                            </div>
                            <div className="w-24">
                                <Input
                                    value={key}
                                    onChange={(e) => setKey(e.target.value)}
                                    placeholder="Key"
                                    className="bg-zinc-900 border-zinc-700 text-center"
                                />
                            </div>
                        </div>
                    </div>

                    {/* BPM Row */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="bpm" className="text-right text-zinc-400">BPM</Label>
                        <div className="col-span-3 flex gap-3">
                            <Input
                                id="bpm"
                                type="number"
                                value={bpm}
                                onChange={(e) => setBpm(e.target.value)}
                                placeholder="120"
                                className="bg-zinc-900 border-zinc-700 w-24"
                            />
                            <TapTempoButton
                                currentBpm={bpm ? parseInt(bpm) : undefined}
                                onBpmChange={(newBpm) => setBpm(newBpm.toString())}
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="grid grid-cols-4 gap-4">
                        <Label htmlFor="notes" className="text-right text-zinc-400 mt-2">Notes</Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="col-span-3 bg-zinc-900 border-zinc-700 min-h-[80px]"
                            placeholder="Add performance notes..."
                        />
                    </div>

                    {/* File Management */}
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label className="text-right text-zinc-400 mt-2">Files</Label>
                        <div className="col-span-3 grid grid-cols-2 gap-3">
                            <Button
                                size="sm"
                                variant={track.fileId ? "secondary" : "outline"}
                                className={`h-10 justify-start ${track.fileId ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20' : 'text-zinc-400 border-zinc-800'}`}
                                onClick={() => onMatchFile(track.id)}
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                {track.fileId ? "Change PDF" : "Link PDF"}
                            </Button>

                            <AudioFilePicker
                                currentFileId={track.audioFileId}
                                onSelect={(fileId) => onUpdate(track.id, { audioFileId: fileId })}
                                trigger={
                                    <Button
                                        size="sm"
                                        variant={track.audioFileId ? "secondary" : "outline"}
                                        className={`h-10 justify-start ${track.audioFileId ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20' : 'text-zinc-400 border-zinc-800'}`}
                                    >
                                        <Music className="h-4 w-4 mr-2" />
                                        {track.audioFileId ? "Change Audio" : "Link Audio"}
                                    </Button>
                                }
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex items-center justify-between sm:justify-between gap-4 border-t border-zinc-800 pt-4 mt-2">
                    <Button
                        variant="ghost"
                        onClick={handleDelete}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 px-4"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Track
                    </Button>
                    <div className="flex gap-3">
                        <Button variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white">
                            Cancel
                        </Button>
                        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white min-w-[100px]">
                            Save
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
