import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SetlistTrack } from "@/types/models"
import { useState, useEffect } from "react"
import { Trash2, Search, Music, FileText } from "lucide-react"
import { AudioFilePicker } from "../AudioFilePicker"

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
            <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-white">
                <DialogHeader>
                    <DialogTitle>Edit Track Details</DialogTitle>
                    <DialogDescription>
                        Make changes to the selected track.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="title" className="text-right">
                            Title
                        </Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="col-span-3 bg-zinc-800 border-zinc-700"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="lead" className="text-right">
                            Lead
                        </Label>
                        <Input
                            id="lead"
                            value={leadMusician}
                            onChange={(e) => setLeadMusician(e.target.value)}
                            placeholder="e.g. Sarah"
                            className="col-span-3 bg-zinc-800 border-zinc-700"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="key" className="text-right">
                            Key
                        </Label>
                        <Input
                            id="key"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder="e.g. Am"
                            className="col-span-3 bg-zinc-800 border-zinc-700"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="bpm" className="text-right">
                            BPM
                        </Label>
                        <Input
                            id="bpm"
                            type="number"
                            value={bpm}
                            onChange={(e) => setBpm(e.target.value)}
                            placeholder="120"
                            className="col-span-3 bg-zinc-800 border-zinc-700"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="notes" className="text-right">
                            Notes
                        </Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="col-span-3 bg-zinc-800 border-zinc-700"
                        />
                    </div>

                    {/* File Management */}
                    <div className="grid grid-cols-4 items-center gap-4 mt-2">
                        <Label className="text-right">Files</Label>
                        <div className="col-span-3 flex gap-2">
                            <Button
                                size="sm"
                                variant={track.fileId ? "secondary" : "outline"}
                                className={`flex-1 ${track.fileId ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : ''}`}
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
                                        className={`flex-1 ${track.audioFileId ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : ''}`}
                                    >
                                        <Music className="h-4 w-4 mr-2" />
                                        {track.audioFileId ? "Change Audio" : "Link Audio"}
                                    </Button>
                                }
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between">
                    <Button variant="destructive" onClick={handleDelete} className="mr-auto">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Track
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500">Save Changes</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
