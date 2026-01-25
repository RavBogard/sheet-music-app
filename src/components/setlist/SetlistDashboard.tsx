"use client"

import { useState, useEffect } from "react"
import { SetlistService, Setlist } from "@/lib/setlist-firebase"
import { ChevronLeft, Plus, FileText, Trash2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SetlistDashboardProps {
    onBack: () => void
    onSelect: (setlist: Setlist) => void
    onImport: () => void
    onCreateNew: () => void
}

export function SetlistDashboard({ onBack, onSelect, onImport, onCreateNew }: SetlistDashboardProps) {
    const [setlists, setSetlists] = useState<Setlist[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const unsubscribe = SetlistService.subscribeToSetlists((data) => {
            setSetlists(data)
            setLoading(false)
        })
        return () => unsubscribe()
    }, [])

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (confirm("Delete this setlist?")) {
            await SetlistService.deleteSetlist(id)
        }
    }

    return (
        <div className="h-screen flex flex-col bg-zinc-950 text-white">
            {/* Header */}
            <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <h1 className="text-2xl font-bold flex-1">My Setlists</h1>
                <Button onClick={onImport} className="h-12 px-6 gap-2">
                    <FileText className="h-5 w-5" />
                    Import from Drive
                </Button>
                <Button onClick={onCreateNew} variant="outline" className="h-12 px-6 gap-2">
                    <Plus className="h-5 w-5" />
                    New Setlist
                </Button>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 p-6">
                {loading && (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-xl text-zinc-500">Loading setlists...</div>
                    </div>
                )}

                {!loading && setlists.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <div className="text-xl text-zinc-500">No setlists yet</div>
                        <Button onClick={onImport} size="lg" className="gap-2">
                            <FileText className="h-5 w-5" />
                            Import your first setlist
                        </Button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {setlists.map(setlist => (
                        <button
                            key={setlist.id}
                            onClick={() => onSelect(setlist)}
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl p-6 text-left transition-all group"
                        >
                            <div className="flex items-start justify-between">
                                <h3 className="text-xl font-semibold truncate flex-1">{setlist.name}</h3>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                                    onClick={(e) => handleDelete(setlist.id, e)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex items-center gap-2 mt-3 text-zinc-500">
                                <Calendar className="h-4 w-4" />
                                <span className="text-sm">
                                    {setlist.date?.toDate?.()?.toLocaleDateString() || "No date"}
                                </span>
                            </div>
                            <div className="mt-2 text-zinc-400">
                                {setlist.trackCount || setlist.tracks?.length || 0} songs
                            </div>
                        </button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    )
}
