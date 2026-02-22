"use client"
import { useState, useEffect } from "react"
import { toDate as toDateHelper } from "@/lib/firestore-helpers"

import { Globe, Lock, Calendar, Download, Plus, CloudOff, CheckCircle2, Loader2, MoreVertical, Copy, PlusSquare, BookmarkPlus, Trash2 } from "lucide-react"
import { Setlist } from "@/lib/setlist-firebase"
import { isFileCached } from "@/lib/cache-utils"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/* ─── Upcoming Service Card ─── */

interface UpcomingCardProps {
    setlist: Setlist
    onClick: () => void
    navigatingTo?: string | null
    onDownload: (setlist: Setlist) => void
    isDownloading: boolean
    onDuplicate: (setlist: Setlist, e: React.MouseEvent) => void
    onCloneNextWeek: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsTemplate: (setlist: Setlist, e: React.MouseEvent) => void
    onDelete: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
}

export function UpcomingSetlistCard({ setlist, onClick, navigatingTo, onDownload, isDownloading, onDuplicate, onCloneNextWeek, onSaveAsTemplate, onDelete, canDelete, canDuplicate }: UpcomingCardProps) {
    const isLoading = navigatingTo === setlist.id
    const [offlineStatus, setOfflineStatus] = useState<'checking' | 'full' | 'partial' | 'none'>('checking')

    useEffect(() => {
        const fileIds = (setlist.tracks || []).map(t => t.fileId).filter(Boolean) as string[]
        if (fileIds.length === 0) { setOfflineStatus('none'); return }
        Promise.all(fileIds.map(id => isFileCached(id))).then(results => {
            const cached = results.filter(Boolean).length
            setOfflineStatus(cached === fileIds.length ? 'full' : cached > 0 ? 'partial' : 'none')
        }).catch(() => setOfflineStatus('none'))
    }, [setlist.tracks])
    return (
        <button
            onClick={onClick}
            disabled={!!navigatingTo}
            className={`bg-card/60 backdrop-blur-md hover:bg-muted/80 border-l-4 border-l-blue-500 border border-border rounded-2xl p-6 text-left fluid-interaction group relative overflow-hidden shadow-sm ${isLoading ? 'ring-2 ring-blue-500 opacity-80' : ''} ${navigatingTo && !isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-20">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
            )}
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Calendar className="h-24 w-24 -mr-4 -mt-4 text-blue-500" />
            </div>

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-2">
                    <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-600 dark:text-blue-300 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                        {toDateHelper(setlist.eventDate)?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    <div className="flex gap-1 items-center">
                        <div
                            onClick={(e) => {
                                e.stopPropagation()
                                onDownload(setlist)
                            }}
                            className="p-2 hover:bg-accent rounded-full transition-colors cursor-pointer"
                            title="Download for Offline"
                        >
                            <Download className={`h-4 w-4 text-muted-foreground hover:text-foreground ${isDownloading ? 'animate-pulse text-blue-400' : ''}`} />
                        </div>

                        {/* Overflow Menu */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <div className="p-2 hover:bg-accent rounded-full transition-colors cursor-pointer -mr-2 text-muted-foreground hover:text-foreground">
                                        <MoreVertical className="h-4 w-4" />
                                    </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    {canDuplicate && (
                                        <DropdownMenuItem onClick={(e) => onDuplicate(setlist, e)}>
                                            <Copy className="h-4 w-4 mr-2" />
                                            Duplicate Setlist
                                        </DropdownMenuItem>
                                    )}
                                    {canDuplicate && (
                                        <DropdownMenuItem onClick={(e) => onCloneNextWeek(setlist, e)}>
                                            <PlusSquare className="h-4 w-4 mr-2" />
                                            Clone for Next Week
                                        </DropdownMenuItem>
                                    )}
                                    {canDuplicate && (
                                        <DropdownMenuItem onClick={(e) => onSaveAsTemplate(setlist, e)}>
                                            <BookmarkPlus className="h-4 w-4 mr-2" />
                                            Save as Template
                                        </DropdownMenuItem>
                                    )}
                                    {canDelete && (
                                        <DropdownMenuItem onClick={(e) => onDelete(setlist, e)} className="text-red-500 focus:text-red-500">
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete Setlist
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-1 group-hover:text-blue-500 dark:group-hover:text-blue-300 transition-colors">{setlist.name}</h3>
                {setlist.ownerName && <p className="text-muted-foreground text-sm">Leader: {setlist.ownerName}</p>}
                {setlist.rabbi && <p className="text-muted-foreground text-sm">Rabbi {setlist.rabbi}</p>}

                <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{setlist.trackCount || 0} songs</span>
                    {setlist.isPublic && <Globe className="h-3 w-3" />}
                    {offlineStatus === 'full' && (
                        <span className="flex items-center gap-1 text-green-500 text-xs">
                            <CheckCircle2 className="h-3 w-3" /> Offline ready
                        </span>
                    )}
                    {offlineStatus === 'partial' && (
                        <span className="flex items-center gap-1 text-amber-500 text-xs">
                            <CloudOff className="h-3 w-3" /> Partial
                        </span>
                    )}
                </div>
            </div>
        </button>
    )
}

/* ─── Past / Library Card ─── */

interface PastCardProps {
    setlist: Setlist
    onClick: () => void
    navigatingTo?: string | null
    onDuplicate?: (setlist: Setlist, e: React.MouseEvent) => void
    onCloneNextWeek?: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsTemplate?: (setlist: Setlist, e: React.MouseEvent) => void
    onDelete?: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
}

export function SetlistCard({ setlist, onClick, navigatingTo, onDuplicate, onCloneNextWeek, onSaveAsTemplate, onDelete, canDelete, canDuplicate }: PastCardProps) {
    const isLoading = navigatingTo === setlist.id

    return (
        <button
            onClick={onClick}
            disabled={!!navigatingTo}
            className={`bg-card/60 backdrop-blur-md hover:bg-muted/80 border border-border rounded-2xl p-6 text-left fluid-interaction group relative shadow-sm ${isLoading ? 'ring-2 ring-blue-500 opacity-80' : ''} ${navigatingTo && !isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-20 rounded-xl">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                </div>
            )}
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
                                {toDateHelper(setlist.eventDate)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })}
                            </span>
                        )}
                    </div>
                </div>

                {/* Action Menu (MoreVertical) */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    {(canDuplicate || canDelete) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <div className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground cursor-pointer">
                                    <MoreVertical className="h-4 w-4" />
                                </div>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                {canDuplicate && (
                                    <>
                                        <DropdownMenuItem onClick={(e) => onDuplicate?.(setlist, e)}>
                                            <Copy className="h-4 w-4 mr-2" />
                                            Duplicate Setlist
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => onCloneNextWeek?.(setlist, e)}>
                                            <PlusSquare className="h-4 w-4 mr-2" />
                                            Clone for Next Week
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => onSaveAsTemplate?.(setlist, e)}>
                                            <BookmarkPlus className="h-4 w-4 mr-2" />
                                            Save as Template
                                        </DropdownMenuItem>
                                    </>
                                )}
                                {canDelete && (
                                    <DropdownMenuItem onClick={(e) => onDelete?.(setlist, e)} className="text-red-500 focus:text-red-500">
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete Setlist
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            {setlist.isPublic && setlist.ownerName && (
                <div className="text-sm text-muted-foreground">
                    by {setlist.ownerName}
                </div>
            )}
            <div className="mt-2 text-muted-foreground text-sm">
                {setlist.trackCount || 0} songs{setlist.rabbi ? ` · Rabbi ${setlist.rabbi}` : ''}
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
            className="border-2 border-dashed border-border/80 hover:border-blue-500/50 hover:bg-blue-500/5 rounded-2xl p-6 text-left fluid-interaction flex flex-col justify-center items-center gap-3 group opacity-70 hover:opacity-100"
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
