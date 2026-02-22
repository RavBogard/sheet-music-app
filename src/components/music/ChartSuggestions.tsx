"use client"

import { useEffect, useState, useMemo } from 'react'
import { useLibraryStore } from '@/lib/library-store'
import { useLibrary } from '@/hooks/use-library'
import { DriveFile } from '@/types/models'
import { FileText, Music, PlusCircle } from 'lucide-react'
import { useSetlistStore } from '@/lib/setlist-store'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface ChartSuggestionsProps {
    trackName?: string
    currentFileId?: string
    isReplaceMode?: boolean
}

export function ChartSuggestions({ trackName, currentFileId, isReplaceMode }: ChartSuggestionsProps) {
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

                // Prefer PDFs and XMLs over Audio for chart suggestions
                if (f.mimeType.includes('pdf') || f.mimeType.includes('xml') || f.name.endsWith('.pdf') || f.name.endsWith('.xml')) {
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
        const isXml = file.mimeType.includes('xml') || file.name.endsWith('.xml') || file.name.endsWith('.musicxml')
        const type = isXml ? 'musicxml' : 'pdf'

        // No file assigned — perhaps we just navigate
        toast.success(`Opening ${getCleanName(file.name)}`)
        router.push(`/perform/${file.id}`)
    }

    if (!trackName) return null

    if (searching) {
        return <div className="text-sm text-zinc-500 animate-pulse mt-6">Searching library for suggestions...</div>
    }

    if (suggestions.length === 0) {
        return (
            <div className="mt-6">
                <p className="text-sm text-zinc-400">We couldn't find any obvious matches in your library.</p>
                <button
                    onClick={() => router.push(`/library?q=${encodeURIComponent(trackName)}`)}
                    className="mt-3 px-4 py-2 border border-zinc-700 rounded-lg text-sm hover:bg-zinc-800 transition-colors"
                >
                    Search Library
                </button>
            </div>
        )
    }

    return (
        <div className="mt-8 text-left max-w-sm w-full mx-auto">
            <p className="text-sm text-zinc-400 mb-3 text-center">Are you looking for one of these?</p>
            <div className="space-y-2">
                {suggestions.map(file => {
                    const isAudio = file.mimeType.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name)
                    const Icon = isAudio ? Music : FileText
                    return (
                        <button
                            key={file.id}
                            onClick={() => handleSelect(file)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20 hover:bg-zinc-800/60 transition-colors text-left group"
                        >
                            <Icon className="w-5 h-5 text-blue-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-blue-300 transition-colors">
                                    {getCleanName(file.name)}
                                </p>
                            </div>
                            <PlusCircle className="w-4 h-4 text-zinc-500 group-hover:text-blue-400" />
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
