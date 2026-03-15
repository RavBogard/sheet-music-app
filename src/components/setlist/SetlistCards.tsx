"use client"
import { useState, useEffect } from "react"
import { toDate as toDateHelper } from "@/lib/firestore-helpers"

import { Globe, Lock, Calendar, Download, Plus, CloudOff, CheckCircle2, Loader2, MoreVertical, Copy, PlusSquare, BookmarkPlus, Trash2, CalendarPlus, PlayCircle, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Setlist } from "@/lib/setlist-firebase"
import { isFileCached } from "@/lib/cache-utils"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/* ─── Upcoming Service Card ─── */

export interface UpcomingCardProps {
    setlist: Setlist
    onPerform: (e: React.MouseEvent) => void
    onEdit: (e: React.MouseEvent) => void
    navigatingTo: string | null
    onDownload: (setlist: Setlist) => void
    isDownloading: boolean
    onDuplicate: (setlist: Setlist, e: React.MouseEvent) => void
    onCloneNextWeek: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsTemplate: (setlist: Setlist, e: React.MouseEvent) => void
    onDelete: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
}

export function UpcomingSetlistCard({ setlist, onPerform, onEdit, navigatingTo, onDownload, isDownloading, onDuplicate, onCloneNextWeek, onSaveAsTemplate, onDelete, canDelete, canDuplicate }: UpcomingCardProps) {
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
        <div
            role="button"
            tabIndex={0}
            onClick={onPerform}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPerform(e as any) }}
            className={`h-auto w-full flex-col bg-card/60 backdrop-blur-md hover:bg-brand/5 border-l-4 border-l-brand border border-brand/10 rounded-2xl p-4 md:p-6 text-left whitespace-normal items-start group relative overflow-hidden shadow-sm active:scale-100 ${isLoading ? 'ring-2 ring-brand opacity-80' : ''} ${navigatingTo && !isLoading ? 'opacity-50 pointer-events-none' : ''} ${!!navigatingTo ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-20">
                    <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
            )}
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Calendar className="h-24 w-24 -mr-4 -mt-4 text-brand" />
            </div>

            <div className="relative z-10 w-full">
                <div className="flex justify-between items-start mb-2 w-full gap-2">
                    <div className="inline-flex items-center gap-2 bg-brand/10 text-foreground px-2 py-1 rounded text-xs font-bold uppercase tracking-wider shrink-0">
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
                            <Download className={`h-4 w-4 text-muted-foreground hover:text-foreground ${isDownloading ? 'animate-pulse text-brand' : ''}`} />
                        </div>

                        {/* Overflow Menu — always visible on touch, hover-reveal on desktop */}
                        <div className="md:opacity-0 md:group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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
                <h3 className="text-2xl font-bold text-foreground mb-1 group-hover:text-brand transition-colors">{setlist.name}</h3>
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

                <div className="mt-4 flex flex-col sm:flex-row items-center gap-2 w-full">
                    <Button
                        variant="secondary"
                        onClick={onEdit}
                        className="flex-1 rounded-xl font-bold bg-muted hover:bg-muted/80 text-foreground"
                    >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Setlist
                    </Button>
                    
                    {/* Prominent "Duplicate for next week" button */}
                    {canDuplicate && (
                        <div
                            onClick={(e) => {
                                e.stopPropagation()
                                onCloneNextWeek(setlist, e)
                            }}
                            className="flex-1 flex items-center justify-center gap-2 py-2 h-10 rounded-xl bg-brand/10 hover:bg-brand/20 text-foreground text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border border-brand/20"
                        >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            Clone
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ─── Past / Library Card ─── */

export interface PastCardProps {
    setlist: Setlist
    onPerform: (e: React.MouseEvent) => void
    onEdit: (e: React.MouseEvent) => void
    navigatingTo: string | null
    onDuplicate: (setlist: Setlist, e: React.MouseEvent) => void
    onCloneNextWeek?: (setlist: Setlist, e: React.MouseEvent) => void
    onSaveAsTemplate?: (setlist: Setlist, e: React.MouseEvent) => void
    onDelete?: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
}

export function SetlistCard({ setlist, onPerform, onEdit, navigatingTo, onDuplicate, onCloneNextWeek, onSaveAsTemplate, onDelete, canDelete, canDuplicate }: PastCardProps) {
    const isLoading = navigatingTo === setlist.id

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onPerform}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPerform(e as any) }}
            className={`h-auto w-full flex-col bg-card/60 backdrop-blur-md hover:bg-brand/5 border border-brand/10 rounded-2xl p-4 md:p-6 text-left whitespace-normal items-start group relative shadow-sm active:scale-100 ${isLoading ? 'ring-2 ring-brand opacity-80' : ''} ${navigatingTo && !isLoading ? 'opacity-50 pointer-events-none' : ''} ${!!navigatingTo ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-20 rounded-xl">
                    <Loader2 className="h-5 w-5 animate-spin text-brand" />
                </div>
            )}
            <div className="flex items-start justify-between mb-2 w-full gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="shrink-0">
                        {setlist.isPublic ? (
                            <Globe className="h-4 w-4 text-muted-foreground/60" />
                        ) : (
                            <Lock className="h-4 w-4 text-muted-foreground/60" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <h3 className="text-xl font-semibold truncate text-foreground" title={setlist.name}>{setlist.name}</h3>
                        {setlist.eventDate && (
                            <span className="text-xs text-muted-foreground">
                                {toDateHelper(setlist.eventDate)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })}
                            </span>
                        )}
                    </div>
                </div>

                {/* Action Menu (MoreVertical) */}
                <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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
            <div className="mt-2 text-muted-foreground text-sm mb-4">
                {setlist.trackCount || 0} songs{setlist.rabbi ? ` · Rabbi ${setlist.rabbi}` : ''}
            </div>

            <div className="mt-auto pt-2 flex flex-col sm:flex-row items-center gap-2 w-full">
                <Button
                    variant="secondary"
                    onClick={onEdit}
                    className="flex-1 rounded-xl font-bold bg-muted hover:bg-muted/80 text-foreground"
                >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                </Button>
                
                {/* Quick clone action */}
                {canDuplicate && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation()
                            onCloneNextWeek?.(setlist, e)
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 h-10 text-xs text-brand/80 hover:text-brand hover:bg-brand/5 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-brand/20"
                    >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        <span>Clone</span>
                    </div>
                )}
            </div>
        </div>
    )
}

/* ─── Placeholder Card (Plan Service) ─── */

interface PlaceholderCardProps {
    date: Date
    onCreate: (date: Date) => void
}

export function PlaceholderCard({ date, onCreate }: PlaceholderCardProps) {
    return (
        <Button
            variant="ghost"
            onClick={() => onCreate(date)}
            className="h-auto border-2 border-dashed border-brand/10 hover:border-brand/30 hover:bg-brand/5 rounded-2xl p-4 md:p-6 text-left whitespace-normal flex flex-col justify-center items-center gap-3 group opacity-70 hover:opacity-100 active:scale-100"
        >
            <div className="h-12 w-12 rounded-full bg-card flex items-center justify-center group-hover:bg-brand/15 group-hover:text-foreground transition-colors">
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
            <div className="text-xs font-medium text-foreground bg-brand/10 px-3 py-1 rounded-full uppercase tracking-wider">
                Plan Service
            </div>
        </Button>
    )
}
