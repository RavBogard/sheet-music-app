import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2, Play, Search, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AudioFilePicker } from "../AudioFilePicker"
import { SetlistTrack, DriveFile } from "@/types/api"

interface TrackItemProps {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    onMatchFile: (trackId: string) => void
    onPlay?: (fileId: string, fileName: string) => void
    driveFiles: DriveFile[]
    readOnly?: boolean
}

export function TrackItem({
    track,
    onUpdate,
    onDelete,
    onMatchFile,
    onPlay,
    driveFiles,
    readOnly
}: TrackItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    const matchedFile = driveFiles.find(f => f.id === track.fileId)

    const handleTitleClick = () => {
        if (matchedFile && onPlay) {
            onPlay(matchedFile.id, matchedFile.name)
        }
    }

    const isHeader = track.type === 'header'

    if (isHeader) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 flex items-center gap-4 group mt-4 mb-2"
            >
                {!readOnly && (
                    <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-zinc-500 hover:text-zinc-300">
                        <GripVertical className="h-5 w-5" />
                    </div>
                )}

                <div className="flex-1">
                    {!readOnly ? (
                        <Input
                            value={track.title}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                            className="bg-transparent border-0 text-lg font-bold text-center text-zinc-300 placeholder:text-zinc-600 focus-visible:ring-0"
                            placeholder="SECTION HEADER"
                        />
                    ) : (
                        <div className="text-lg font-bold text-center text-zinc-300 uppercase tracking-wider">
                            {track.title}
                        </div>
                    )}
                </div>

                {!readOnly && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onDelete(track.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>
        )
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="glass-card rounded-lg p-4 flex items-center gap-4 group transition-colors hover:bg-zinc-900/40"
        >
            {!readOnly && (
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
                    <GripVertical className="h-5 w-5 text-zinc-600" />
                </div>
            )}

            <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                    {matchedFile && onPlay && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-400/10"
                            onClick={handleTitleClick}
                        >
                            <Play className="h-4 w-4" />
                        </Button>
                    )}
                    {readOnly ? (
                        <span
                            className={`text-lg font-medium ${matchedFile ? 'cursor-pointer hover:text-blue-400' : ''}`}
                            onClick={matchedFile ? handleTitleClick : undefined}
                        >
                            {track.title}
                        </span>
                    ) : (
                        <Input
                            value={track.title}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                            className={`bg-transparent border-0 text-lg font-medium p-0 h-auto focus-visible:ring-0 ${matchedFile ? 'cursor-pointer hover:text-blue-400' : ''}`}
                            placeholder="Song title"
                            onClick={matchedFile ? handleTitleClick : undefined}
                        />
                    )}
                </div>
                {!readOnly && (
                    <div className="flex items-center gap-4 text-sm">
                        <Input
                            value={track.key || ""}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { key: e.target.value })}
                            className="bg-zinc-800 w-20 h-8 text-center"
                            placeholder="Key"
                        />
                        <Input
                            value={track.notes || ""}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { notes: e.target.value })}
                            className="bg-zinc-800 flex-1 h-8"
                            placeholder="Notes..."
                        />
                    </div>
                )}
                {readOnly && (track.key || track.notes) && (
                    <div className="flex items-center gap-4 text-sm text-zinc-500">
                        {track.key && <span className="bg-zinc-800 px-2 py-1 rounded">{track.key}</span>}
                        {track.notes && <span>{track.notes}</span>}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                {matchedFile ? (
                    <div
                        className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded cursor-pointer hover:bg-green-400/20"
                        onClick={readOnly ? handleTitleClick : () => onMatchFile(track.id)}
                    >
                        ✓ Linked
                    </div>
                ) : !readOnly && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onMatchFile(track.id)}
                        className="h-8 gap-1 text-yellow-400 border-yellow-400/50"
                    >
                        <Search className="h-3 w-3" />
                        Link File
                    </Button>
                )}
                {!readOnly && (
                    <AudioFilePicker
                        currentFileId={track.audioFileId}
                        onSelect={(fileId) => onUpdate(track.id, { audioFileId: fileId })}
                        trigger={
                            <Button
                                size="sm"
                                variant="outline"
                                className={`h-8 w-8 p-0 ${track.audioFileId ? 'text-blue-400 border-blue-400/50' : 'text-zinc-600 border-zinc-800'}`}
                                title={track.audioFileId ? "Audio Linked" : "Link Audio"}
                            >
                                <Music className="h-3 w-3" />
                            </Button>
                        }
                    />
                )}
                {!readOnly && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100"
                        onClick={() => onDelete(track.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}
