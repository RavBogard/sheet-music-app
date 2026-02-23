"use client"
import buildInfo from "@/build-info.json"
import { ChevronLeft, Plus, LogIn, Calendar, Sparkles, FolderUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"

import { UpcomingSetlistCard, SetlistCard, PlaceholderCard } from "./SetlistCards"
import { DeleteSetlistDialog, DuplicateSetlistDialog, TransferSetlistDialog } from "./SetlistDialogs"
import { ImporterModal } from "./importer/ImporterModal"
import { SetlistToolbar } from "./SetlistToolbar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { useCongregation } from "@/lib/congregation-store"
import { useSetlistDashboard, type UseSetlistDashboardProps } from "@/hooks/use-setlist-dashboard"
import { SetlistMatrixView } from "./v2/SetlistMatrixView"

// Lazy-load CalendarView — most users stay on list view, so the
// calendar component (+ its date-fns dependencies) can load on demand.
const CalendarView = dynamic(
    () => import("@/components/calendar/CalendarView").then(m => m.CalendarView),
    { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-xl" /> }
)

export function SetlistDashboard(props: UseSetlistDashboardProps) {
    const congregation = useCongregation()

    // Destructure all the state and handlers from our custom hook
    const {
        router, user, signIn, isMember, onBack, onCreateNew,
        loading, error, activeTab, setActiveTab, view, setView,
        searchQuery, setSearchQuery, rabbiFilter, setRabbiFilter, navigatingTo,
        deleteConfirmOpen, setDeleteConfirmOpen, setlistToDelete,
        duplicateConfirmOpen, setDuplicateConfirmOpen, setlistToDuplicate,
        showTransferDialog, setShowTransferDialog,
        showImporterModal, setShowImporterModal,
        selectedSetlistForTransfer, setSelectedSetlistForTransfer,
        transferEmail, setTransferEmail,
        handleSelect, handleDeleteClick, confirmDelete,
        handleDuplicateClick, confirmDuplicate, handleCloneNextWeekClick,
        handleSaveAsTemplateClick, handleTransfer, handleCreateFromCalendar,
        handleCreateFromTemplate, handleDownload,
        availableRabbis, displayedSetlists,
        upcoming, pastOrNoDate, placeholders, hasUpcoming, isDownloading
    } = useSetlistDashboard(props)

    /* ─── Render ─── */
    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            {/* Header */}
            <div className="h-20 border-b border-border flex items-center px-4 gap-4 shrink-0">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack || (() => router.back())}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <div className="flex items-center gap-3 flex-1">
                    <img src="/logo.jpg" alt={congregation.shortName} className="h-8 w-8 rounded-full border border-border object-cover" />
                    <h1 className="text-title">My Setlists</h1>
                </div>
                {user && isMember ? (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="gap-2 hidden md:flex hover:bg-muted"
                            onClick={() => setShowImporterModal(true)}
                        >
                            <FolderUp className="h-4 w-4" /> Import Setlist
                        </Button>
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
                                <DropdownMenuItem onClick={() => setShowImporterModal(true)} className="md:hidden">
                                    <FolderUp className="h-4 w-4 mr-2" /> Import Setlist
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={onCreateNew || (() => router.push('/setlists/new'))} className="text-muted-foreground">
                                    Blank Setlist
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button onClick={onCreateNew || (() => router.push('/setlists/new'))} className="gap-2 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 px-6">
                            <Plus className="h-5 w-5" /> New
                        </Button>
                    </div>
                ) : user ? (
                    <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1.5 rounded-lg">Account pending</span>
                ) : (
                    <Button onClick={signIn} size="sm" className="gap-2 bg-blue-600 hover:bg-blue-500">
                        <LogIn className="h-4 w-4" /> Sign In
                    </Button>
                )}
            </div>

            {/* Dialogs */}
            <ImporterModal open={showImporterModal} onOpenChange={setShowImporterModal} onComplete={(id: string) => router.push(`/setlists/${id}`)} />
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
                    <CalendarView setlists={displayedSetlists} onSelectSetlist={handleSelect} onCreateSetlist={handleCreateFromCalendar} />
                </div>
            ) : view === 'matrix' ? (
                <div className="flex-1 p-6 overflow-hidden">
                    <SetlistMatrixView />
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
                                    <h2 className="text-eyebrow mb-4 flex items-center gap-2">
                                        <Calendar className="h-4 w-4" /> Upcoming Services
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {upcoming.map(setlist => (
                                            <UpcomingSetlistCard
                                                key={setlist.id}
                                                setlist={setlist}
                                                onClick={() => handleSelect(setlist)}
                                                navigatingTo={navigatingTo}
                                                onDownload={handleDownload}
                                                isDownloading={isDownloading}
                                                onDuplicate={handleDuplicateClick}
                                                onCloneNextWeek={handleCloneNextWeekClick}
                                                onSaveAsTemplate={handleSaveAsTemplateClick}
                                                onDelete={handleDeleteClick}
                                                canDuplicate={!!user}
                                                canDelete={!setlist.isPublic || setlist.ownerId === user?.uid}
                                            />
                                        ))}
                                        {placeholders.map((p, idx) => (
                                            <PlaceholderCard key={idx} date={p.date} onCreate={handleCreateFromCalendar} />
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section>
                                {hasUpcoming && (
                                    <h2 className="text-eyebrow mb-4 border-t border-border pt-8">
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
                                                onClick={() => handleSelect(setlist)}
                                                navigatingTo={navigatingTo}
                                                onDuplicate={handleDuplicateClick}
                                                onCloneNextWeek={handleCloneNextWeekClick}
                                                onSaveAsTemplate={handleSaveAsTemplateClick}
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
