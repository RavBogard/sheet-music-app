"use client"
import { toDate as toDateHelper } from "@/lib/firestore-helpers"

import { useState, useEffect, useMemo } from "react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import buildInfo from "@/build-info.json"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { useCongregation } from "@/lib/congregation-context"
import { ChevronLeft, Plus, LogIn, Calendar, Sparkles } from "lucide-react"
import { CalendarView } from "@/components/calendar/CalendarView"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useOffline } from "@/hooks/use-offline"
import { toast } from "sonner"

import { UpcomingSetlistCard, SetlistCard, PlaceholderCard } from "./SetlistCards"
import { DeleteSetlistDialog, DuplicateSetlistDialog, TransferSetlistDialog } from "./SetlistDialogs"
import { SetlistToolbar } from "./SetlistToolbar"
import { getNextFriday, getNextSaturday, getFullServiceContext } from "@/lib/liturgical-calendar"
import { getTemplate, buildSetlistFromTemplate, generateSetlistName } from "@/lib/liturgical-templates"
import { useLibraryStore } from "@/lib/library-store"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { logger } from "@/lib/logger"

interface SetlistDashboardProps {
    onBack: () => void
    onSelect: (setlist: Setlist) => void
    onCreateNew: () => void
}

export function SetlistDashboard({ onBack, onSelect, onCreateNew }: SetlistDashboardProps) {
    const { user, signIn } = useAuth()
    const congregation = useCongregation()
    const { downloadSetlist, isDownloading } = useOffline()

    const [personalSetlists, setPersonalSetlists] = useState<Setlist[]>([])
    const [publicSetlists, setPublicSetlists] = useState<Setlist[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'personal' | 'public'>('public')
    const [view, setView] = useState<'list' | 'calendar'>('list')
    const [searchQuery, setSearchQuery] = useState("")
    const [rabbiFilter, setRabbiFilter] = useState("")

    // Dialog state
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [setlistToDelete, setSetlistToDelete] = useState<Setlist | null>(null)
    const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false)
    const [setlistToDuplicate, setSetlistToDuplicate] = useState<Setlist | null>(null)
    const [showTransferDialog, setShowTransferDialog] = useState(false)
    const [selectedSetlistForTransfer, setSelectedSetlistForTransfer] = useState<Setlist | null>(null)
    const [transferEmail, setTransferEmail] = useState("")

    const setlistService = useMemo(() => {
        return createSetlistService(user?.uid || null, user?.displayName || null)
    }, [user?.uid, user?.displayName])

    // Subscribe to personal setlists
    useEffect(() => {
        if (!user?.uid || !setlistService) {
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        const unsubscribe = setlistService.subscribeToPersonalSetlists(
            (data) => { setPersonalSetlists(data); setLoading(false) },
            (err) => {
                logger.error("Personal setlist subscription error:", err)
                setError("Failed to load your personal setlists. Please check your connection.")
                setLoading(false)
            }
        )
        return () => unsubscribe()
    }, [setlistService, user?.uid])

    // Subscribe to public setlists
    useEffect(() => {
        if (!setlistService) return
        const unsubscribe = setlistService.subscribeToPublicSetlists(
            (data) => setPublicSetlists(data),
            (err) => logger.error("Public setlist subscription error:", err)
        )
        return () => unsubscribe()
    }, [setlistService])

    // Force 'public' tab if guest
    useEffect(() => {
        if (!user?.uid) setActiveTab('public')
    }, [user?.uid])

    /* ─── Handlers ─── */

    const handleDeleteClick = (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        if (setlist.isPublic && setlist.ownerId !== user?.uid) {
            toast.error("You can only delete setlists you created")
            return
        }
        setSetlistToDelete(setlist)
        setDeleteConfirmOpen(true)
    }

    const confirmDelete = async () => {
        if (!setlistService || !setlistToDelete) return
        try {
            await setlistService.deleteSetlist(setlistToDelete.id, setlistToDelete.isPublic || false)
            toast.success("Setlist deleted")
        } catch {
            toast.error("Failed to delete setlist")
        }
        setDeleteConfirmOpen(false)
        setSetlistToDelete(null)
    }

    const handleDuplicateClick = (setlist: Setlist, e: React.MouseEvent) => {
        e.stopPropagation()
        setSetlistToDuplicate(setlist)
        setDuplicateConfirmOpen(true)
    }

    const confirmDuplicate = async () => {
        if (!setlistService || !user || !setlistToDuplicate) return
        try {
            await setlistService.copyToPersonal(setlistToDuplicate.id, setlistToDuplicate)
            toast.success("Setlist duplicated successfully!")
            setActiveTab('personal')
        } catch {
            toast.error("Failed to duplicate setlist.")
        }
        setDuplicateConfirmOpen(false)
        setSetlistToDuplicate(null)
    }

    const handleTransfer = async () => {
        if (!selectedSetlistForTransfer || !transferEmail) return
        try {
            const res = await apiFetch('/api/setlist/transfer', {
                method: 'POST',
                body: JSON.stringify({ setlistId: selectedSetlistForTransfer.id, newOwnerEmail: transferEmail })
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Transfer Successful!")
            setShowTransferDialog(false)
            setTransferEmail("")
            setSelectedSetlistForTransfer(null)
        } catch (err: unknown) {
            toast.error(`Transfer Failed: ${err instanceof Error ? err.message : "Unknown error"}`)
        }
    }

    const handleCreateFromCalendar = async (date: Date, type?: 'shabbat_morning') => {
        if (!setlistService || !user) return
        const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        const name = (type === 'shabbat_morning' || date.getDay() === 6)
            ? `Shabbat Morning ${formattedDate}`
            : 'New Setlist'
        try {
            const id = await setlistService.createSetlist(name, [], true, {
                eventDate: date.toISOString(),
                templateType: type || undefined
            })
            onSelect({
                id, name, tracks: [], trackCount: 0,
                date: { seconds: Date.now() / 1000, nanoseconds: 0 },
                eventDate: date.toISOString(), ownerId: user.uid, isPublic: false
            })
        } catch {
            toast.error("Failed to create setlist")
        }
    }

    const handleCreateFromTemplate = async (templateType: 'friday_night' | 'shabbat_morning') => {
        if (!setlistService || !user) return

        const targetDate = templateType === 'friday_night' ? getNextFriday() : getNextSaturday()
        const template = getTemplate(templateType)
        if (!template) return

        try {
            toast.loading('Building setlist from template...')

            // Get liturgical context (parasha, holidays)
            const context = await getFullServiceContext(targetDate)
            context.type = templateType

            // Match template slots to library files
            const { allFiles } = useLibraryStore.getState()
            const tracks = buildSetlistFromTemplate(template, allFiles, context)
            const name = generateSetlistName(context)

            const id = await setlistService.createSetlist(name, tracks, true, {
                eventDate: targetDate.toISOString(),
                templateType,
                isTemplate: false,
            })

            toast.dismiss()

            const matched = tracks.filter(t => t.fileId).length
            const total = tracks.filter(t => t.type === 'song').length
            toast.success(`Created "${name}" — ${matched}/${total} songs matched`)

            onSelect({
                id, name, tracks, trackCount: tracks.length,
                date: { seconds: Date.now() / 1000, nanoseconds: 0 },
                eventDate: targetDate.toISOString(), ownerId: user.uid, isPublic: false,
            })
        } catch (err: unknown) {
            toast.dismiss()
            toast.error("Failed to create template setlist: " + (err instanceof Error ? err.message : "Unknown"))
        }
    }

    const handleDownload = async (setlist: Setlist) => {
        if (setlist.tracks && setlist.tracks.length > 0) {
            await downloadSetlist(setlist.tracks)
        } else {
            toast.error("No tracks to download in this setlist")
        }
    }

    const allSetlists = activeTab === 'personal' ? personalSetlists : publicSetlists

    // Compute available rabbis from all setlists
    const availableRabbis = useMemo(() => {
        const rabbis = new Set<string>()
        ;[...personalSetlists, ...publicSetlists].forEach(s => {
            if (s.rabbi) rabbis.add(s.rabbi)
        })
        return Array.from(rabbis).sort()
    }, [personalSetlists, publicSetlists])

    // Apply search and rabbi filter
    const displayedSetlists = useMemo(() => {
        let filtered = allSetlists
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.tracks?.some(t => t.title?.toLowerCase().includes(q))
            )
        }
        if (rabbiFilter) {
            filtered = filtered.filter(s => s.rabbi === rabbiFilter)
        }
        return filtered
    }, [allSetlists, searchQuery, rabbiFilter])

    /* ─── Derived data ─── */

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const getDate = (s: Setlist) => s.eventDate ? toDateHelper(s.eventDate) : null

    const upcoming = displayedSetlists
        .filter(s => { const d = getDate(s); return d && d >= today })
        .sort((a, b) => getDate(a)!.getTime() - getDate(b)!.getTime())

    const pastOrNoDate = displayedSetlists
        .filter(s => { const d = getDate(s); return !d || d < today })

    const placeholders: { date: Date }[] = []
    if (user && activeTab === 'public') {
        for (let i = 0; i < 7; i++) {
            const d = new Date(today)
            d.setDate(today.getDate() + i)
            const exists = publicSetlists.some(s => { const sd = getDate(s); return sd && sd.toDateString() === d.toDateString() })
            if (!exists && d.getDay() === 6) {
                placeholders.push({ date: d })
            }
        }
    }

    const hasUpcoming = upcoming.length > 0 || placeholders.length > 0

    /* ─── Render ─── */

    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            {/* Header */}
            <div className="h-20 border-b border-border flex items-center px-4 gap-4 shrink-0">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <div className="flex items-center gap-3 flex-1">
                    <img src="/logo.jpg" alt={congregation.shortName} className="h-8 w-8 rounded-full border border-border object-cover" />
                    <h1 className="text-2xl font-bold">My Setlists</h1>
                </div>
                {user ? (
                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="gap-2 border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10">
                                    <Sparkles className="h-4 w-4" /> From Template
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => handleCreateFromTemplate('friday_night')}>
                                    <span className="font-medium">This Friday Night</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCreateFromTemplate('shabbat_morning')}>
                                    <span className="font-medium">This Shabbat Morning</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={onCreateNew} className="text-muted-foreground">
                                    Blank Setlist
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button onClick={onCreateNew} className="gap-2 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 px-6">
                            <Plus className="h-5 w-5" /> New
                        </Button>
                    </div>
                ) : (
                    <Button onClick={signIn} size="sm" className="gap-2 bg-blue-600 hover:bg-blue-500">
                        <LogIn className="h-4 w-4" /> Sign In
                    </Button>
                )}
            </div>

            {/* Dialogs */}
            <DeleteSetlistDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen} setlistName={setlistToDelete?.name} onConfirm={confirmDelete} />
            <DuplicateSetlistDialog open={duplicateConfirmOpen} onOpenChange={setDuplicateConfirmOpen} setlistName={setlistToDuplicate?.name} onConfirm={confirmDuplicate} />
            <TransferSetlistDialog open={showTransferDialog} onClose={() => setShowTransferDialog(false)} setlistName={selectedSetlistForTransfer?.name} email={transferEmail} onEmailChange={setTransferEmail} onConfirm={handleTransfer} />

            {/* Tabs & View Toggle */}
            <SetlistToolbar
                activeTab={activeTab} onTabChange={setActiveTab}
                view={view} onViewChange={setView}
                showPersonalTab={!!user}
                searchQuery={searchQuery} onSearchChange={setSearchQuery}
                rabbiFilter={rabbiFilter} onRabbiFilterChange={setRabbiFilter}
                availableRabbis={availableRabbis}
            />

            {view === 'calendar' ? (
                <div className="flex-1 p-6 overflow-hidden">
                    <CalendarView setlists={displayedSetlists} onSelectSetlist={onSelect} onCreateSetlist={handleCreateFromCalendar} />
                </div>
            ) : (
                <ScrollArea className="flex-1 p-6">
                    {!loading && error && (
                        <div className="max-w-md mx-auto mt-20">
                            <ErrorState title="Unable to Load Setlists" description={error} onRetry={() => window.location.reload()} />
                        </div>
                    )}

                    {loading && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl bg-card border border-border" />)}
                        </div>
                    )}

                    {!loading && !error && (
                        <div className="space-y-10">
                            {hasUpcoming && (
                                <section>
                                    <h2 className="text-lg font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Calendar className="h-4 w-4" /> Upcoming Services
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {upcoming.map(setlist => (
                                            <UpcomingSetlistCard key={setlist.id} setlist={setlist} onClick={() => onSelect(setlist)} onDownload={handleDownload} isDownloading={isDownloading} />
                                        ))}
                                        {placeholders.map((p, idx) => (
                                            <PlaceholderCard key={idx} date={p.date} onCreate={handleCreateFromCalendar} />
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section>
                                {hasUpcoming && (
                                    <h2 className="text-lg font-bold text-muted-foreground uppercase tracking-wider mb-4 border-t border-border pt-8">
                                        Library &amp; Past Events
                                    </h2>
                                )}
                                {pastOrNoDate.length === 0 ? (
                                    <div className="text-muted-foreground italic py-10 text-center">No other setlists found.</div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {pastOrNoDate.map(setlist => (
                                            <SetlistCard
                                                key={setlist.id}
                                                setlist={setlist}
                                                onClick={() => onSelect(setlist)}
                                                onDuplicate={handleDuplicateClick}
                                                onDelete={handleDeleteClick}
                                                canDuplicate={!!user}
                                                canDelete={!setlist.isPublic || setlist.ownerId === user?.uid}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}
                </ScrollArea>
            )}

            <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/30 pointer-events-none select-none z-50">
                v{buildInfo.version}
            </div>
        </div>
    )
}

