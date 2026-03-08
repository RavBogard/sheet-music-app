"use client"

import { useState, useMemo, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Music, Sparkles, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { MIME_TYPES } from "@/lib/constants"
import { DriveFile } from "@/types/models"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { useLibraryStore } from "@/lib/library-store"
import { useLibrary } from "@/hooks/use-library"

interface MatchFileModalProps {
    isOpen: boolean
    onClose: () => void
    onMatch: (fileId: string) => void
    /** Track title for AI-powered suggestions at the top of the modal */
    trackTitle?: string
}

export function MatchFileModal({
    isOpen,
    onClose,
    onMatch,
    trackTitle
}: MatchFileModalProps) {
    const {
        allFiles,
        displayedFiles,
        initialized,
        setFilter
    } = useLibraryStore()

    useLibrary()

    const [searchQuery, setSearchQuery] = useState("")

    // Pre-populate search with track title when opening
    useEffect(() => {
        if (isOpen && trackTitle) {
            setSearchQuery(trackTitle)
        }
    }, [isOpen, trackTitle])

    useEffect(() => {
        if (isOpen) {
            setFilter(searchQuery)
        }
    }, [isOpen, searchQuery, setFilter])

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
    }

    // AI-powered suggestions based on track title
    const suggestions = useMemo(() => {
        if (!trackTitle || !initialized || allFiles.length === 0) return []

        const query = trackTitle.toLowerCase().replace(/[^a-z0-9]/g, ' ')
        const terms = query.split(/\s+/).filter(t => t.length > 2)
        if (terms.length === 0) return []

        return allFiles
            .map(f => {
                const name = f.name.toLowerCase()
                let score = 0
                if (name.includes(query)) score += 10
                for (const term of terms) {
                    if (name.includes(term)) score += 2
                }
                // Prefer chart files (PDF, XML) over audio
                if (f.mimeType.includes('pdf') || f.mimeType.includes('xml') || f.name.endsWith('.pdf') || f.name.endsWith('.xml')) {
                    score += 1
                }
                return { file: f, score }
            })
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => s.file)
    }, [trackTitle, allFiles, initialized])

    const files = useMemo(() => {
        return displayedFiles.filter(f =>
            !f.mimeType.includes(MIME_TYPES.SPREADSHEET) &&
            !f.mimeType.includes(MIME_TYPES.DOCUMENT)
        )
    }, [displayedFiles])

    const handleSelect = (fileId: string) => {
        onMatch(fileId)
        onClose()
    }

    const getCleanName = (name: string) => name.replace(/\.(pdf|musicxml|xml|mxl)$/i, '').replace(/_/g, ' ')

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-card border-border text-foreground max-w-2xl h-[80vh] flex flex-col p-6">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="text-xl font-bold">
                        {trackTitle ? `Link chart for "${trackTitle}"` : 'Link to Music File'}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col flex-1 min-h-0 mt-4">
                    {/* AI Suggestions */}
                    {trackTitle && suggestions.length > 0 && !searchQuery && (
                        <div className="mb-4 shrink-0">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested matches</p>
                            </div>
                            <div className="space-y-1.5">
                                {suggestions.map(file => {
                                    const isAudio = file.mimeType.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name)
                                    const Icon = isAudio ? Music : FileText
                                    return (
                                        <button
                                            key={file.id}
                                            onClick={() => handleSelect(file.id)}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-left group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                <Icon className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                                    {getCleanName(file.name)}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                                    {file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
                                                </p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="border-b border-border/50 mt-4" />
                        </div>
                    )}

                    <Input
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder={trackTitle ? `Search or browse for "${trackTitle}"...` : "Search files..."}
                        className="mb-4 shrink-0 bg-muted border-border"
                        autoFocus
                    />

                    <div className="flex-1 overflow-y-auto -mx-2 px-2">
                        <div className="grid grid-cols-1 gap-2 pb-2">
                            {files.map(file => (
                                <button
                                    key={file.id}
                                    onClick={() => handleSelect(file.id)}
                                    className={cn(
                                        "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                        "bg-muted border border-border hover:bg-muted text-foreground"
                                    )}
                                >
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                        <Music className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{file.name}</div>
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                            {file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
