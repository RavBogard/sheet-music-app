"use client"

import { useState } from "react"
import { ChevronLeft, Music, Play, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AudioPlayer } from "@/components/audio/AudioPlayer"

interface DriveFile {
    id: string
    name: string
    mimeType: string
}

interface AudioLibraryProps {
    driveFiles: DriveFile[]
    onBack: () => void
    onSelectFile?: (file: DriveFile) => void
}

export function AudioLibrary({ driveFiles, onBack, onSelectFile }: AudioLibraryProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [playingFile, setPlayingFile] = useState<DriveFile | null>(null)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)

    // Filter to audio files only
    const audioFiles = driveFiles.filter(f =>
        f.mimeType.startsWith('audio/') ||
        f.name.endsWith('.mp3') ||
        f.name.endsWith('.m4a') ||
        f.name.endsWith('.wav') ||
        f.name.endsWith('.aac') ||
        f.name.endsWith('.ogg') ||
        f.name.endsWith('.flac')
    )

    const filteredFiles = audioFiles.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const playFile = async (file: DriveFile) => {
        setPlayingFile(file)
        // Use the proxy API to stream the file
        setAudioUrl(`/api/drive/file/${file.id}`)
    }

    const getCleanName = (name: string) => {
        return name
            .replace(/\.(mp3|m4a|wav|aac|ogg|flac)$/i, '')
            .replace(/_/g, ' ')
            .replace(/-/g, ' ')
    }

    return (
        <div className="h-full flex flex-col bg-background text-foreground">
            {/* Header */}
            <div className="h-20 border-b border-border flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <h1 className="text-2xl font-bold flex-1">{onSelectFile ? "Select Audio Track" : "Audio Files"}</h1>
                <div className="text-sm text-muted-foreground">
                    {audioFiles.length} audio files
                </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-border">
                <div className="relative max-w-xl mx-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search audio files..."
                        className="pl-10 h-12 text-lg"
                    />
                </div>
            </div>

            {/* Audio Player (sticky at top when playing) */}
            {playingFile && (
                <div className="p-4 border-b border-border bg-muted">
                    <div className="max-w-2xl mx-auto">
                        <AudioPlayer
                            src={audioUrl}
                            title={getCleanName(playingFile.name)}
                        />
                    </div>
                </div>
            )}

            {/* File List */}
            <ScrollArea className="flex-1 p-4">
                {audioFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                        <Music className="h-16 w-16 mb-4" />
                        <p className="text-xl">No audio files found</p>
                        <p className="text-sm mt-2">Share MP3 or audio files with the service account</p>
                    </div>
                ) : (
                    <div className="max-w-2xl mx-auto space-y-2">
                        {filteredFiles.map(file => (
                            <button
                                key={file.id}
                                onClick={() => {
                                    if (onSelectFile) {
                                        onSelectFile(file)
                                    } else {
                                        playFile(file)
                                    }
                                }}
                                className={`w-full text-left p-4 rounded-lg transition-colors flex items-center gap-4 ${playingFile?.id === file.id
                                    ? 'bg-blue-600 text-foreground'
                                    : 'bg-card hover:bg-muted'
                                    }`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${playingFile?.id === file.id ? 'bg-white/20' : 'bg-muted'
                                    }`}>
                                    {playingFile?.id === file.id ? (
                                        <Music className="h-5 w-5" />
                                    ) : (
                                        <Play className="h-5 w-5 ml-0.5" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">
                                        {getCleanName(file.name)}
                                    </div>
                                    <div className="text-sm text-muted-foreground truncate">
                                        {file.name}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    )
}
