"use client"

import { useState } from "react"
import { useLibraryStore } from "@/lib/library-store"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Music, Search, Link as LinkIcon, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"

interface AudioFilePickerProps {
    currentFileId?: string
    onSelect: (fileId: string, fileName: string) => void
    trigger?: React.ReactNode
}

export function AudioFilePicker({ currentFileId, onSelect, trigger }: AudioFilePickerProps) {
    const { allFiles, loading } = useLibraryStore()
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const audioFiles = allFiles.filter(f =>
        f.mimeType.startsWith('audio/') || f.name.endsWith('.mp3') || f.name.endsWith('.wav')
    )

    const filteredFiles = audioFiles.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="icon" className={currentFileId ? "text-blue-400" : "text-muted-foreground"}>
                        <Music className="h-4 w-4" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-md bg-card border-border text-foreground max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Link Backing Track</DialogTitle>
                </DialogHeader>

                <div className="relative mb-4">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search audio files..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-background border-border"
                    />
                </div>

                <ScrollArea className="h-[300px] -mx-2 px-2 border border-border rounded-md bg-background/50">
                    {loading && <div className="text-center py-8 text-muted-foreground">Loading library...</div>}

                    {!loading && filteredFiles.length === 0 && (
                        <div className="text-center py-8 flex flex-col items-center gap-2 text-muted-foreground">
                            <AlertCircle className="h-8 w-8 opacity-50" />
                            <p>No audio files found in library</p>
                            <p className="text-xs max-w-xs">Make sure you have MP3 or WAV files uploaded to the same Google Drive folder.</p>
                        </div>
                    )}

                    <div className="space-y-1">
                        {filteredFiles.map(file => (
                            <button
                                key={file.id}
                                onClick={() => {
                                    onSelect(file.id, file.name)
                                    setOpen(false)
                                }}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left ${currentFileId === file.id ? 'bg-blue-500/10 border border-blue-500/30' : ''}`}
                            >
                                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                                    <Music className="h-4 w-4 text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`font-medium truncate ${currentFileId === file.id ? 'text-blue-400' : 'text-foreground'}`}>
                                        {file.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Backing Track
                                    </div>
                                </div>
                                {currentFileId === file.id && <LinkIcon className="h-4 w-4 text-blue-400" />}
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
