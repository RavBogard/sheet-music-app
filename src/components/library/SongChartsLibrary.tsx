"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, FileMusic, Folder, FolderOpen, List, LayoutGrid, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

interface DriveFile {
    id: string
    name: string
    mimeType: string
    parents?: string[]
}

interface SongChartsLibraryProps {
    driveFiles: DriveFile[]
    onBack: () => void
    onSelectFile: (file: DriveFile) => void
}

export function SongChartsLibrary({ driveFiles, onBack, onSelectFile }: SongChartsLibraryProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [viewMode, setViewMode] = useState<'alphabetical' | 'folders'>('alphabetical')
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

    // Filter to music/PDF files (not audio)
    const musicFiles = driveFiles.filter(f =>
        !f.mimeType.startsWith('audio/') &&
        !f.name.match(/\.(mp3|m4a|wav|aac|ogg|flac)$/i) &&
        !f.mimeType.includes('folder') &&
        (f.mimeType.includes('pdf') ||
            f.mimeType.includes('xml') ||
            f.name.endsWith('.pdf') ||
            f.name.endsWith('.musicxml') ||
            f.name.endsWith('.xml'))
    )

    // Build folder structure from file names (extract folder-like prefixes)
    const folderStructure = useMemo(() => {
        const folders: { [key: string]: DriveFile[] } = { "All Files": [] }

        musicFiles.forEach(file => {
            // Try to extract folder from filename patterns like "FolderName - FileName.pdf"
            const match = file.name.match(/^(.+?)\s*[-–]\s*/)
            if (match) {
                const folderName = match[1].trim()
                if (!folders[folderName]) folders[folderName] = []
                folders[folderName].push(file)
            } else {
                folders["All Files"].push(file)
            }
        })

        return folders
    }, [musicFiles])

    const toggleFolder = (folderName: string) => {
        const newExpanded = new Set(expandedFolders)
        if (newExpanded.has(folderName)) {
            newExpanded.delete(folderName)
        } else {
            newExpanded.add(folderName)
        }
        setExpandedFolders(newExpanded)
    }

    const filteredFiles = musicFiles
        .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))

    const getCleanName = (name: string) => {
        return name
            .replace(/\.(pdf|musicxml|xml|mxl)$/i, '')
            .replace(/_/g, ' ')
    }

    return (
        <div className="h-screen flex flex-col bg-zinc-950 text-white">
            {/* Header */}
            <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <h1 className="text-2xl font-bold flex-1">Song Charts</h1>

                {/* View Toggle */}
                <div className="flex bg-zinc-800 rounded-lg p-1">
                    <Button
                        size="sm"
                        variant={viewMode === 'alphabetical' ? 'default' : 'ghost'}
                        onClick={() => setViewMode('alphabetical')}
                        className="gap-1"
                    >
                        <List className="h-4 w-4" />
                        A-Z
                    </Button>
                    <Button
                        size="sm"
                        variant={viewMode === 'folders' ? 'default' : 'ghost'}
                        onClick={() => setViewMode('folders')}
                        className="gap-1"
                    >
                        <LayoutGrid className="h-4 w-4" />
                        Folders
                    </Button>
                </div>

                <div className="text-sm text-zinc-500">
                    {musicFiles.length} charts
                </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-zinc-800">
                <div className="relative max-w-xl mx-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search charts..."
                        className="pl-10 h-12 text-lg"
                    />
                </div>
            </div>

            {/* File List */}
            <ScrollArea className="flex-1 p-4">
                {viewMode === 'alphabetical' ? (
                    // A-Z View
                    <div className="max-w-2xl mx-auto space-y-2">
                        {filteredFiles.map(file => (
                            <button
                                key={file.id}
                                onClick={() => onSelectFile(file)}
                                className="w-full text-left p-4 bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-4"
                            >
                                <FileMusic className="h-6 w-6 text-blue-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">
                                        {getCleanName(file.name)}
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-zinc-600" />
                            </button>
                        ))}
                    </div>
                ) : (
                    // Folders View
                    <div className="max-w-2xl mx-auto space-y-2">
                        {Object.entries(folderStructure)
                            .filter(([name, files]) => files.length > 0)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([folderName, files]) => (
                                <div key={folderName}>
                                    <button
                                        onClick={() => toggleFolder(folderName)}
                                        className="w-full text-left p-4 bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-4"
                                    >
                                        {expandedFolders.has(folderName) ? (
                                            <FolderOpen className="h-6 w-6 text-yellow-400 shrink-0" />
                                        ) : (
                                            <Folder className="h-6 w-6 text-yellow-400 shrink-0" />
                                        )}
                                        <div className="flex-1 font-medium">{folderName}</div>
                                        <span className="text-sm text-zinc-500">{files.length} files</span>
                                        <ChevronRight className={`h-5 w-5 text-zinc-600 transition-transform ${expandedFolders.has(folderName) ? 'rotate-90' : ''
                                            }`} />
                                    </button>

                                    {expandedFolders.has(folderName) && (
                                        <div className="ml-6 mt-2 space-y-1 border-l-2 border-zinc-800 pl-4">
                                            {files
                                                .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                                .sort((a, b) => a.name.localeCompare(b.name))
                                                .map(file => (
                                                    <button
                                                        key={file.id}
                                                        onClick={() => onSelectFile(file)}
                                                        className="w-full text-left p-3 bg-zinc-900/50 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-3"
                                                    >
                                                        <FileMusic className="h-5 w-5 text-blue-400 shrink-0" />
                                                        <span className="flex-1 truncate">{getCleanName(file.name)}</span>
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    )
}
