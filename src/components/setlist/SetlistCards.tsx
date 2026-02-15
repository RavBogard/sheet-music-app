"use client"

import { Globe, Lock, Calendar, Copy, Trash2, Download, Plus } from "lucide-react"
import { Setlist } from "@/lib/setlist-firebase"

/* ─── Upcoming Service Card ─── */

interface UpcomingCardProps {
    setlist: Setlist
    onClick: () => void
    onDownload: (setlist: Setlist) => void
    isDownloading: boolean
}

export function UpcomingSetlistCard({ setlist, onClick, onDownload, isDownloading }: UpcomingCardProps) {
    return (
        <button
            onClick={onClick}
            className="bg-card hover:bg-muted border-l-4 border-l-blue-500 border-y border-r border-border rounded-r-xl p-6 text-left transition-all group relative overflow-hidden"
        >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Calendar className="h-24 w-24 -mr-4 -mt-4 text-blue-500" />
            </div>

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-2">
                    <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-600 dark:text-blue-300 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                        {new Date(setlist.eventDate!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    <div
                        onClick={(e) => {
                            e.stopPropagation()
                            onDownload(setlist)
                        }}
                        className="p-2 -mr-2 -mt-2 hover:bg-accent rounded-full transition-colors cursor-pointer"
                        title="Download for Offline"
                    >
                        <Download className={`h-4 w-4 text-muted-foreground hover:text-foreground ${isDownloading ? 'animate-pulse text-blue-400' : ''}`} />
                    </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-1 group-hover:text-blue-500 dark:group-hover:text-blue-300 transition-colors">{setlist.name}</h3>
                {setlist.ownerName && <p className="text-muted-foreground text-sm">Leader: {setlist.ownerName}</p>}

                <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{setlist.trackCount || 0} songs</span>
                    {setlist.isPublic && <Globe className="h-3 w-3" />}
                </div>
            </div>
        </button>
    )
}

/* ─── Past / Library Card ─── */

interface PastCardProps {
    setlist: Setlist
    onClick: () => void
    onDuplicate?: (setlist: Setlist, e: React.MouseEvent) => void
    onDelete?: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
}

export function SetlistCard({ setlist, onClick, onDuplicate, onDelete, canDelete, canDuplicate }: PastCardProps) {
    return (
        <button
            onClick={onClick}
            className="bg-card hover:bg-muted border border-border rounded-xl p-6 text-left transition-all group relative"
        >
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    {setlist.isPublic ? (
                        <Globe className="h-4 w-4 text-muted-foreground/60" />
                    ) : (
                        <Lock className="h-4 w-4 text-muted-foreground/60" />
                    )}
                    <div className="flex flex-col">
                        <h3 className="text-xl font-semibold truncate max-w-[200px] text-foreground">{setlist.name}</h3>
                        {setlist.eventDate && (
                            <span className="text-xs text-muted-foreground">
                                {new Date(setlist.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })}
                            </span>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canDuplicate && (
                        <div
                            className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground"
                            onClick={(e) => onDuplicate?.(setlist, e)}
                            title="Duplicate"
                        >
                            <Copy className="h-4 w-4" />
                        </div>
                    )}
                    {canDelete && (
                        <div
                            className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-red-400"
                            onClick={(e) => onDelete?.(setlist, e)}
                            title="Delete"
                        >
                            <Trash2 className="h-4 w-4" />
                        </div>
                    )}
                </div>
            </div>

            {setlist.isPublic && setlist.ownerName && (
                <div className="text-sm text-muted-foreground">
                    by {setlist.ownerName}
                </div>
            )}
            <div className="mt-2 text-muted-foreground text-sm">
                {setlist.trackCount || 0} songs
            </div>
        </button>
    )
}

/* ─── Placeholder Card (Plan Service) ─── */

interface PlaceholderCardProps {
    date: Date
    onCreate: (date: Date) => void
}

export function PlaceholderCard({ date, onCreate }: PlaceholderCardProps) {
    return (
        <button
            onClick={() => onCreate(date)}
            className="border border-dashed border-border hover:border-muted-foreground hover:bg-card rounded-xl p-6 text-left transition-all flex flex-col justify-center items-center gap-3 group opacity-70 hover:opacity-100"
        >
            <div className="h-12 w-12 rounded-full bg-card flex items-center justify-center group-hover:bg-blue-600/20 group-hover:text-blue-400 transition-colors">
                <Plus className="h-6 w-6" />
            </div>
            <div className="text-center">
                <div className="font-bold text-foreground">
                    {date.toLocaleDateString('en-US', { weekday: 'long' })}
                </div>
                <div className="text-sm text-muted-foreground">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
            </div>
            <div className="text-xs font-medium text-blue-500/80 bg-blue-500/10 px-3 py-1 rounded-full uppercase tracking-wider">
                Plan Service
            </div>
        </button>
    )
}
