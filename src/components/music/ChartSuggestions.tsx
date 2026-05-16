"use client"

import { useMemo } from 'react'
import { useLibraryStore } from '@/lib/library-store'
import { useLibrary } from '@/hooks/use-library'
import { DriveFile } from '@/types/models'
import { FileText, Music, PlusCircle } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface ChartSuggestionsProps {
    trackName?: string
    currentFileId?: string
    isReplaceMode?: boolean
}

export function ChartSuggestions({ trackName, currentFileId }: ChartSuggestionsProps) {
    const { allFiles, initialized } = useLibraryStore()
    const { isLoading: searching } = useLibrary()
    const router = useRouter()

    // Simple fuzzy match algorithm (since fuse might not be initialized cleanly if allFiles is fresh)
    const suggestions = useMemo(() => {
        if (!trackName || !initialized || allFiles.length === 0) return []

        const query = trackName.toLowerCase().replace(/[^a-z0-9]/g, ' ')
        const terms = query.split(/\s+/).filter(t => t.length > 2)

        if (terms.length === 0) return []

        // Score files
        const scored = allFiles
            .filter(f => f.id !== currentFileId && !f.mimeType.includes('folder'))
            .map(f => {
                const name = f.name.toLowerCase()
                let score = 0
                // Exact match gets highest score
                if (name.includes(query)) score += 10

                // Partial term matches
                for (const term of terms) {
                    if (name.includes(term)) score += 2
                }

                // Prefer PDFs and XMLs over Audio for chart suggestions —
                // but only as a tie-break among rows that ALREADY have some
                // name-relevance signal. F-14 (2026-05-16 bugstomp): the
                // unconditional +1 PDF bonus made every PDF in the library
                // (~300+) score 1 regardless of term match, blowing past
                // the score>0 filter and surfacing the alphabetical-first
                // 3 entries as "matches" for broken-bond rows whose track
                // name happened to share no tokens with any chart title.
                if (
                    score > 0 &&
                    (f.mimeType.includes('pdf') ||
                        f.mimeType.includes('xml') ||
                        f.name.endsWith('.pdf') ||
                        f.name.endsWith('.xml'))
                ) {
                    score += 1
                }

                return { file: f, score }
            })
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(s => s.file)

        // Return top 3
        return scored.slice(0, 3)
    }, [trackName, allFiles, initialized, currentFileId])

    const getCleanName = (name: string) => name.replace(/\.(pdf|musicxml|xml|mxl)$/i, '').replace(/_/g, ' ')

    const handleSelect = (file: DriveFile) => {
        // No file assigned — perhaps we just navigate
        toast.success(`Opening ${getCleanName(file.name)}`)
        router.push(`/perform/${file.id}`)
    }

    if (!trackName) return null

    if (searching) {
        return <div className="text-sm text-muted-foreground animate-pulse mt-6">Searching library for suggestions...</div>
    }

    if (suggestions.length === 0) {
        return (
            <div className="mt-6">
                <p className="text-sm text-muted-foreground">We couldn&apos;t find any obvious matches in your library.</p>
                <Button
                    variant="outline"
                    onClick={() => router.push(`/library?q=${encodeURIComponent(trackName)}`)}
                    className="mt-3"
                >
                    Search Library
                </Button>
            </div>
        )
    }

    return (
        <div className="mt-8 text-left max-w-sm w-full mx-auto">
            <p className="text-sm text-muted-foreground mb-3 text-center">Are you looking for one of these?</p>
            <div className="space-y-2">
                {suggestions.map(file => {
                    const isAudio = file.mimeType.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name)
                    const Icon = isAudio ? Music : FileText
                    return (
                        <Button
                            variant="outline"
                            key={file.id}
                            onClick={() => handleSelect(file)}
                            className="w-full h-auto justify-start gap-3 p-3 rounded-lg bg-muted/50 text-left group"
                        >
                            <Icon className="w-5 h-5 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                    {getCleanName(file.name)}
                                </p>
                            </div>
                            <PlusCircle className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                        </Button>
                    )
                })}
            </div>
        </div>
    )
}
