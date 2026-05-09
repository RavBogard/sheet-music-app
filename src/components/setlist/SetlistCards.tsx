"use client"
import { useState, useEffect } from "react"
import { toDate as toDateHelper } from "@/lib/firestore-helpers"

import { Calendar, Download, Plus, CloudOff, CheckCircle2, Loader2, MoreVertical, Copy, PlusSquare, BookmarkPlus, Star, Trash2, CalendarPlus, PlayCircle, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Setlist } from "@/lib/setlist-firebase"
import { isFileCached } from "@/lib/cache-utils"
import { getServiceContext, type ServiceType } from "@/lib/liturgical-calendar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// v52-05: Phase 1 scope for the "Save as Default for {type}" affordance.
// Daniel's 90% workflow is Shabbat morning + Erev Shabbat clones; future
// expansion to other ServiceType values is additive (just add to the set
// + label map, no schema migration).
const PHASE_1_DEFAULT_TYPES: ReadonlyArray<ServiceType> = ['shabbat_morning', 'friday_night']

export const SERVICE_TYPE_LABELS: Partial<Record<ServiceType, string>> = {
    shabbat_morning: 'Shabbat Morning',
    friday_night: 'Friday Night',
}

function inferServiceType(setlist: Setlist): ServiceType | null {
    // Prefer explicit templateType when set to a real service type. 'other'
    // and 'festival' are non-specific buckets — fall through to date-based
    // inference for those.
    const tt = setlist.templateType
    if (tt && tt !== 'other' && tt !== 'festival') {
        return tt as ServiceType
    }
    const date = toDateHelper(setlist.eventDate ?? setlist.date)
    if (!date) return null
    return getServiceContext(date).type
}

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
    onSaveAsDefault?: (setlist: Setlist, serviceType: ServiceType, e: React.MouseEvent) => void
    onDelete: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
    isAdmin: boolean
}

export function UpcomingSetlistCard({ setlist, onPerform, onEdit, navigatingTo, onDownload, isDownloading, onDuplicate, onCloneNextWeek, onSaveAsTemplate, onSaveAsDefault, onDelete, canDelete, canDuplicate, isAdmin }: UpcomingCardProps) {
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
            className={`glass-card hover:border-brand/50 hover:shadow-[0_0_20px_rgba(67,56,202,0.15)] rounded-xl p-4 flex items-center gap-4 group transition-all cursor-pointer relative overflow-hidden active:scale-[0.98] ${isLoading ? 'ring-2 ring-brand opacity-80' : ''} ${navigatingTo && !isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-20">
                    <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
            )}
            
            <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-white/5 shadow-lg bg-gradient-to-br from-brand/20 to-transparent flex items-center justify-center relative">
                <Calendar className="h-8 w-8 text-brand/50 absolute z-0" />
                <div className="absolute inset-0 bg-noise opacity-20 mix-blend-overlay"></div>
                <div className="z-10 font-bold text-brand-foreground/80 text-xl tracking-tighter">
                    {toDateHelper(setlist.eventDate)?.getDate() || '--'}
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <h5 className="text-xl font-bold text-foreground group-hover:text-brand transition-colors truncate tracking-tight">{setlist.name}</h5>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                        <Calendar className="h-3.5 w-3.5" />
                        {toDateHelper(setlist.eventDate)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || 'No Date'}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                        <PlayCircle className="h-3.5 w-3.5" />
                        {setlist.trackCount || 0} Songs
                    </span>
                    {offlineStatus === 'full' && (
                        <span className="text-xs text-green-400 flex items-center gap-1 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Offline ready
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); onEdit(e); }}
                    className="hidden sm:flex border-brand/20 text-foreground hover:bg-brand hover:text-brand-foreground hover:border-brand rounded-full px-4 h-10"
                >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                </Button>
                
                <div
                    onClick={(e) => {
                        e.stopPropagation()
                        onDownload(setlist)
                    }}
                    className="w-10 h-10 hover:bg-white/10 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                    title="Download for Offline"
                >
                    <Download className={`h-5 w-5 text-muted-foreground hover:text-foreground ${isDownloading ? 'animate-pulse text-brand' : ''}`} />
                </div>

                <div className="md:opacity-0 md:group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div className="w-10 h-10 hover:bg-white/10 rounded-full flex items-center justify-center transition-colors cursor-pointer text-muted-foreground hover:text-foreground">
                                <MoreVertical className="h-5 w-5" />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 glass-card border-brand/20">
                            {canDuplicate && (
                                <DropdownMenuItem onClick={(e) => onCloneNextWeek(setlist, e)}>
                                    <PlusSquare className="h-4 w-4 mr-2" />
                                    Clone for Next Week
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(e); }} className="sm:hidden">
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Setlist
                            </DropdownMenuItem>
                            {canDuplicate && (
                                <DropdownMenuItem onClick={(e) => onDuplicate(setlist, e)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Duplicate Setlist
                                </DropdownMenuItem>
                            )}
                            {canDuplicate && (
                                <DropdownMenuItem onClick={(e) => onSaveAsTemplate(setlist, e)}>
                                    <BookmarkPlus className="h-4 w-4 mr-2" />
                                    Save as Template
                                </DropdownMenuItem>
                            )}
                            {(() => {
                                const inferred = inferServiceType(setlist)
                                const canSaveAsDefault =
                                    isAdmin &&
                                    !!onSaveAsDefault &&
                                    !!inferred &&
                                    PHASE_1_DEFAULT_TYPES.includes(inferred)
                                const label = inferred ? SERVICE_TYPE_LABELS[inferred] : null
                                if (!canSaveAsDefault || !label || !inferred) return null
                                return (
                                    <DropdownMenuItem
                                        onClick={(e) => onSaveAsDefault(setlist, inferred, e)}
                                        data-testid="setlist-card-save-as-default"
                                    >
                                        <Star className="h-4 w-4 mr-2" />
                                        Save as Default for {label}
                                    </DropdownMenuItem>
                                )
                            })()}
                            {canDelete && (
                                <DropdownMenuItem onClick={(e) => onDelete(setlist, e)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Setlist
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
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
    onSaveAsDefault?: (setlist: Setlist, serviceType: ServiceType, e: React.MouseEvent) => void
    onDelete?: (setlist: Setlist, e: React.MouseEvent) => void
    canDelete: boolean
    canDuplicate: boolean
    isAdmin: boolean
}

export function SetlistCard({ setlist, onPerform, onEdit, navigatingTo, onDuplicate, onCloneNextWeek, onSaveAsTemplate, onSaveAsDefault, onDelete, canDelete, canDuplicate, isAdmin }: PastCardProps) {
    const isLoading = navigatingTo === setlist.id

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onPerform}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPerform(e as any) }}
            className={`glass-card hover:border-brand/50 hover:shadow-[0_0_20px_rgba(67,56,202,0.15)] rounded-xl p-4 flex items-center gap-4 group transition-all cursor-pointer relative overflow-hidden active:scale-[0.98] ${isLoading ? 'ring-2 ring-brand opacity-80' : ''} ${navigatingTo && !isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-20 rounded-xl">
                    <Loader2 className="h-5 w-5 animate-spin text-brand" />
                </div>
            )}
            
            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/5 shadow-md bg-gradient-to-br from-surface-container to-background flex items-center justify-center relative grayscale group-hover:grayscale-0 transition-all">
                <Calendar className="h-6 w-6 text-muted-foreground absolute z-0" />
                <div className="absolute inset-0 bg-noise opacity-10 mix-blend-overlay"></div>
                <div className="z-10 font-bold text-muted-foreground/80 text-sm tracking-tighter">
                    {toDateHelper(setlist.eventDate)?.getDate() || '--'}
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <h5 className="text-lg font-semibold text-foreground group-hover:text-brand transition-colors truncate tracking-tight">{setlist.name}</h5>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {toDateHelper(setlist.eventDate)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || 'No Date'}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <PlayCircle className="h-3 w-3" />
                        {setlist.trackCount || 0} Songs
                    </span>
                </div>
            </div>

            {/* Action Menu */}
            <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onEdit(e); }}
                    className="h-10 w-10 hover:bg-white/10 rounded-full text-muted-foreground hover:text-foreground"
                >
                    <Pencil className="h-4 w-4" />
                </Button>
                
                {(canDuplicate || canDelete) && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div className="h-10 w-10 hover:bg-white/10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer">
                                <MoreVertical className="h-5 w-5" />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 glass-card border-brand/20">
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
                            {(() => {
                                const inferred = inferServiceType(setlist)
                                const canSaveAsDefault =
                                    isAdmin &&
                                    !!onSaveAsDefault &&
                                    !!inferred &&
                                    PHASE_1_DEFAULT_TYPES.includes(inferred)
                                const label = inferred ? SERVICE_TYPE_LABELS[inferred] : null
                                if (!canSaveAsDefault || !label || !inferred) return null
                                return (
                                    <DropdownMenuItem
                                        onClick={(e) => onSaveAsDefault(setlist, inferred, e)}
                                        data-testid="setlist-card-save-as-default"
                                    >
                                        <Star className="h-4 w-4 mr-2" />
                                        Save as Default for {label}
                                    </DropdownMenuItem>
                                )
                            })()}
                            {canDelete && (
                                <DropdownMenuItem onClick={(e) => onDelete?.(setlist, e)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Setlist
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
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
        <div
            role="button"
            tabIndex={0}
            onClick={() => onCreate(date)}
            className="glass-card hover:border-brand/30 border-dashed rounded-xl p-4 flex items-center gap-4 group transition-all cursor-pointer relative overflow-hidden active:scale-[0.98] opacity-60 hover:opacity-100"
        >
            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 border-dashed border-white/20 bg-background/30 flex items-center justify-center group-hover:border-brand/50 group-hover:bg-brand/10 transition-colors">
                <Plus className="h-6 w-6 text-muted-foreground group-hover:text-brand transition-colors" />
            </div>
            
            <div className="flex-1 min-w-0">
                <h5 className="text-lg font-semibold text-muted-foreground group-hover:text-foreground transition-colors truncate tracking-tight">
                    Plan Service
                </h5>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                </div>
            </div>
        </div>
    )
}
